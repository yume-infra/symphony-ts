import type { AgentRunParams, AgentRunResult } from '../agent-runner/runner.js'
import type { Issue, Workspace } from '../domain/types.js'
import type { RuntimeState } from './state.js'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { runEffect } from '../../tests/support/effect.js'
import { CodexAppServerClient } from '../agent-runner/codex.js'
import { AgentRunner } from '../agent-runner/runner.js'
import { ConfigResolverLive } from '../config/resolve.js'
import { RuntimeLogger } from '../observability/logging.js'
import { PromptRenderer } from '../prompt/render.js'
import { LinearTransport, TrackerClient } from '../tracker/linear.js'
import { WorkspaceManager } from '../workspace/manager.js'
import { pollTick, reconcileRunning, reconcileStalledRuns, startupTerminalWorkspaceCleanup } from './runtime.js'
import { OrchestratorState, OrchestratorStateLive } from './state.js'
import { config, issue } from './state.test.js'

describe('orchestrator runtime', () => {
  it('dispatches eligible candidates and schedules continuation retry after normal worker exit', async () => {
    const runnerCalls: Array<AgentRunParams> = []

    const snapshot = await runEffect(Effect.gen(function* () {
      yield* pollTick(config, { nowMs: 1000, launchMode: 'inline' })
      const state = yield* OrchestratorState

      return yield* state.snapshot(config, 2000)
    }), {
      layer: Layer.mergeAll(
        ConfigResolverLive,
        OrchestratorStateLive,
        fakeTracker({
          candidates: [issue()],
          refreshes: [[{ ...issue(), state: 'Done' }]],
        }),
        fakeRunner(runnerCalls),
        fakePromptRenderer(),
        fakeCodex(),
        fakeWorkspace(),
        fakeLinear(),
        fakeLogger(),
      ),
    })

    expect(runnerCalls).toHaveLength(1)
    expect(snapshot.retrying[0]).toMatchObject({
      issueId: 'issue-1',
      attempt: 1,
      dueAtMs: 2000,
    })
  })

  it('cleans the workspace and does not retry when a worker returns a terminal issue', async () => {
    const removed: Array<string> = []
    const snapshot = await runEffect(Effect.gen(function* () {
      yield* pollTick(config, { nowMs: 1000, launchMode: 'inline' })
      const state = yield* OrchestratorState

      return yield* state.snapshot(config, 2000)
    }), {
      layer: Layer.mergeAll(
        ConfigResolverLive,
        OrchestratorStateLive,
        fakeTracker({
          candidates: [issue()],
          refreshes: [],
        }),
        fakeRunner([], { issue: { ...issue(), state: 'Done' } }),
        fakePromptRenderer(),
        fakeCodex(),
        fakeWorkspace(removed),
        fakeLinear(),
        fakeLogger(),
      ),
    })

    expect(snapshot.running).toEqual([])
    expect(snapshot.retrying).toEqual([])
    expect(removed).toEqual(['SYM-1'])
  })

  it('keeps terminal running issues until the worker exits so after_run can fire before cleanup', async () => {
    const removed: Array<string> = []
    const snapshot = await runEffect(Effect.gen(function* () {
      const state = yield* OrchestratorState
      yield* state.tryMarkRunning(issue(), config, 1000, null, '/tmp/symphony/SYM-1')
      yield* reconcileRunning(config, 2000)

      return yield* state.snapshot(config, 2000)
    }), {
      layer: Layer.mergeAll(
        OrchestratorStateLive,
        fakeTracker({
          candidates: [],
          refreshes: [[{ ...issue(), state: 'Done' }]],
        }),
        fakeWorkspace(removed),
        fakeLinear(),
        fakeLogger(),
      ),
    })

    expect(snapshot.running).toHaveLength(1)
    expect(snapshot.running[0]).toMatchObject({
      issue: {
        state: 'Done',
      },
    })
    expect(removed).toEqual([])
  })

  it('detects stalled workers and schedules retry', () => {
    const initial: RuntimeState = {
      running: new Map([[
        'issue-1',
        {
          issue: issue(),
          attempt: null,
          startedAtMs: 0,
          workspacePath: '/tmp/symphony/SYM-1',
          session: null,
        },
      ]]),
      claimed: new Set(['issue-1']),
      retryAttempts: new Map(),
      completed: new Set<string>(),
      codexTotals: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        secondsRunning: 0,
      },
      rateLimits: null,
    }

    const reconciled = reconcileStalledRuns(initial, {
      ...config,
      codex: {
        ...config.codex,
        stallTimeoutMs: 1000,
      },
    }, 2001)

    expect(reconciled.running.size).toBe(0)
    expect(reconciled.retryAttempts.get('issue-1')).toMatchObject({
      attempt: 1,
      error: 'worker stalled',
    })
  })

  it('removes terminal issue workspaces during startup cleanup', async () => {
    const removed: Array<string> = []

    await runEffect(startupTerminalWorkspaceCleanup(config), {
      layer: Layer.mergeAll(
        fakeTracker({
          candidates: [],
          refreshes: [],
          terminal: [{ ...issue(), state: 'Done' }],
        }),
        fakeWorkspace(removed),
        fakeLinear(),
      ),
    })

    expect(removed).toEqual(['SYM-1'])
  })
})

