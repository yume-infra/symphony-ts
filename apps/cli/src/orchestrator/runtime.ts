import type { CodexRuntimeEvent } from '../agent-runner/codex.js'
import type { AgentRunResult } from '../agent-runner/runner.js'
import type { Issue, ServiceConfig } from '../domain/types.js'
import type { WorkspaceBestEffortFailure } from '../workspace/manager.js'
import type { AttemptCompletionInput, WorkerRunError } from './attempt-completion.js'
import type { AttemptOwner, WorkerInterruptionIntent } from './attempt-owner.js'
import type { RuntimeRunningIssue, RuntimeState, WorkerInterruptionCommand } from './state.js'
import type { WorkerExitObserved } from './worker-supervisor.js'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Cause, Clock, Effect, Exit, Option } from 'effect'
import { AgentRunner } from '../agent-runner/runner.js'
import { ConfigResolver } from '../config/resolve.js'
import { RuntimeLogger } from '../observability/logging.js'
import { readCleanupHold } from '../run-evidence/cleanup-hold.js'
import { TrackerClient } from '../tracker/linear.js'
import { WorkspaceManager, workspacePathFor } from '../workspace/manager.js'
import { AttemptCompletionService } from './attempt-completion.js'
import { failureRetryDelayMs, isDispatchEligible, OrchestratorState, removeRunningForReconciliation, scheduleRetryInState, sortCandidates } from './state.js'
import { WorkerSupervisor } from './worker-supervisor.js'

interface RunningReconciliationResult {
  readonly state: RuntimeState
  readonly interruptions: ReadonlyArray<WorkerInterruptionCommand>
}

let nextWorkerAttemptSequence = 0

export interface PollTickOptions {
  readonly nowMs: number
  readonly launchMode?: 'inline' | 'fork'
}

function makeWorkerAttemptId(issue: Issue, attempt: number | null, nowMs: number): string {
  nextWorkerAttemptSequence += 1

  return `${issue.id}:${attempt ?? 'initial'}:${nowMs}:${nextWorkerAttemptSequence}`
}

function ownerFromRunning(running: RuntimeRunningIssue): AttemptOwner {
  return {
    issueId: running.issue.id,
    issueIdentifier: running.issue.identifier,
    attempt: running.attempt,
    attemptId: running.attemptId,
    workspacePath: running.workspacePath ?? '',
    startedAtMs: running.startedAtMs,
  }
}

function makeInterruption(running: RuntimeRunningIssue, cause: WorkerInterruptionIntent['cause'], cleanup: boolean, reason: string, issue?: Issue): WorkerInterruptionCommand {
  return {
    owner: ownerFromRunning(running),
    intent: {
      cause,
      cleanup,
      reason,
      issue,
    },
  }
}

const interruptWorkerAttempts = Effect.fn('interruptWorkerAttempts')(function* (
  interruptions: ReadonlyArray<WorkerInterruptionCommand>,
): Effect.fn.Return<void, never, WorkerSupervisor | RuntimeLogger> {
  const supervisor = yield* WorkerSupervisor
  const logger = yield* RuntimeLogger

  for (const interruption of interruptions) {
    yield* logger.warn('worker_interrupt_requested', {
      issue_id: interruption.owner.issueId,
      issue_identifier: interruption.owner.issueIdentifier,
      attempt_id: interruption.owner.attemptId,
      interruption_reason: interruption.intent.cause,
      reason: interruption.intent.reason,
    })

    yield* supervisor.interrupt(interruption.owner, interruption.intent)
  }
})

export const reconcileRunning = Effect.fn('reconcileRunning')(function* (
  config: ServiceConfig,
  nowMs: number,
) {
  const stateService = yield* OrchestratorState
  const tracker = yield* TrackerClient
  const logger = yield* RuntimeLogger
  const runningIds = [...(yield* stateService.get).running.keys()]

  if (runningIds.length === 0) {
    return
  }

  const refreshed = yield* tracker.fetchIssueStatesByIds(config, runningIds).pipe(
    Effect.catch(error =>
      logger.warn('running_reconciliation_refresh_failed', {
        operation: 'fetch_issue_states_by_ids',
        issue_count: runningIds.length,
        error_code: error.code,
        reason: error.reason,
      }).pipe(
        Effect.andThen(Effect.succeed<ReadonlyArray<Issue>>([])),
      ),
    ),
  )

  const interruptions = yield* stateService.reconcileRunning(refreshed, config, nowMs)
  yield* interruptWorkerAttempts(interruptions)
})

