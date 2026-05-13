import type { Issue, ServiceConfig } from '../domain/types.js'
import type { CodexRunParams, CodexRunResult } from './codex.js'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { runEffect } from '../../tests/support/effect.js'
import { createFakeWorkspace } from '../../tests/support/fakes/workspace.js'
import { PromptRendererLive } from '../prompt/render.js'
import { LinearTransport, TrackerClient } from '../tracker/linear.js'
import { WorkspaceManagerLive } from '../workspace/manager.js'
import { CodexAppServerClient } from './codex.js'
import { AgentRunner, AgentRunnerLive, runAttempt } from './runner.js'

const issue: Issue = {
  id: 'issue-1',
  identifier: 'SYM-1',
  title: 'Implement runtime',
  description: null,
  priority: 1,
  state: 'Todo',
  branchName: null,
  url: null,
  labels: [],
  blockedBy: [],
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:01:00.000Z',
}

describe('agentRunner', () => {
  it('creates a workspace, renders the prompt, launches Codex from that workspace, and runs after_run', async () => {
    const root = await createFakeWorkspace()
    const codexRuns: Array<CodexRunParams> = []

    try {
      const config = configForRoot(root.path, {
        promptTemplate: 'Handle {{ issue.identifier }}',
        afterRun: 'printf after_run > after.log',
      })
      const result = await runEffect(runAttempt({
        issue,
        attempt: null,
        config,
      }), {
        layer: Layer.mergeAll(
          WorkspaceManagerLive,
          PromptRendererLive,
          fakeCodex(codexRuns),
          fakeTracker([{ ...issue, state: 'Done' }]),
          fakeLinear(),
        ),
      })

      expect(result.workspace.path).toBe(join(root.path, 'SYM-1'))
      expect(result.session.sessionId).toBe('thread-1-turn-1')
      expect(codexRuns[0]).toMatchObject({
        cwd: join(root.path, 'SYM-1'),
        workspacePath: join(root.path, 'SYM-1'),
        prompt: 'Handle SYM-1',
      })
      await expect(readFile(join(root.path, 'SYM-1', 'after.log'), 'utf8')).resolves.toBe('after_run')
    }
    finally {
      await root.cleanup()
    }
  })

  it('continues on the same thread while the issue remains active up to max_turns', async () => {
    const root = await createFakeWorkspace()
    const codexRuns: Array<CodexRunParams> = []

    try {
      await mkdir(join(root.path, 'SYM-1'), { recursive: true })
      const result = await runEffect(runAttempt({
        issue,
        attempt: 1,
        config: {
          ...configForRoot(root.path),
          agent: {
            ...configForRoot(root.path).agent,
            maxTurns: 2,
          },
        },
      }), {
        layer: Layer.mergeAll(
          WorkspaceManagerLive,
          PromptRendererLive,
          fakeCodex(codexRuns),
          fakeTracker([
            { ...issue, state: 'Todo' },
            { ...issue, state: 'Done' },
          ]),
          fakeLinear(),
        ),
      })

      expect(result.turns).toBe(2)
      expect(codexRuns).toHaveLength(2)
      expect(codexRuns[1]?.threadId).toBe('thread-1')
      expect(codexRuns[1]?.prompt).toContain('Continue working on SYM-1')
    }
    finally {
      await root.cleanup()
    }
  })

  it('is available through the AgentRunner service layer', async () => {
    const root = await createFakeWorkspace()

    try {
      const result = await runEffect(
        Effect.gen(function* () {
          const runner = yield* AgentRunner

          return yield* runner.runAttempt({
            issue,
            attempt: null,
            config: configForRoot(root.path),
          })
        }),
        {
          layer: Layer.mergeAll(
            AgentRunnerLive,
            WorkspaceManagerLive,
            PromptRendererLive,
            fakeCodex([]),
            fakeTracker([{ ...issue, state: 'Done' }]),
            fakeLinear(),
          ),
        },
      )

      expect(result.session.sessionId).toBe('thread-1-turn-1')
    }
    finally {
      await root.cleanup()
    }
  })
})

function configForRoot(
  root: string,
  overrides: { readonly promptTemplate?: string, readonly afterRun?: string | null } = {},
): ServiceConfig {
  return {
    workflowPath: '/repo/WORKFLOW.md',
    workflowDirectory: '/repo',
    promptTemplate: overrides.promptTemplate ?? 'Prompt',
    tracker: {
      kind: 'linear',
      endpoint: 'https://linear.example/graphql',
      apiKey: 'linear-secret',
      projectSlug: 'symphony',
      activeStates: ['Todo', 'In Progress'],
      terminalStates: ['Done'],
    },
    polling: { intervalMs: 30000 },
    workspace: { root },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: overrides.afterRun ?? null,
      beforeRemove: null,
      timeoutMs: 60000,
    },
    agent: {
      maxConcurrentAgents: 10,
      maxTurns: 20,
      maxRetryBackoffMs: 300000,
      maxConcurrentAgentsByState: new Map(),
    },
    codex: {
      command: 'codex app-server',
      approvalPolicy: null,
      threadSandbox: null,
      turnSandboxPolicy: null,
      turnTimeoutMs: 3600000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 300000,
    },
  }
}

function fakeCodex(calls: Array<CodexRunParams>): Layer.Layer<CodexAppServerClient> {
  return Layer.succeed(CodexAppServerClient)({
    runTurn: params =>
      Effect.sync((): CodexRunResult => {
        calls.push(params)

        return {
          sessionId: `thread-1-turn-${params.turnNumber}`,
          threadId: 'thread-1',
          turnId: `turn-${params.turnNumber}`,
          turnCount: params.turnNumber,
          usage: {
            inputTokens: params.turnNumber,
            outputTokens: params.turnNumber,
            totalTokens: params.turnNumber * 2,
          },
          rateLimits: null,
        }
      }),
  })
}

function fakeTracker(refreshedIssues: ReadonlyArray<Issue>): Layer.Layer<TrackerClient> {
  const queue = [...refreshedIssues]

  return Layer.succeed(TrackerClient)({
    fetchCandidateIssues: () => Effect.succeed([]),
    fetchIssuesByStates: () => Effect.succeed([]),
    fetchIssueStatesByIds: () => Effect.sync(() => {
      const next = queue.shift()

      return next === undefined ? [] : [next]
    }),
  })
}

function fakeLinear(): Layer.Layer<LinearTransport> {
  return Layer.succeed(LinearTransport)({
    execute: () => Effect.die(new Error('linear transport should not be called by these runner tests')),
  })
}
