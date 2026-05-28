import type { AgentRunParams, AgentRunResult } from '../agent-runner/runner.js'
import type { Issue, Workspace } from '../domain/types.js'
import type { LogContext, LogLevel } from '../observability/logging.js'
import type { WorkspaceBestEffortFailureHandler } from '../workspace/manager.js'
import type { RuntimeState } from './state.js'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { CodexAppServerClient } from '../agent-runner/codex.js'
import { AgentRunner } from '../agent-runner/runner.js'
import { ConfigResolverLive } from '../config/resolve.js'
import { TrackerError, WorkspaceError } from '../domain/errors.js'
import { RuntimeLogger } from '../observability/logging.js'
import { PromptRenderer } from '../prompt/render.js'
import { LinearTransport, TrackerClient } from '../tracker/linear.js'
import { WorkspaceManager } from '../workspace/manager.js'
import { pollTick, reconcileRunning, reconcileStalledRuns, startupTerminalWorkspaceCleanup } from './runtime.js'
import { OrchestratorState, OrchestratorStateLive } from './state.js'
import { config, issue } from './state.test.js'

describe('orchestrator runtime', () => {
  it.effect('dispatches eligible candidates and schedules continuation retry after normal worker exit', () =>
    Effect.gen(function* () {
      const runnerCalls: Array<AgentRunParams> = []

      const snapshot = yield* Effect.gen(function* () {
        yield* pollTick(config, { nowMs: 1000, launchMode: 'inline' })
        const state = yield* OrchestratorState

        return yield* state.snapshot(config, 2000)
      }).pipe(
        Effect.provide(Layer.mergeAll(
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
        )),
      )

      expect(runnerCalls).toHaveLength(1)
      expect(snapshot.retrying[0]).toMatchObject({
        issueId: 'issue-1',
        attempt: 1,
        dueAtMs: 2000,
      })
    }))

  it.effect('cleans the workspace and does not retry when a worker returns a terminal issue', () =>
    Effect.gen(function* () {
      const removed: Array<string> = []
      const snapshot = yield* Effect.gen(function* () {
        yield* pollTick(config, { nowMs: 1000, launchMode: 'inline' })
        const state = yield* OrchestratorState

        return yield* state.snapshot(config, 2000)
      }).pipe(
        Effect.provide(Layer.mergeAll(
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
        )),
      )

      expect(snapshot.running).toEqual([])
      expect(snapshot.retrying).toEqual([])
      expect(removed).toEqual(['SYM-1'])
    }))

  it.effect('keeps terminal running issues until the worker exits so after_run can fire before cleanup', () =>
    Effect.gen(function* () {
      const removed: Array<string> = []
      const snapshot = yield* Effect.gen(function* () {
        const state = yield* OrchestratorState
        yield* state.tryMarkRunning(issue(), config, 1000, null, '/tmp/symphony/SYM-1')
        yield* reconcileRunning(config, 2000)

        return yield* state.snapshot(config, 2000)
      }).pipe(
        Effect.provide(Layer.mergeAll(
          OrchestratorStateLive,
          fakeTracker({
            candidates: [],
            refreshes: [[{ ...issue(), state: 'Done' }]],
          }),
          fakeWorkspace(removed),
          fakeLinear(),
          fakeLogger(),
        )),
      )

      expect(snapshot.running).toHaveLength(1)
      expect(snapshot.running[0]).toMatchObject({
        issue: {
          state: 'Done',
        },
      })
      expect(removed).toEqual([])
    }))

  it.effect('logs running reconciliation refresh failures before preserving best-effort state', () =>
    Effect.gen(function* () {
      const logs: Array<FakeLogEntry> = []
      const snapshot = yield* Effect.gen(function* () {
        const state = yield* OrchestratorState
        yield* state.tryMarkRunning(issue(), config, 1000, null, '/tmp/symphony/SYM-1')
        yield* reconcileRunning(config, 2000)

        return yield* state.snapshot(config, 2000)
      }).pipe(
        Effect.provide(Layer.mergeAll(
          OrchestratorStateLive,
          fakeTracker({
            candidates: [],
            refreshes: [],
            refreshError: trackerFailure('refresh failed'),
          }),
          fakeWorkspace(),
          fakeLinear(),
          fakeLogger(logs),
        )),
      )

      expect(snapshot.running).toHaveLength(1)
      expect(logs).toContainEqual(expect.objectContaining({
        level: 'warn',
        message: 'running_reconciliation_refresh_failed',
        context: expect.objectContaining({
          error_code: 'linear_api_request',
          issue_count: 1,
        }),
      }))
    }))

  it.effect('logs after_run best-effort failures reported by the agent runner', () =>
    Effect.gen(function* () {
      const logs: Array<FakeLogEntry> = []

      yield* pollTick(config, { nowMs: 1000, launchMode: 'inline' }).pipe(
        Effect.provide(Layer.mergeAll(
          ConfigResolverLive,
          OrchestratorStateLive,
          fakeTracker({
            candidates: [issue()],
            refreshes: [],
          }),
          fakeRunner([], {}, {
            afterRunFailure: workspaceFailure('after_run failed', 'after_run'),
          }),
          fakePromptRenderer(),
          fakeCodex(),
          fakeWorkspace(),
          fakeLinear(),
          fakeLogger(logs),
        )),
      )

      expect(logs).toContainEqual(expect.objectContaining({
        level: 'warn',
        message: 'workspace_after_run_failed',
        context: expect.objectContaining({
          error_code: 'hook_failed',
          hook: 'after_run',
          workspace_operation: 'after_run',
        }),
      }))
    }))

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

  it.effect('removes terminal issue workspaces during startup cleanup', () =>
    Effect.gen(function* () {
      const removed: Array<string> = []

      yield* startupTerminalWorkspaceCleanup(config).pipe(
        Effect.provide(Layer.mergeAll(
          fakeTracker({
            candidates: [],
            refreshes: [],
            terminal: [{ ...issue(), state: 'Done' }],
          }),
          fakeWorkspace(removed),
          fakeLinear(),
          fakeLogger(),
        )),
      )

      expect(removed).toEqual(['SYM-1'])
    }))

  it.effect('logs startup cleanup fetch failures without failing startup', () =>
    Effect.gen(function* () {
      const removed: Array<string> = []
      const logs: Array<FakeLogEntry> = []

      yield* startupTerminalWorkspaceCleanup(config).pipe(
        Effect.provide(Layer.mergeAll(
          fakeTracker({
            candidates: [],
            refreshes: [],
            terminalError: trackerFailure('terminal fetch failed'),
          }),
          fakeWorkspace(removed),
          fakeLinear(),
          fakeLogger(logs),
        )),
      )

      expect(removed).toEqual([])
      expect(logs).toContainEqual(expect.objectContaining({
        level: 'warn',
        message: 'startup_terminal_workspace_cleanup_fetch_failed',
        context: expect.objectContaining({
          error_code: 'linear_api_request',
          state_count: config.tracker.terminalStates.length,
        }),
      }))
    }))

  it.effect('logs workspace cleanup failures during startup cleanup without failing startup', () =>
    Effect.gen(function* () {
      const removed: Array<string> = []
      const logs: Array<FakeLogEntry> = []

      yield* startupTerminalWorkspaceCleanup(config).pipe(
        Effect.provide(Layer.mergeAll(
          fakeTracker({
            candidates: [],
            refreshes: [],
            terminal: [{ ...issue(), state: 'Done' }],
          }),
          fakeWorkspace(removed, {
            cleanupFailure: workspaceFailure('before_remove failed', 'before_remove'),
          }),
          fakeLinear(),
          fakeLogger(logs),
        )),
      )

      expect(removed).toEqual(['SYM-1'])
      expect(logs).toContainEqual(expect.objectContaining({
        level: 'warn',
        message: 'workspace_cleanup_failed',
        context: expect.objectContaining({
          error_code: 'hook_failed',
          hook: 'before_remove',
          workspace_operation: 'before_remove',
        }),
      }))
    }))
})