function fakeRunner(
  calls: Array<AgentRunParams>,
  resultOverrides: Partial<AgentRunResult> = {},
): Layer.Layer<AgentRunner> {
  return Layer.succeed(AgentRunner)({
    runAttempt: params =>
      Effect.sync((): AgentRunResult => {
        calls.push(params)

        return {
          issue: params.issue,
          workspace: {
            path: '/tmp/symphony/SYM-1',
            workspaceKey: 'SYM-1',
            createdNow: false,
          },
          session: {
            sessionId: 'thread-1-turn-1',
            threadId: 'thread-1',
            turnId: 'turn-1',
            turnCount: 1,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
            rateLimits: null,
          },
          turns: 1,
          ...resultOverrides,
        }
      }),
  })
}

function fakePromptRenderer(): Layer.Layer<PromptRenderer> {
  return Layer.succeed(PromptRenderer)({
    render: () => Effect.die(new Error('prompt renderer should not be called by orchestrator runtime tests')),
  })
}

function fakeCodex(): Layer.Layer<CodexAppServerClient> {
  return Layer.succeed(CodexAppServerClient)({
    runTurn: () => Effect.die(new Error('codex client should not be called by orchestrator runtime tests')),
  })
}

function fakeTracker(options: {
  readonly candidates: ReadonlyArray<Issue>
  readonly refreshes: ReadonlyArray<ReadonlyArray<Issue>>
  readonly terminal?: ReadonlyArray<Issue>
}): Layer.Layer<TrackerClient> {
  const refreshes = [...options.refreshes]

  return Layer.succeed(TrackerClient)({
    fetchCandidateIssues: () => Effect.succeed(options.candidates),
    fetchIssuesByStates: () => Effect.succeed(options.terminal ?? []),
    fetchIssueStatesByIds: () => Effect.sync(() => refreshes.shift() ?? []),
  })
}

function fakeWorkspace(removed: Array<string> = []): Layer.Layer<WorkspaceManager> {
  return Layer.succeed(WorkspaceManager)({
    createForIssue: identifier => Effect.succeed(workspace(identifier)),
    runBeforeRun: () => Effect.succeed(null),
    runAfterRunBestEffort: () => Effect.succeed(null),
    removeForIssueBestEffort: identifier => Effect.sync(() => {
      removed.push(identifier)
    }),
    assertContained: (_root, candidate) => Effect.succeed(candidate),
  })
}

function workspace(identifier: string): Workspace {
  return {
    path: `/tmp/symphony/${identifier}`,
    workspaceKey: identifier,
    createdNow: false,
  }
}

function fakeLinear(): Layer.Layer<LinearTransport> {
  return Layer.succeed(LinearTransport)({
    execute: () => Effect.die(new Error('linear transport should not be called by orchestrator runtime tests')),
  })
}

function fakeLogger(): Layer.Layer<RuntimeLogger> {
  const noop = () => Effect.void

  return Layer.succeed(RuntimeLogger)({
    log: noop,
    info: noop,
    warn: noop,
    error: noop,
  })
}
