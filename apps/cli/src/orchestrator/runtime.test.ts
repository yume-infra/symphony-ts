import type { AgentRunParams, AgentRunResult } from '../agent-runner/runner.js'
import type { Issue, Workspace } from '../domain/types.js'
import type { LogContext, LogLevel } from '../observability/logging.js'
import type { RunEvidenceAttemptInput } from '../run-evidence/service.js'
import type { WorkspaceBestEffortFailureHandler } from '../workspace/manager.js'
import type { OrchestratorStateShape, RuntimeState } from './state.js'
import { join } from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { describe, expect, it } from '@effect/vitest'
import { Deferred, Effect, Layer } from 'effect'
import { withFakeWorkspace } from '../../tests/support/fakes/workspace.js'
import { CodexAppServerClient } from '../agent-runner/codex.js'
import { AgentRunner } from '../agent-runner/runner.js'
import { ConfigResolverLive } from '../config/resolve.js'
import { RunEvidenceError, TrackerError, WorkspaceError } from '../domain/errors.js'
import { RuntimeLogger } from '../observability/logging.js'
import { PromptRenderer } from '../prompt/render.js'
import { readCleanupHold, writeCleanupHold } from '../run-evidence/cleanup-hold.js'
import { buildRunSummary, RunEvidenceService } from '../run-evidence/service.js'
import { LinearTransport, TrackerClient } from '../tracker/linear.js'
import { WorkspaceManager, workspacePathFor } from '../workspace/manager.js'
import { AttemptCompletionServiceLive } from './attempt-completion.js'
import { pollTick, reconcileRunning, reconcileStalledRuns, startupTerminalWorkspaceCleanup } from './runtime.js'
import { initialRuntimeState, OrchestratorState, OrchestratorStateLive, scheduleRetryInState } from './state.js'
import { config, issue } from './state.test.js'
import { WorkerSupervisorLive } from './worker-supervisor.js'

interface RuntimeTestLayers {
  readonly tracker: Layer.Layer<TrackerClient>
  readonly runner: Layer.Layer<AgentRunner>
  readonly workspace?: Layer.Layer<WorkspaceManager>
  readonly prompt?: Layer.Layer<PromptRenderer>
  readonly codex?: Layer.Layer<CodexAppServerClient>
  readonly logger?: Layer.Layer<RuntimeLogger>
  readonly evidence?: Layer.Layer<RunEvidenceService>
  readonly linear?: Layer.Layer<LinearTransport>
  readonly state?: Layer.Layer<OrchestratorState>
}

function runtimeLayers({
  tracker,
  runner,
  workspace = fakeWorkspace(),
  prompt = fakePromptRenderer(),
  codex = fakeCodex(),
  logger = fakeLogger(),
  evidence = fakeEvidence(),
  linear = fakeLinear(),
  state = OrchestratorStateLive,
}: RuntimeTestLayers) {
  return Layer.mergeAll(
    ConfigResolverLive,
    state,
    WorkerSupervisorLive,
    AttemptCompletionServiceLive,
    tracker,
    runner,
    prompt,
    codex,
    workspace,
    linear,
    logger,
    evidence,
  )
}

function awaitDeferred<A>(deferred: Deferred.Deferred<A>, step: string) {
  return Deferred.await(deferred).pipe(
    Effect.timeoutOrElse({
      duration: 2000,
      orElse: () => Effect.fail({ _tag: 'timed_out' as const, step }),
    }),
  )
}

function awaitStep<A, E, R>(effect: Effect.Effect<A, E, R>, step: string) {
  return effect.pipe(
    Effect.timeoutOrElse({
      duration: 2000,
      orElse: () => Effect.fail({ _tag: 'timed_out' as const, step }),
    }),
  )
}

