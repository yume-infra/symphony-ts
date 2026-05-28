import type { Issue, ServiceConfig } from '../domain/types.js'
import type { CodexRunParams, CodexRunResult } from './codex.js'
import { join } from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { describe, expect, it } from '@effect/vitest'
import { Effect, FileSystem, Layer } from 'effect'
import { withFakeWorkspace } from '../../tests/support/fakes/workspace.js'
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
  stateType: null,
  branchName: null,
  url: null,
  labels: [],
  blockedBy: [],
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:01:00.000Z',
}

describe('agentRunner', () => {
  it.effect('creates a workspace, renders the prompt, launches Codex from that workspace, and runs after_run', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const codexRuns: Array<CodexRunParams> = []
        const config = configForRoot(root.path, {
          promptTemplate: 'Handle {{ issue.identifier }}',
          afterRun: 'printf after_run > after.log',
        })
        const result = yield* runAttempt({
          issue,
          attempt: null,
          config,
        }).pipe(
          Effect.provide(runnerTestLayer(codexRuns, [{ ...issue, state: 'Done' }])),
        )

        expect(result.workspace.path).toBe(join(root.path, 'SYM-1'))
        expect(result.session.sessionId).toBe('thread-1-turn-1')
        expect(result.issue.state).toBe('Done')
        expect(codexRuns[0]).toMatchObject({
          cwd: join(root.path, 'SYM-1'),
          workspacePath: join(root.path, 'SYM-1'),
          prompt: 'Handle SYM-1',
        })
        const afterRunOutput = yield* fs.readFileString(join(root.path, 'SYM-1', 'after.log'))
        expect(afterRunOutput).toBe('after_run')
      })).pipe(Effect.provide(NodeServices.layer)))

  it.effect('continues on the same thread while the issue remains active up to max_turns', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const codexRuns: Array<CodexRunParams> = []
        yield* fs.makeDirectory(join(root.path, 'SYM-1'), { recursive: true })

        const baseConfig = configForRoot(root.path)
        const result = yield* runAttempt({
          issue,
          attempt: 1,
          config: {
            ...baseConfig,
            agent: {
              ...baseConfig.agent,
              maxTurns: 2,
            },
          },
        }).pipe(
          Effect.provide(runnerTestLayer(codexRuns, [
            { ...issue, state: 'Todo' },
            { ...issue, state: 'Done' },
          ])),
        )

        expect(result.turns).toBe(2)
        expect(codexRuns).toHaveLength(2)
        expect(codexRuns[1]?.threadId).toBe('thread-1')
        expect(codexRuns[1]?.prompt).toContain('Continue working on SYM-1')
      })).pipe(Effect.provide(NodeServices.layer)))

  it.effect('is available through the AgentRunner service layer', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const runner = yield* AgentRunner

        const result = yield* runner.runAttempt({
          issue,
          attempt: null,
          config: configForRoot(root.path),
        })

        expect(result.session.sessionId).toBe('thread-1-turn-1')
      }).pipe(
        Effect.provide(Layer.merge(AgentRunnerLive, runnerTestLayer([], [{ ...issue, state: 'Done' }]))),
      )).pipe(Effect.provide(NodeServices.layer)))
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

function runnerTestLayer(
  codexCalls: Array<CodexRunParams>,
  refreshedIssues: ReadonlyArray<Issue>,
) {
  return Layer.mergeAll(
    WorkspaceManagerLive,
    PromptRendererLive,
    fakeCodex(codexCalls),
    fakeTracker(refreshedIssues),
    fakeLinear(),
  )
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
