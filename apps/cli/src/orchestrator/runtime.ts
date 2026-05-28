import type { CodexAppServerClient, CodexRuntimeEvent } from '../agent-runner/codex.js'
import type { AgentRunResult } from '../agent-runner/runner.js'
import type { CodexError, ConfigError, PromptRenderError, TrackerError, WorkspaceError } from '../domain/errors.js'
import type { Issue, ServiceConfig } from '../domain/types.js'
import type { PromptRenderer } from '../prompt/render.js'
import type { CleanupSummary } from '../run-evidence/schema.js'
import type { RunEvidenceService } from '../run-evidence/service.js'
import type { LinearTransport } from '../tracker/linear.js'
import type { WorkspaceBestEffortFailure } from '../workspace/manager.js'
import type { RuntimeState, WorkerExitReason } from './state.js'
import { Cause, Clock, Effect, Exit, Option } from 'effect'
import { AgentRunner } from '../agent-runner/runner.js'
import { ConfigResolver } from '../config/resolve.js'
import { normalizeStateName } from '../domain/types.js'
import { RuntimeLogger } from '../observability/logging.js'
import { RunEvidenceService as RunEvidenceServiceTag } from '../run-evidence/service.js'
import { TrackerClient } from '../tracker/linear.js'
import { WorkspaceManager, workspacePathFor } from '../workspace/manager.js'
import { failureRetryDelayMs, isDispatchEligible, OrchestratorState, removeRunningForReconciliation, sortCandidates } from './state.js'

type WorkerRunError = CodexError | PromptRenderError | TrackerError | WorkspaceError

export interface PollTickOptions {
  readonly nowMs: number
  readonly launchMode?: 'inline' | 'fork'
}

export type PollTickError
  = | ConfigError
    | TrackerError
    | WorkspaceError
    | PromptRenderError
    | CodexError