describe('orchestrator runtime', () => {
  it.effect('dispatches eligible candidates and schedules continuation retry after normal worker exit', () =>
    Effect.gen(function* () {
      const runnerCalls: Array<AgentRunParams> = []

      const snapshot = yield* Effect.gen(function* () {
        yield* pollTick(config, { nowMs: 1000, launchMode: 'inline' })
        const state = yield* OrchestratorState

        return yield* state.snapshot(config, 2000)
      }).pipe(
        Effect.provide(runtimeLayers({
          tracker: fakeTracker({
            candidates: [issue()],
            refreshes: [[{ ...issue(), state: 'Done' }]],
          }),
          runner: fakeRunner(runnerCalls),
        })),
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
        Effect.provide(runtimeLayers({
          tracker: fakeTracker({
            candidates: [issue()],
            refreshes: [],
          }),
          runner: fakeRunner([], { issue: { ...issue(), state: 'Done' } }),
          workspace: fakeWorkspace(removed),
        })),
      )

      expect(snapshot.running).toEqual([])
      expect(snapshot.retrying).toEqual([])
      expect(removed).toEqual(['SYM-1'])
    }))

  it.effect('keeps terminal workspaces when run evidence writing fails', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const workspaceRoot = join(root.path, 'workspaces')
        const testConfig = {
          ...config,
          workspace: { root: workspaceRoot },
        }
        const workspacePath = workspacePathFor(workspaceRoot, 'SYM-1')
        const removed: Array<string> = []
        const logs: Array<FakeLogEntry> = []
        const snapshot = yield* Effect.gen(function* () {
          yield* pollTick(testConfig, { nowMs: 1000, launchMode: 'inline' })
          const state = yield* OrchestratorState

          return yield* state.snapshot(testConfig, 2000)
        }).pipe(
          Effect.provide(runtimeLayers({
            tracker: fakeTracker({
              candidates: [issue()],
              refreshes: [],
            }),
            runner: fakeRunner([], {
              issue: { ...issue(), state: 'Done' },
              workspace: workspace('SYM-1', workspaceRoot),
            }),
            workspace: fakeWorkspace(removed, { root: workspaceRoot }),
            logger: fakeLogger(logs),
            evidence: fakeEvidence({ fail: true }),
          })),
        )
        const hold = yield* readCleanupHold(workspacePath)

        expect(snapshot.running).toEqual([])
        expect(snapshot.retrying).toEqual([])
        expect(removed).toEqual([])
        expect(hold).toMatchObject({
          issueIdentifier: 'SYM-1',
          attempt: 1,
          reason: 'terminal cleanup skipped because run evidence was not written',
          workspacePath,
        })
        expect(logs).toContainEqual(expect.objectContaining({
          level: 'warn',
          message: 'run_evidence_write_failed',
          context: expect.objectContaining({
            error_code: 'evidence_write_failed',
            issue_identifier: 'SYM-1',
          }),
        }))
        expect(logs).toContainEqual(expect.objectContaining({
          level: 'warn',
          message: 'workspace_cleanup_skipped',
          context: expect.objectContaining({
            issue_identifier: 'SYM-1',
            reason: 'run evidence was not written',
          }),
        }))
      }), 'symphony-runtime-evidence-failure-').pipe(Effect.provide(NodeServices.layer)))

  it.effect('interrupts owned workers when a refreshed issue becomes terminal and cleans after evidence', () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const finalized = yield* Deferred.make<void>()
      const evidenceStarted = yield* Deferred.make<void>()
      const releaseEvidence = yield* Deferred.make<void>()
      const evidenceWritten = yield* Deferred.make<void>()
      const cleanupCompleted = yield* Deferred.make<void>()
      const evidenceInputs: Array<RunEvidenceAttemptInput> = []
      const removed: Array<string> = []
      const snapshots = yield* Effect.gen(function* () {
        yield* awaitStep(pollTick(config, { nowMs: 1000, launchMode: 'fork' }), 'poll_tick')
        yield* awaitDeferred(started, 'worker_started')
        yield* awaitStep(reconcileRunning(config, 2000), 'reconcile_running')
        const state = yield* OrchestratorState
        const afterReconcile = yield* state.snapshot(config, 2050)
        yield* awaitDeferred(evidenceStarted, 'evidence_started')
        const removedBeforeEvidenceRelease = [...removed]
        yield* Deferred.succeed(releaseEvidence, void 0)
        yield* awaitDeferred(finalized, 'worker_finalized')
        yield* awaitDeferred(evidenceWritten, 'evidence_written')
        yield* awaitDeferred(cleanupCompleted, 'cleanup_completed')

        return {
          afterReconcile,
          removedBeforeEvidenceRelease,
          final: yield* state.snapshot(config, 2100),
        }
      }).pipe(
        Effect.provide(runtimeLayers({
          tracker: fakeTracker({
            candidates: [issue()],
            refreshes: [[{ ...issue(), state: 'Done' }]],
          }),
          runner: fakeStallingRunner(started, finalized),
          workspace: fakeWorkspace(removed, {
            onRemove: Deferred.succeed(cleanupCompleted, void 0),
          }),
          evidence: fakeEvidence({
            inputs: evidenceInputs,
            onWrite: Deferred.succeed(evidenceStarted, void 0).pipe(
              Effect.andThen(Deferred.await(releaseEvidence)),
              Effect.andThen(Deferred.succeed(evidenceWritten, void 0)),
            ),
          }),
        })),
      )

      expect(snapshots.afterReconcile.running).toEqual([])
      expect(snapshots.afterReconcile.retrying).toEqual([])
      expect(snapshots.removedBeforeEvidenceRelease).toEqual([])
      expect(snapshots.final.running).toEqual([])
      expect(snapshots.final.retrying).toEqual([])
      expect(removed).toEqual(['SYM-1'])
      expect(evidenceInputs).toHaveLength(1)
      expect(evidenceInputs[0]?.issue).toMatchObject({
        state: 'Done',
      })
      expect(buildRunSummary(evidenceInputs[0]!)).toMatchObject({
        workspace: {
          cleanup: {
            outcome: 'planned',
          },
        },
        lifecycle: {
          exit: {
            classification: 'interruption',
          },
        },
      })
    }))

  it.effect('lets terminal refresh win over stale timeout in the same reconciliation tick', () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const finalized = yield* Deferred.make<void>()
      const evidenceWritten = yield* Deferred.make<void>()
      const cleanupCompleted = yield* Deferred.make<void>()
      const evidenceInputs: Array<RunEvidenceAttemptInput> = []
      const removed: Array<string> = []
      const stallConfig = {
        ...config,
        codex: {
          ...config.codex,
          stallTimeoutMs: 1000,
        },
      }
      const snapshot = yield* Effect.gen(function* () {
        yield* awaitStep(pollTick(stallConfig, { nowMs: 1000, launchMode: 'fork' }), 'poll_tick')
        yield* awaitDeferred(started, 'worker_started')
        yield* awaitStep(reconcileRunning(stallConfig, 2501), 'reconcile_running')
        yield* awaitDeferred(finalized, 'worker_finalized')
        yield* awaitDeferred(evidenceWritten, 'evidence_written')
        yield* awaitDeferred(cleanupCompleted, 'cleanup_completed')
        const state = yield* OrchestratorState

        return yield* state.snapshot(stallConfig, 2600)
      }).pipe(
        Effect.provide(runtimeLayers({
          tracker: fakeTracker({
            candidates: [issue()],
            refreshes: [[{ ...issue(), state: 'Done' }]],
          }),
          runner: fakeStallingRunner(started, finalized),
          workspace: fakeWorkspace(removed, {
            onRemove: Deferred.succeed(cleanupCompleted, void 0),
          }),
          evidence: fakeEvidence({
            inputs: evidenceInputs,
            onWrite: Deferred.succeed(evidenceWritten, void 0),
          }),
        })),
      )

      expect(snapshot.running).toEqual([])
      expect(snapshot.retrying).toEqual([])
      expect(removed).toEqual(['SYM-1'])
      expect(evidenceInputs).toHaveLength(1)
      expect(evidenceInputs[0]?.issue).toMatchObject({
        state: 'Done',
      })
      expect(buildRunSummary(evidenceInputs[0]!)).toMatchObject({
        lifecycle: {
          exit: {
            classification: 'interruption',
          },
        },
      })
    }))

  it.effect('writes a cleanup hold when terminal cancellation evidence fails', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const workspaceRoot = join(root.path, 'workspaces')
        const testConfig = {
          ...config,
          workspace: { root: workspaceRoot },
        }
        const workspacePath = workspacePathFor(workspaceRoot, 'SYM-1')
        const started = yield* Deferred.make<void>()
        const finalized = yield* Deferred.make<void>()
        const evidenceStarted = yield* Deferred.make<void>()
        const releaseEvidence = yield* Deferred.make<void>()
        const evidenceAttempted = yield* Deferred.make<void>()
        const cleanupSkippedLogged = yield* Deferred.make<void>()
        const evidenceInputs: Array<RunEvidenceAttemptInput> = []
        const removed: Array<string> = []
        const logs: Array<FakeLogEntry> = []

        const snapshots = yield* Effect.gen(function* () {
          yield* awaitStep(pollTick(testConfig, { nowMs: 1000, launchMode: 'fork' }), 'poll_tick')
          yield* awaitDeferred(started, 'worker_started')
          yield* awaitStep(reconcileRunning(testConfig, 2000), 'reconcile_running')
          const state = yield* OrchestratorState
          const afterReconcile = yield* state.snapshot(testConfig, 2050)
          yield* awaitDeferred(evidenceStarted, 'evidence_started')
          const removedBeforeEvidenceRelease = [...removed]
          yield* Deferred.succeed(releaseEvidence, void 0)
          yield* awaitDeferred(finalized, 'worker_finalized')
          yield* awaitDeferred(evidenceAttempted, 'evidence_attempted')
          yield* awaitDeferred(cleanupSkippedLogged, 'cleanup_skipped_logged')

          return {
            afterReconcile,
            removedBeforeEvidenceRelease,
            final: yield* state.snapshot(testConfig, 2100),
          }
        }).pipe(
          Effect.provide(runtimeLayers({
            tracker: fakeTracker({
              candidates: [issue()],
              refreshes: [[{ ...issue(), state: 'Done' }]],
            }),
            runner: fakeStallingRunner(started, finalized),
            workspace: fakeWorkspace(removed, { root: workspaceRoot }),
            logger: fakeLogger(logs, {
              onMessage: entry => entry.message === 'workspace_cleanup_skipped'
                ? Deferred.succeed(cleanupSkippedLogged, void 0)
                : Effect.void,
            }),
            evidence: fakeEvidence({
              fail: true,
              inputs: evidenceInputs,
              onWrite: Deferred.succeed(evidenceStarted, void 0).pipe(
                Effect.andThen(Deferred.await(releaseEvidence)),
                Effect.andThen(Deferred.succeed(evidenceAttempted, void 0)),
              ),
            }),
          })),
        )
        const hold = yield* readCleanupHold(workspacePath)

        expect(snapshots.afterReconcile.running).toEqual([])
        expect(snapshots.afterReconcile.retrying).toEqual([])
        expect(snapshots.removedBeforeEvidenceRelease).toEqual([])
        expect(snapshots.final.running).toEqual([])
        expect(snapshots.final.retrying).toEqual([])
        expect(removed).toEqual([])
        expect(evidenceInputs).toHaveLength(1)
        expect(hold).toMatchObject({
          issueIdentifier: 'SYM-1',
          attempt: 1,
          reason: 'terminal cleanup skipped because run evidence was not written',
          workspacePath,
        })
        expect(logs).toContainEqual(expect.objectContaining({
          level: 'warn',
          message: 'run_evidence_write_failed',
          context: expect.objectContaining({
            issue_identifier: 'SYM-1',
          }),
        }))
      }), 'symphony-runtime-terminal-hold-').pipe(Effect.provide(NodeServices.layer)))

  it.effect('logs running reconciliation refresh failures before preserving best-effort state', () =>
    Effect.gen(function* () {
      const logs: Array<FakeLogEntry> = []
      const snapshot = yield* Effect.gen(function* () {
        const state = yield* OrchestratorState
        yield* state.tryMarkRunning(issue(), config, 1000, null, '/tmp/symphony/SYM-1', {
          issueId: 'issue-1',
          issueIdentifier: 'SYM-1',
          attempt: null,
          attemptId: 'attempt-current',
          workspacePath: '/tmp/symphony/SYM-1',
          startedAtMs: 1000,
        })
        yield* reconcileRunning(config, 2000)

        return yield* state.snapshot(config, 2000)
      }).pipe(
        Effect.provide(runtimeLayers({
          tracker: fakeTracker({
            candidates: [],
            refreshes: [],
            refreshError: trackerFailure('refresh failed'),
          }),
          runner: fakeRunner([]),
          workspace: fakeWorkspace(),
          logger: fakeLogger(logs),
        })),
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
        Effect.provide(runtimeLayers({
          tracker: fakeTracker({
            candidates: [issue()],
            refreshes: [],
          }),
          runner: fakeRunner([], {}, {
            afterRunFailure: workspaceFailure('after_run failed', 'after_run'),
          }),
          logger: fakeLogger(logs),
          workspace: fakeWorkspace(),
        })),
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

  it.effect('passes the unreduced worker failure exit to evidence before scheduling retry', () =>
    Effect.gen(function* () {
      const evidenceInputs: Array<RunEvidenceAttemptInput> = []
      const snapshot = yield* Effect.gen(function* () {
        yield* pollTick(config, { nowMs: 1000, launchMode: 'inline' })
        const state = yield* OrchestratorState

        return yield* state.snapshot(config, 2000)
      }).pipe(
        Effect.provide(runtimeLayers({
          tracker: fakeTracker({
            candidates: [issue()],
            refreshes: [],
          }),
          runner: fakeFailingRunner(workspaceFailure('before_run failed', 'before_run')),
          workspace: fakeWorkspace(),
          evidence: fakeEvidence({ inputs: evidenceInputs }),
        })),
      )

      expect(evidenceInputs).toHaveLength(1)
      expect(buildRunSummary(evidenceInputs[0]!)).toMatchObject({
        lifecycle: {
          exit: {
            status: 'failure',
            classification: 'typed_failure',
            typedErrors: [
              {
                code: 'hook_failed',
                reason: 'before_run failed',
              },
            ],
          },
        },
      })
      expect(snapshot.retrying[0]).toMatchObject({
        issueId: 'issue-1',
        attempt: 1,
      })
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
          attemptId: 'attempt-stalled',
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
      terminalCleanupAuthorizations: new Map(),
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

  it('schedules stale retry when reconciliation only sees stale timeout data', () => {
    const initial: RuntimeState = {
      running: new Map([[
        'issue-1',
        {
          issue: issue(),
          attempt: null,
          startedAtMs: 0,
          workspacePath: '/tmp/symphony/SYM-1',
          session: null,
          attemptId: 'attempt-current',
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
      terminalCleanupAuthorizations: new Map(),
    }

    const reconciled = reconcileStalledRuns(initial, {
      ...config,
      codex: {
        ...config.codex,
        stallTimeoutMs: 1000,
      },
    }, 5000)

    expect(reconciled.running.has('issue-1')).toBe(false)
    expect(reconciled.retryAttempts.get('issue-1')).toMatchObject({
      attempt: 1,
      error: 'worker stalled',
    })
  })

  it.effect('dispatches only the latest replaced due retry attempt', () =>
    Effect.gen(function* () {
      const runnerCalls: Array<AgentRunParams> = []

      const snapshot = yield* Effect.gen(function* () {
        const state = yield* OrchestratorState
        yield* state.scheduleRetry(issue(), 1, 'old retry entry', 0, 900)
        yield* state.scheduleRetry(issue(), 3, 'new retry entry', 0, 950)
        yield* pollTick(config, { nowMs: 1000, launchMode: 'inline' })

        return yield* state.snapshot(config, 2000)
      }).pipe(
        Effect.provide(runtimeLayers({
          tracker: fakeTracker({
            candidates: [issue()],
            refreshes: [],
          }),
          runner: fakeRunner(runnerCalls),
          workspace: fakeWorkspace(),
        })),
      )

      expect(runnerCalls).toHaveLength(1)
      expect(runnerCalls[0]?.attempt).toBe(3)
      expect(snapshot.retrying[0]).toMatchObject({
        issueId: 'issue-1',
        attempt: 1,
      })
    }))

  it.effect('reschedules a consumed due retry when dispatch loses ownership before start', () =>
    Effect.gen(function* () {
      const runnerCalls: Array<AgentRunParams> = []
      const scheduled: Array<{ readonly attempt: number, readonly error: string | null }> = []

      yield* pollTick(config, { nowMs: 1000, launchMode: 'inline' }).pipe(
        Effect.provide(runtimeLayers({
          state: fakeRetryDispatchLostState(issue(), 2, 1000, scheduled),
          tracker: fakeTracker({
            candidates: [issue()],
            refreshes: [],
          }),
          runner: fakeRunner(runnerCalls),
          workspace: fakeWorkspace(),
        })),
      )

      expect(runnerCalls).toEqual([])
      expect(scheduled).toContainEqual({
        attempt: 2,
        error: 'retry dispatch lost ownership before start',
      })
    }))

  it.effect('interrupts owned stalled worker fibers before scheduling retry', () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const finalized = yield* Deferred.make<void>()
      const evidenceWritten = yield* Deferred.make<void>()
      const evidenceInputs: Array<RunEvidenceAttemptInput> = []
      const stallConfig = {
        ...config,
        codex: {
          ...config.codex,
          stallTimeoutMs: 1000,
        },
      }

      const snapshot = yield* Effect.gen(function* () {
        yield* awaitStep(pollTick(stallConfig, { nowMs: 1000, launchMode: 'fork' }), 'poll_tick')
        yield* awaitDeferred(started, 'worker_started')
        yield* awaitStep(reconcileRunning(stallConfig, 2501), 'reconcile_running')
        yield* awaitDeferred(finalized, 'worker_finalized')
        yield* awaitDeferred(evidenceWritten, 'evidence_written')

        const state = yield* OrchestratorState

        return yield* state.snapshot(stallConfig, 2600)
      }).pipe(
        Effect.provide(runtimeLayers({
          tracker: fakeTracker({
            candidates: [issue()],
            refreshes: [],
          }),
          runner: fakeStallingRunner(started, finalized),
          workspace: fakeWorkspace(),
          evidence: fakeEvidence({
            inputs: evidenceInputs,
            onWrite: Deferred.succeed(evidenceWritten, void 0),
          }),
        })),
      )

      expect(snapshot.running).toEqual([])
      expect(snapshot.retrying[0]).toMatchObject({
        issueId: 'issue-1',
        attempt: 1,
        error: 'worker stalled',
      })
      expect(evidenceInputs).toHaveLength(1)
      expect(buildRunSummary(evidenceInputs[0]!)).toMatchObject({
        lifecycle: {
          exit: {
            classification: 'interruption',
          },
        },
      })
    }))

  it.effect('interrupts owned workers when a refreshed issue leaves active states', () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const finalized = yield* Deferred.make<void>()
      const evidenceWritten = yield* Deferred.make<void>()
      const evidenceInputs: Array<RunEvidenceAttemptInput> = []

      const snapshot = yield* Effect.gen(function* () {
        yield* awaitStep(pollTick(config, { nowMs: 1000, launchMode: 'fork' }), 'poll_tick')
        yield* awaitDeferred(started, 'worker_started')
        yield* awaitStep(reconcileRunning(config, 2000), 'reconcile_running')
        yield* awaitDeferred(finalized, 'worker_finalized')
        yield* awaitDeferred(evidenceWritten, 'evidence_written')

        const state = yield* OrchestratorState

        return yield* state.snapshot(config, 2100)
      }).pipe(
        Effect.provide(runtimeLayers({
          tracker: fakeTracker({
            candidates: [issue()],
            refreshes: [[{ ...issue(), state: 'Backlog' }]],
          }),
          runner: fakeStallingRunner(started, finalized),
          workspace: fakeWorkspace(),
          evidence: fakeEvidence({
            inputs: evidenceInputs,
            onWrite: Deferred.succeed(evidenceWritten, void 0),
          }),
        })),
      )

      expect(snapshot.running).toEqual([])
      expect(snapshot.retrying).toEqual([])
      expect(evidenceInputs).toHaveLength(1)
      expect(buildRunSummary(evidenceInputs[0]!)).toMatchObject({
        lifecycle: {
          exit: {
            classification: 'interruption',
          },
        },
      })
    }))

  it.effect('removes terminal issue workspaces during startup cleanup', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const workspaceRoot = join(root.path, 'workspaces')
        const removed: Array<string> = []

        yield* startupTerminalWorkspaceCleanup({
          ...config,
          workspace: { root: workspaceRoot },
        }).pipe(
          Effect.provide(Layer.mergeAll(
            fakeTracker({
              candidates: [],
              refreshes: [],
              terminal: [{ ...issue(), state: 'Done' }],
            }),
            fakeWorkspace(removed, { root: workspaceRoot }),
            fakeLinear(),
            fakeLogger(),
          )),
        )

        expect(removed).toEqual(['SYM-1'])
      }), 'symphony-startup-cleanup-remove-').pipe(Effect.provide(NodeServices.layer)))

  it.effect('skips startup cleanup for terminal workspaces with a cleanup hold marker', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const workspaceRoot = join(root.path, 'workspaces')
        const testConfig = {
          ...config,
          workspace: { root: workspaceRoot },
        }
        const workspacePath = workspacePathFor(workspaceRoot, 'SYM-1')
        const removed: Array<string> = []
        const logs: Array<FakeLogEntry> = []

        yield* writeCleanupHold({
          issueId: 'issue-1',
          issueIdentifier: 'SYM-1',
          attempt: 1,
          reason: 'terminal cleanup skipped because run evidence was not written',
          workspacePath,
          createdAtMs: 1000,
        })
        yield* startupTerminalWorkspaceCleanup(testConfig).pipe(
          Effect.provide(Layer.mergeAll(
            fakeTracker({
              candidates: [],
              refreshes: [],
              terminal: [{ ...issue(), state: 'Done' }],
            }),
            fakeWorkspace(removed, { root: workspaceRoot }),
            fakeLinear(),
            fakeLogger(logs),
          )),
        )

        expect(removed).toEqual([])
        expect(logs).toContainEqual(expect.objectContaining({
          level: 'warn',
          message: 'workspace_cleanup_skipped',
          context: expect.objectContaining({
            issue_identifier: 'SYM-1',
            workspace_path: workspacePath,
            reason: 'terminal cleanup skipped because run evidence was not written',
          }),
        }))
      }), 'symphony-startup-cleanup-hold-').pipe(Effect.provide(NodeServices.layer)))

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
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const workspaceRoot = join(root.path, 'workspaces')
        const removed: Array<string> = []
        const logs: Array<FakeLogEntry> = []

        yield* startupTerminalWorkspaceCleanup({
          ...config,
          workspace: { root: workspaceRoot },
        }).pipe(
          Effect.provide(Layer.mergeAll(
            fakeTracker({
              candidates: [],
              refreshes: [],
              terminal: [{ ...issue(), state: 'Done' }],
            }),
            fakeWorkspace(removed, {
              cleanupFailure: workspaceFailure('before_remove failed', 'before_remove'),
              root: workspaceRoot,
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
      }), 'symphony-startup-cleanup-failure-').pipe(Effect.provide(NodeServices.layer)))
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

function fakeFailingRunner(error: WorkspaceError): Layer.Layer<AgentRunner> {
  return Layer.succeed(AgentRunner)({
    runAttempt: () => Effect.fail(error),
  })
}

function fakeStallingRunner(
  started: Deferred.Deferred<void>,
  finalized: Deferred.Deferred<void>,
): Layer.Layer<AgentRunner> {
  return Layer.succeed(AgentRunner)({
    runAttempt: () =>
      Deferred.succeed(started, void 0).pipe(
        Effect.andThen(Effect.sleep(60_000)),
        Effect.andThen(Effect.never),
        Effect.ensuring(Deferred.succeed(finalized, void 0)),
      ),
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
  options: {
    readonly cleanupFailure?: WorkspaceError
    readonly root?: string
    readonly onRemove?: Effect.Effect<unknown>
  } = {},
): Layer.Layer<WorkspaceManager> {
  const root = options.root ?? '/tmp/symphony'

  return Layer.succeed(WorkspaceManager)({
    createForIssue: identifier => Effect.succeed(workspace(identifier, root)),
    runBeforeRun: () => Effect.succeed(null),
    runAfterRunBestEffort: () => Effect.succeed(null),
    removeForIssueBestEffort: (identifier, _workspace, _hooks, onFailure) =>
      Effect.sync(() => {
        removed.push(identifier)
      }).pipe(
        Effect.andThen(options.onRemove ?? Effect.void),
        Effect.andThen(reportWorkspaceCleanupFailure(identifier, root, options.cleanupFailure, onFailure)),
      ),
    assertContained: (_root, candidate) => Effect.succeed(candidate),
  })
}

function fakeRetryDispatchLostState(
  retryIssue: Issue,
  retryAttempt: number,
  nowMs: number,
  scheduled: Array<{ readonly attempt: number, readonly error: string | null }>,
): Layer.Layer<OrchestratorState> {
  let current: RuntimeState = scheduleRetryInState(initialRuntimeState(), retryIssue, retryAttempt, 'previous failure', 0, nowMs)

  const service: OrchestratorStateShape = {
    get: Effect.sync(() => current),
    set: state => Effect.sync(() => {
      current = state
    }),
    snapshot: () => Effect.die(new Error('snapshot should not be called by retry dispatch race test')),
    tryMarkRunning: () => Effect.succeed(false),
    isCurrentOwner: () => Effect.succeed(false),
    recordCodexEvent: () => Effect.void,
    handleWorkerExit: () => Effect.void,
    reconcileRunning: () => Effect.succeed([]),
    getTerminalCleanupAuthorization: () => Effect.succeed(null),
    consumeTerminalCleanupAuthorization: () => Effect.succeed(null),
    scheduleRetry: (retry, attempt, error, delayMs, scheduledAtMs) =>
      Effect.sync(() => {
        scheduled.push({ attempt, error })
        current = scheduleRetryInState(current, retry, attempt, error, delayMs, scheduledAtMs)
      }),
    consumeDueRetry: (issueId, retryToken, dueAtMs) =>
      Effect.sync(() => {
        const retry = current.retryAttempts.get(issueId)

        if (retry === undefined || retry.retryToken !== retryToken || retry.dueAtMs > dueAtMs) {
          return null
        }

        const retryAttempts = new Map(current.retryAttempts)
        const claimed = new Set(current.claimed)
        retryAttempts.delete(issueId)
        claimed.delete(issueId)
        current = {
          ...current,
          retryAttempts,
          claimed,
        }

        return {
          issueId: retry.issueId,
          attempt: retry.attempt,
          retryToken: retry.retryToken,
        }
      }),
    releaseClaim: issueId =>
      Effect.sync(() => {
        const retryAttempts = new Map(current.retryAttempts)
        const claimed = new Set(current.claimed)
        retryAttempts.delete(issueId)
        claimed.delete(issueId)
        current = {
          ...current,
          retryAttempts,
          claimed,
        }
      }),
  }

  return Layer.succeed(OrchestratorState)(service)
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
  root: string,
  error: WorkspaceError | undefined,
  onFailure?: WorkspaceBestEffortFailureHandler,
): Effect.Effect<unknown> {
  if (error === undefined || onFailure === undefined) {
    return Effect.void
  }

  return onFailure({
    operation: 'before_remove',
    issueIdentifier: identifier,
    workspacePath: workspace(identifier, root).path,
    error,
  })
}

function workspace(identifier: string, root = '/tmp/symphony'): Workspace {
  return {
    path: join(root, identifier),
    workspaceKey: identifier,
    createdNow: false,
  }
}

function fakeLinear(): Layer.Layer<LinearTransport> {
  return Layer.succeed(LinearTransport)({
    execute: () => Effect.die(new Error('linear transport should not be called by orchestrator runtime tests')),
  })
}

function fakeEvidence(options: {
  readonly fail?: boolean
  readonly inputs?: Array<RunEvidenceAttemptInput>
  readonly onWrite?: Effect.Effect<unknown>
} = {}): Layer.Layer<RunEvidenceService> {
  return Layer.succeed(RunEvidenceService)({
    writeAttempt: input => Effect.sync(() => {
      options.inputs?.push(input)
    }).pipe(
      Effect.andThen(options.onWrite ?? Effect.void),
      Effect.andThen(options.fail === true
        ? Effect.fail(new RunEvidenceError({
            code: 'evidence_write_failed',
            path: '/tmp/evidence',
            reason: 'fake evidence failure',
          }))
        : Effect.succeed({
            directory: '/tmp/evidence',
            summaryMarkdownPath: '/tmp/evidence/run-summary.md',
            summaryJsonPath: '/tmp/evidence/run-summary.json',
            protocolEventsPath: '/tmp/evidence/protocol-events.jsonl',
            summary: buildRunSummary(input),
          })),
    ),
  })
}

interface FakeLogEntry {
  readonly level: LogLevel
  readonly message: string
  readonly context?: LogContext
}

function fakeLogger(
  entries: Array<FakeLogEntry> = [],
  options: { readonly onMessage?: (entry: FakeLogEntry) => Effect.Effect<unknown> } = {},
): Layer.Layer<RuntimeLogger> {
  const record = (level: LogLevel, message: string, context?: LogContext) =>
    Effect.sync((): FakeLogEntry => {
      const entry = { level, message, context }
      entries.push({ level, message, context })
      return entry
    }).pipe(
      Effect.andThen(entry => options.onMessage?.(entry) ?? Effect.void),
    )

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