function fakeRunner(
  calls: Array<AgentRunParams>,
  resultOverrides: Partial<AgentRunResult> = {},
  options: { readonly afterRunFailure?: WorkspaceError } = {},
): Layer.Layer<AgentRunner> {
  return Layer.succeed(AgentRunner)({
    runAttempt: params =>
      reportAfterRunFailure(params, options.afterRunFailure).pipe(Effect.andThen(Effect.sync((): AgentRunResult => {
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
      }))),
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
  readonly refreshError?: TrackerError
  readonly terminalError?: TrackerError
}): Layer.Layer<TrackerClient> {
  const refreshes = [...options.refreshes]

  return Layer.succeed(TrackerClient)({
    fetchCandidateIssues: () => Effect.succeed(options.candidates),
    fetchIssuesByStates: () => options.terminalError === undefined
      ? Effect.succeed(options.terminal ?? [])
      : Effect.fail(options.terminalError),
    fetchIssueStatesByIds: () => options.refreshError === undefined
      ? Effect.sync(() => refreshes.shift() ?? [])
      : Effect.fail(options.refreshError),
  })
}

function fakeWorkspace(
  removed: Array<string> = [],
  options: { readonly cleanupFailure?: WorkspaceError } = {},
): Layer.Layer<WorkspaceManager> {
  return Layer.succeed(WorkspaceManager)({
    createForIssue: identifier => Effect.succeed(workspace(identifier)),
    runBeforeRun: () => Effect.succeed(null),
    runAfterRunBestEffort: () => Effect.succeed(null),
    removeForIssueBestEffort: (identifier, _workspace, _hooks, onFailure) =>
      Effect.sync(() => {
        removed.push(identifier)
      }).pipe(
        Effect.andThen(reportWorkspaceCleanupFailure(identifier, options.cleanupFailure, onFailure)),
      ),
    assertContained: (_root, candidate) => Effect.succeed(candidate),
  })
}

function reportAfterRunFailure(
  params: AgentRunParams,
  error: WorkspaceError | undefined,
): Effect.Effect<unknown> {
  if (error === undefined || params.onWorkspaceBestEffortFailure === undefined) {
    return Effect.void
  }

  return params.onWorkspaceBestEffortFailure({
    operation: 'after_run',
    workspacePath: workspace(params.issue.identifier).path,
    error,
  })
}

function reportWorkspaceCleanupFailure(
  identifier: string,
  error: WorkspaceError | undefined,
  onFailure?: WorkspaceBestEffortFailureHandler,
): Effect.Effect<unknown> {
  if (error === undefined || onFailure === undefined) {
    return Effect.void
  }

  return onFailure({
    operation: 'before_remove',
    issueIdentifier: identifier,
    workspacePath: workspace(identifier).path,
    error,
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

interface FakeLogEntry {
  readonly level: LogLevel
  readonly message: string
  readonly context?: LogContext
}

function fakeLogger(entries: Array<FakeLogEntry> = []): Layer.Layer<RuntimeLogger> {
  const record = (level: LogLevel, message: string, context?: LogContext) =>
    Effect.sync(() => {
      entries.push({ level, message, context })
    })

  return Layer.succeed(RuntimeLogger)({
    log: record,
    info: (message, context) => record('info', message, context),
    warn: (message, context) => record('warn', message, context),
    error: (message, context) => record('error', message, context),
  })
}

function trackerFailure(reason: string): TrackerError {
  return new TrackerError({
    code: 'linear_api_request',
    operation: 'test',
    reason,
  })
}

function workspaceFailure(reason: string, hook: string): WorkspaceError {
  return new WorkspaceError({
    code: 'hook_failed',
    path: '/tmp/symphony/SYM-1',
    reason,
    hook,
  })
}