function finalizeAttempt(owner: AttemptOwner, issue: Issue, config: ServiceConfig, codexEvents: ReadonlyArray<CodexRuntimeEvent>, workspaceFailures: ReadonlyArray<WorkspaceBestEffortFailure>, schedulerNowMs: number) {
  return (exit: Exit.Exit<AgentRunResult, WorkerRunError>, interruptionIntent: WorkerInterruptionIntent | null) =>
    Effect.gen(function* () {
      const completion = yield* AttemptCompletionService
      const logger = yield* RuntimeLogger
      const state = yield* OrchestratorState
      const completedAtMs = yield* Clock.currentTimeMillis

      const input: AttemptCompletionInput = {
        owner,
        issue,
        workerExit: exit,
        interruptionIntent,
        codexEvents,
        workspaceFailures,
        config,
        schedulerNowMs,
        completedAtMs,
        isCurrentOwner: () => state.isCurrentOwner(owner),
        consumeCleanupAuthorization: () => state.consumeTerminalCleanupAuthorization(owner),
        applyTransition: (transition) => {
          switch (transition._tag) {
            case 'terminal_completed':
              return state.handleWorkerExit(transition.owner, {
                _tag: 'canceled',
                error: 'worker transitioned to terminal state',
                cause: 'terminal',
              }, config, schedulerNowMs)
            case 'non_active_completed':
              return state.handleWorkerExit(transition.owner, {
                _tag: 'canceled',
                error: 'worker transitioned to non-active state',
                cause: 'not_active',
              }, config, schedulerNowMs)
            case 'normal_completed':
              return state.handleWorkerExit(transition.owner, {
                _tag: 'normal',
              }, config, schedulerNowMs)
            case 'retry':
              return state.scheduleRetry(
                issue,
                transition.nextAttempt,
                transition.error,
                transition.delayMs,
                schedulerNowMs,
              )
            case 'none':
            default:
              return Effect.void
          }
        },
      }

      const result = yield* completion.completeAttempt(input)

      if (result.evidence.written) {
        if (result.evidence.directory !== null) {
          yield* logger.info('run_evidence_written', {
            issue_id: issue.id,
            issue_identifier: issue.identifier,
            evidence_path: result.evidence.directory,
          })
        }
      }
      else {
        yield* logger.warn('run_evidence_write_failed', {
          issue_id: issue.id,
          issue_identifier: issue.identifier,
          error_code: firstEvidenceErrorCode(result.evidence.exit),
          reason: describeEvidenceFailure(result.evidence.exit),
        })
      }

      if (result.cleanup === 'cleanup_hold_written') {
        yield* logger.warn('workspace_cleanup_skipped', {
          issue_id: issue.id,
          issue_identifier: issue.identifier,
          workspace_path: owner.workspacePath,
          reason: 'run evidence was not written',
        })
      }
    })
}