export const reconcileRunning = Effect.fn('reconcileRunning')(function* (
  config: ServiceConfig,
  nowMs: number,
): Effect.fn.Return<void, TrackerError, OrchestratorState | TrackerClient | LinearTransport | RuntimeLogger> {
  const stateService = yield* OrchestratorState
  const tracker = yield* TrackerClient
  const logger = yield* RuntimeLogger
  const state = yield* stateService.get
  let nextState = reconcileStalledRuns(state, config, nowMs)
  const runningIds = [...nextState.running.keys()]

  if (runningIds.length === 0) {
    yield* stateService.set(nextState)
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

  if (refreshed.length === 0) {
    yield* stateService.set(nextState)
    return
  }

  for (const issue of refreshed) {
    const running = nextState.running.get(issue.id)

    if (running === undefined) {
      continue
    }

    if (isTerminal(issue, config)) {
      nextState = {
        ...nextState,
        running: new Map(nextState.running).set(issue.id, {
          ...running,
          issue,
        }),
      }
      continue
    }

    if (!isActive(issue, config)) {
      nextState = removeRunningForReconciliation(nextState, issue.id, false)
      continue
    }

    nextState = {
      ...nextState,
      running: new Map(nextState.running).set(issue.id, {
        ...running,
        issue,
      }),
    }
  }

  yield* stateService.set(nextState)
})

const handleWorkerExitEffect = Effect.fn('handleWorkerExitEffect')(function* (
  issue: Issue,
  reason: WorkerExitReason,
  config: ServiceConfig,
  nowMs: number,
): Effect.fn.Return<void, never, OrchestratorState> {
  const state = yield* OrchestratorState

  yield* state.handleWorkerExit(issue.id, reason, config, nowMs)
})

const handleWorkerSuccessEffect = Effect.fn('handleWorkerSuccessEffect')(function* (
  result: AgentRunResult,
  config: ServiceConfig,
  nowMs: number,
  cleanupEnabled: boolean,
): Effect.fn.Return<void, never, OrchestratorState | WorkspaceManager | RuntimeLogger> {
  if (isTerminal(result.issue, config)) {
    const state = yield* OrchestratorState
    const workspace = yield* WorkspaceManager
    const logger = yield* RuntimeLogger
    const current = yield* state.get
    yield* state.set(removeRunningForReconciliation(current, result.issue.id, true))

    if (!cleanupEnabled) {
      yield* logger.warn('workspace_cleanup_skipped', {
        issue_id: result.issue.id,
        issue_identifier: result.issue.identifier,
        workspace_path: result.workspace.path,
        reason: 'run evidence was not written',
      })
      return
    }

    yield* workspace.removeForIssueBestEffort(
      result.issue.identifier,
      config.workspace,
      config.hooks,
      failure => logger.warn('workspace_cleanup_failed', workspaceBestEffortFailureContext(result.issue, failure)),
    )
    return
  }

  if (!isActive(result.issue, config)) {
    const state = yield* OrchestratorState
    const current = yield* state.get
    yield* state.set(removeRunningForReconciliation(current, result.issue.id, false))
    return
  }

  yield* handleWorkerExitEffect(result.issue, { _tag: 'normal' }, config, nowMs)
})

const dispatchIssue = Effect.fn('dispatchIssue')(function* (
  issue: Issue,
  attempt: number | null,
  config: ServiceConfig,
  options: PollTickOptions,
): Effect.fn.Return<
  void,
  PollTickError,
  | OrchestratorState
  | AgentRunner
  | WorkspaceManager
  | PromptRenderer
  | CodexAppServerClient
  | TrackerClient
  | LinearTransport
  | RuntimeLogger
  | RunEvidenceService
> {
  const state = yield* OrchestratorState
  const runner = yield* AgentRunner
  const logger = yield* RuntimeLogger
  const evidence = yield* RunEvidenceServiceTag
  const workspacePath = workspacePathFor(config.workspace.root, issue.identifier)
  const marked = yield* state.tryMarkRunning(
    issue,
    config,
    options.nowMs,
    attempt,
    workspacePath,
  )

  if (!marked) {
    return
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
        Effect.andThen(state.recordCodexEvent(issue.id, event)),
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
  const workerWithEvidence = Effect.gen(function* () {
    const workerExit = yield* Effect.exit(worker)
    const completedAtMs = yield* Clock.currentTimeMillis
    const evidenceIssue = Exit.isSuccess(workerExit) ? workerExit.value.issue : issue
    const evidenceWorkspacePath = Exit.isSuccess(workerExit) ? workerExit.value.workspace.path : workspacePath
    const cleanup = cleanupPlan(workerExit, config)
    const evidenceExit = yield* Effect.exit(evidence.writeAttempt({
      issue: evidenceIssue,
      attempt,
      config,
      workspacePath: evidenceWorkspacePath,
      startedAtMs: options.nowMs,
      completedAtMs,
      workerExit,
      codexEvents,
      workspaceFailures,
      cleanup,
    }))
    const evidenceWritten = Exit.isSuccess(evidenceExit)

    if (evidenceWritten) {
      yield* logger.info('run_evidence_written', {
        issue_id: evidenceIssue.id,
        issue_identifier: evidenceIssue.identifier,
        evidence_path: evidenceExit.value.directory,
      })
    }
    else {
      yield* logger.warn('run_evidence_write_failed', {
        issue_id: evidenceIssue.id,
        issue_identifier: evidenceIssue.identifier,
        error_code: firstEvidenceErrorCode(evidenceExit),
        reason: describeEvidenceFailure(evidenceExit),
      })
    }

    if (Exit.isSuccess(workerExit)) {
      yield* handleWorkerSuccessEffect(workerExit.value, config, options.nowMs, evidenceWritten)
      return
    }

    const typedError = firstWorkerTypedError(workerExit)

    yield* logger.warn('worker_failed', typedError === null
      ? workerExitFailureContext(issue, workerExit)
      : workerFailureContext(issue, typedError))
    yield* handleWorkerExitEffect(
      issue,
      { _tag: 'failed', error: describeWorkerExit(workerExit) },
      config,
      options.nowMs,
    )
  })

  if (options.launchMode === 'inline') {
    yield* workerWithEvidence
    return
  }

  yield* Effect.forkChild(workerWithEvidence, { startImmediately: true })
})

const processDueRetries = Effect.fn('processDueRetries')(function* (
  config: ServiceConfig,
  options: PollTickOptions,
): Effect.fn.Return<
  void,
  PollTickError,
  | OrchestratorState
  | TrackerClient
  | AgentRunner
  | WorkspaceManager
  | PromptRenderer
  | CodexAppServerClient
  | LinearTransport
  | RuntimeLogger
  | RunEvidenceService
> {
  const state = yield* OrchestratorState
  const tracker = yield* TrackerClient
  const snapshot = yield* state.get
  const dueRetries = [...snapshot.retryAttempts.values()].filter(retry => retry.dueAtMs <= options.nowMs)

  if (dueRetries.length === 0) {
    return
  }

  const candidates = yield* tracker.fetchCandidateIssues(config)

  for (const retry of dueRetries) {
    const issue = candidates.find(candidate => candidate.id === retry.issueId)

    if (issue === undefined) {
      yield* state.releaseClaim(retry.issueId)
      continue
    }

    const current = yield* state.get

    if (!isDispatchEligible(issue, {
      ...current,
      claimed: new Set([...current.claimed].filter(id => id !== retry.issueId)),
    }, config)) {
      yield* state.scheduleRetry(
        issue,
        retry.attempt + 1,
        'no available orchestrator slots',
        failureRetryDelayMs(retry.attempt + 1, config),
        options.nowMs,
      )
      continue
    }

    yield* state.releaseClaim(retry.issueId)
    yield* dispatchIssue(issue, retry.attempt, config, options)
  }
})

export const pollTick = Effect.fn('pollTick')(function* (
  config: ServiceConfig,
  options: PollTickOptions,
): Effect.fn.Return<
  void,
  PollTickError,
  | ConfigResolver
  | OrchestratorState
  | TrackerClient
  | AgentRunner
  | WorkspaceManager
  | PromptRenderer
  | CodexAppServerClient
  | LinearTransport
  | RuntimeLogger
  | RunEvidenceService
> {
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
): Effect.fn.Return<void, never, TrackerClient | WorkspaceManager | LinearTransport | RuntimeLogger> {
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
  if (config.codex.stallTimeoutMs <= 0) {
    return state
  }

  let nextState = state

  for (const running of state.running.values()) {
    const lastActivity = running.session?.lastCodexTimestamp ?? running.startedAtMs

    if (nowMs - lastActivity > config.codex.stallTimeoutMs) {
      nextState = removeRunningForReconciliation(nextState, running.issue.id, false)
      nextState = {
        ...nextState,
        retryAttempts: new Map(nextState.retryAttempts).set(running.issue.id, {
          issueId: running.issue.id,
          identifier: running.issue.identifier,
          attempt: (running.attempt ?? 0) + 1,
          dueAtMs: nowMs + failureRetryDelayMs((running.attempt ?? 0) + 1, config),
          error: 'worker stalled',
        }),
        claimed: new Set(nextState.claimed).add(running.issue.id),
      }
    }
  }

  return nextState
}

function isActive(issue: Issue, config: ServiceConfig): boolean {
  const normalized = normalizeStateName(issue.state)

  return config.tracker.activeStates.some(state => normalizeStateName(state) === normalized)
}

function isTerminal(issue: Issue, config: ServiceConfig): boolean {
  const normalized = normalizeStateName(issue.state)

  return config.tracker.terminalStates.some(state => normalizeStateName(state) === normalized)
}

function workerFailureContext(issue: Issue, error: WorkerRunError) {
  return {
    issue_id: issue.id,
    issue_identifier: issue.identifier,
    error_code: error.code,
    reason: error.reason,
    session_id: 'sessionId' in error ? error.sessionId : undefined,
  }
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

function cleanupPlan(
  workerExit: Exit.Exit<AgentRunResult, WorkerRunError>,
  config: ServiceConfig,
): CleanupSummary {
  if (!Exit.isSuccess(workerExit)) {
    return {
      outcome: 'skipped',
      reason: 'worker did not complete successfully',
    }
  }

  if (isTerminal(workerExit.value.issue, config)) {
    return {
      outcome: 'planned',
      reason: 'terminal issue cleanup runs after evidence write',
    }
  }

  return {
    outcome: 'not_attempted',
    reason: 'issue is not terminal',
  }
}

function firstWorkerTypedError(exit: Exit.Exit<AgentRunResult, WorkerRunError>): WorkerRunError | null {
  if (Exit.isSuccess(exit)) {
    return null
  }

  const error = Cause.findErrorOption(exit.cause)

  return Option.isSome(error) ? error.value : null
}

function describeWorkerExit(exit: Exit.Exit<AgentRunResult, WorkerRunError>): string {
  if (Exit.isSuccess(exit)) {
    return 'worker completed successfully'
  }

  const typedError = firstWorkerTypedError(exit)

  if (typedError !== null) {
    return describeWorkerError(typedError)
  }

  return Cause.pretty(exit.cause)
}

function workerExitFailureContext(issue: Issue, exit: Exit.Exit<AgentRunResult, WorkerRunError>) {
  return {
    issue_id: issue.id,
    issue_identifier: issue.identifier,
    error_code: Exit.isFailure(exit) && Cause.hasDies(exit.cause) ? 'defect' : 'unknown_failure',
    reason: describeWorkerExit(exit),
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

function describeWorkerError(error: WorkerRunError): string {
  return `${error.code}: ${error.reason}`
}