const dispatchIssue = Effect.fn('dispatchIssue')(function* (
  issue: Issue,
  attempt: number | null,
  config: ServiceConfig,
  options: PollTickOptions,
) {
  const state = yield* OrchestratorState
  const runner = yield* AgentRunner
  const logger = yield* RuntimeLogger
  const supervisor = yield* WorkerSupervisor
  const workspacePath = workspacePathFor(config.workspace.root, issue.identifier)
  const attemptId = makeWorkerAttemptId(issue, attempt, options.nowMs)
  const owner: AttemptOwner = {
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    attempt,
    attemptId,
    workspacePath,
    startedAtMs: options.nowMs,
  }

  const marked = yield* state.tryMarkRunning(issue, config, options.nowMs, attempt, workspacePath, owner)

  if (!marked) {
    return false
  }

  const codexEvents: Array<CodexRuntimeEvent> = []
  const workspaceFailures: Array<WorkspaceBestEffortFailure> = []

  const worker = runner.runAttempt({
    issue,
    attempt,
    config,
    onCodexEvent: event =>
      Effect.sync(() => {
        codexEvents.push(event)
      }).pipe(
        Effect.andThen(state.recordCodexEvent(owner, event)),
        Effect.andThen(logger.info('codex_event', {
          issue_id: issue.id,
          issue_identifier: issue.identifier,
          session_id: event.sessionId ?? undefined,
          codex_event: event.event,
          codex_app_server_pid: event.codexAppServerPid,
          codex_message: event.message,
          codex_input_tokens: event.usage?.inputTokens,
          codex_output_tokens: event.usage?.outputTokens,
          codex_total_tokens: event.usage?.totalTokens,
        })),
      ),
    onWorkspaceBestEffortFailure: failure =>
      Effect.sync(() => {
        workspaceFailures.push(failure)
      }).pipe(
        Effect.andThen(logger.warn('workspace_after_run_failed', workspaceBestEffortFailureContext(issue, failure))),
      ),
  })

  if (options.launchMode === 'inline') {
    const exit = yield* Effect.exit(worker)
    yield* finalizeAttempt(owner, issue, config, codexEvents, workspaceFailures, options.nowMs)(exit, null)
    return true
  }

  const onExit = (output: WorkerExitObserved<AgentRunResult, WorkerRunError>) =>
    finalizeAttempt(owner, issue, config, codexEvents, workspaceFailures, options.nowMs)(
      output.exit,
      output.interruptionIntent,
    )

  yield* supervisor.start({ owner, worker, onExit })
  return true
})

const processDueRetries = Effect.fn('processDueRetries')(function* (
  config: ServiceConfig,
  options: PollTickOptions,
) {
  const state = yield* OrchestratorState
  const tracker = yield* TrackerClient

  const dueRetries = [...(yield* state.get).retryAttempts.values()].filter(retry => retry.dueAtMs <= options.nowMs)

  if (dueRetries.length === 0) {
    return
  }

  const candidates = yield* tracker.fetchCandidateIssues(config)

  for (const retry of dueRetries) {
    const consumedRetry = yield* state.consumeDueRetry(retry.issueId, retry.retryToken, options.nowMs)

    if (consumedRetry === null) {
      continue
    }

    const issue = candidates.find(candidate => candidate.id === consumedRetry.issueId)

    if (issue === undefined) {
      continue
    }

    const current = yield* state.get

    if (!isDispatchEligible(issue, current, config)) {
      yield* state.scheduleRetry(
        issue,
        consumedRetry.attempt + 1,
        'no available orchestrator slots',
        failureRetryDelayMs(consumedRetry.attempt + 1, config),
        options.nowMs,
      )
      continue
    }

    const dispatched = yield* dispatchIssue(issue, consumedRetry.attempt, config, options)

    if (!dispatched) {
      yield* state.scheduleRetry(
        issue,
        consumedRetry.attempt,
        'retry dispatch lost ownership before start',
        failureRetryDelayMs(consumedRetry.attempt, config),
        options.nowMs,
      )
    }
  }
})

export const pollTick = Effect.fn('pollTick')(function* (
  config: ServiceConfig,
  options: PollTickOptions,
) {
  const resolver = yield* ConfigResolver
  const tracker = yield* TrackerClient
  const state = yield* OrchestratorState

  yield* reconcileRunning(config, options.nowMs)
  yield* processDueRetries(config, options)
  yield* resolver.validateDispatch(config)

  const candidates = yield* tracker.fetchCandidateIssues(config)

  for (const issue of sortCandidates(candidates)) {
    const current = yield* state.get

    if (!isDispatchEligible(issue, current, config)) {
      continue
    }

    yield* dispatchIssue(issue, null, config, options)
  }
})

export const startupTerminalWorkspaceCleanup = Effect.fn('startupTerminalWorkspaceCleanup')(function* (
  config: ServiceConfig,
): Effect.fn.Return<void, never, TrackerClient | WorkspaceManager | RuntimeLogger> {
  const tracker = yield* TrackerClient
  const workspace = yield* WorkspaceManager
  const logger = yield* RuntimeLogger
  const terminalIssues = yield* tracker.fetchIssuesByStates(config, config.tracker.terminalStates).pipe(
    Effect.catch(error =>
      logger.warn('startup_terminal_workspace_cleanup_fetch_failed', {
        operation: 'fetch_terminal_issues',
        state_count: config.tracker.terminalStates.length,
        error_code: error.code,
        reason: error.reason,
      }).pipe(
        Effect.andThen(Effect.succeed<ReadonlyArray<Issue>>([])),
      ),
    ),
  )

  for (const issue of terminalIssues) {
    const workspacePath = workspacePathFor(config.workspace.root, issue.identifier)
    const cleanupHold = yield* readCleanupHold(workspacePath).pipe(
      Effect.provide(NodeServices.layer),
      Effect.map(hold => hold === null
        ? { present: false as const, reason: null }
        : { present: true as const, reason: hold.reason }),
      Effect.catch(error =>
        logger.warn('cleanup_hold_read_failed', {
          issue_id: issue.id,
          issue_identifier: issue.identifier,
          workspace_path: workspacePath,
          error_code: error.code,
          reason: error.reason,
        }).pipe(
          Effect.as({ present: true as const, reason: 'cleanup hold marker could not be read' }),
        )),
    )

    if (cleanupHold.present) {
      yield* logger.warn('workspace_cleanup_skipped', {
        issue_id: issue.id,
        issue_identifier: issue.identifier,
        workspace_path: workspacePath,
        reason: cleanupHold.reason ?? 'cleanup hold marker exists',
      })
      continue
    }

    yield* workspace.removeForIssueBestEffort(
      issue.identifier,
      config.workspace,
      config.hooks,
      failure => logger.warn('workspace_cleanup_failed', workspaceBestEffortFailureContext(issue, failure)),
    )
  }
})

export function reconcileStalledRuns(
  state: RuntimeState,
  config: ServiceConfig,
  nowMs: number,
): RuntimeState {
  return reconcileStalledRunsWithInterrupts(state, config, nowMs).state
}

function reconcileStalledRunsWithInterrupts(
  state: RuntimeState,
  config: ServiceConfig,
  nowMs: number,
): RunningReconciliationResult {
  if (config.codex.stallTimeoutMs <= 0) {
    return { state, interruptions: [] }
  }

  let nextState = state
  const interruptions: Array<WorkerInterruptionCommand> = []

  for (const running of state.running.values()) {
    const lastActivity = running.session?.lastCodexTimestamp ?? running.startedAtMs

    if (nowMs - lastActivity <= config.codex.stallTimeoutMs) {
      continue
    }

    const nextAttempt = (running.attempt ?? 0) + 1
    const reason = `worker stalled after ${nowMs - lastActivity}ms without codex activity`
    nextState = removeRunningForReconciliation(nextState, ownerFromRunning(running), false)
    nextState = scheduleRetryInState(
      nextState,
      running.issue,
      nextAttempt,
      'worker stalled',
      failureRetryDelayMs(nextAttempt, config),
      nowMs,
    )
    interruptions.push(makeInterruption(running, 'stalled', false, reason))
  }

  return { state: nextState, interruptions }
}

function workspaceBestEffortFailureContext(issue: Issue, failure: WorkspaceBestEffortFailure) {
  return {
    issue_id: issue.id,
    issue_identifier: issue.identifier,
    workspace_path: failure.workspacePath,
    workspace_operation: failure.operation,
    workspace_issue_identifier: failure.issueIdentifier,
    error_code: failure.error.code,
    hook: failure.error.hook,
    reason: failure.error.reason,
  }
}

function firstEvidenceErrorCode(exit: Exit.Exit<unknown, unknown>): string {
  if (Exit.isSuccess(exit)) {
    return 'none'
  }

  const error = Cause.findErrorOption(exit.cause)

  if (Option.isSome(error) && typeof error.value === 'object' && error.value !== null && 'code' in error.value) {
    return String(error.value.code)
  }

  if (Cause.hasDies(exit.cause)) {
    return 'defect'
  }

  return 'unknown_failure'
}

function describeEvidenceFailure(exit: Exit.Exit<unknown, unknown>): string {
  if (Exit.isSuccess(exit)) {
    return 'evidence written'
  }

  const error = Cause.findErrorOption(exit.cause)

  if (Option.isSome(error)) {
    const value = error.value

    if (typeof value === 'object' && value !== null && 'reason' in value) {
      return String(value.reason)
    }

    return String(value)
  }

  return Cause.pretty(exit.cause)
}
