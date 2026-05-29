import type { CodexRuntimeEvent } from '../agent-runner/codex.js'
import type { AgentRunResult } from '../agent-runner/runner.js'
import type { CodexError, PromptRenderError, TrackerError, WorkspaceError } from '../domain/errors.js'
import type { Issue, ServiceConfig } from '../domain/types.js'
import type { CleanupSummary } from '../run-evidence/schema.js'
import type { RunEvidenceAttemptInput, RunEvidenceResult } from '../run-evidence/service.js'
import type { WorkspaceBestEffortFailure } from '../workspace/manager.js'
import type { AttemptOwner, WorkerInterruptionIntent } from './attempt-owner.js'
import type { TerminalCleanupAuthorization } from './state.js'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Cause, Context, Effect, Exit, Layer, Option } from 'effect'
import { normalizeStateName } from '../domain/types.js'
import { writeCleanupHold } from '../run-evidence/cleanup-hold.js'
import { RunEvidenceService as RunEvidenceServiceTag } from '../run-evidence/service.js'
import { WorkspaceManager } from '../workspace/manager.js'
import { failureRetryDelayMs } from './state.js'

export type WorkerRunError = CodexError | PromptRenderError | TrackerError | WorkspaceError

export type AttemptTransitionIntent
  = | { readonly _tag: 'none' }
    | { readonly _tag: 'normal_completed', readonly owner: AttemptOwner }
    | { readonly _tag: 'terminal_completed', readonly owner: AttemptOwner }
    | { readonly _tag: 'non_active_completed', readonly owner: AttemptOwner }
    | {
      readonly _tag: 'retry'
      readonly owner: AttemptOwner
      readonly nextAttempt: number
      readonly error: string
      readonly delayMs: number
      readonly dueAtMs: number
    }

export interface AttemptCompletionInput {
  readonly owner: AttemptOwner
  readonly issue: Issue
  readonly workerExit: Exit.Exit<AgentRunResult, WorkerRunError>
  readonly interruptionIntent: WorkerInterruptionIntent | null
  readonly codexEvents: ReadonlyArray<CodexRuntimeEvent>
  readonly workspaceFailures: ReadonlyArray<WorkspaceBestEffortFailure>
  readonly config: ServiceConfig
  readonly schedulerNowMs: number
  readonly completedAtMs: number
  readonly isCurrentOwner?: (owner: AttemptOwner) => Effect.Effect<boolean>
  readonly consumeCleanupAuthorization?: (owner: AttemptOwner) => Effect.Effect<TerminalCleanupAuthorization | null>
  readonly applyTransition?: (transition: AttemptTransitionIntent) => Effect.Effect<void>
}

interface AttemptCompletionResult {
  readonly ownerCurrent: boolean
  readonly transition: AttemptTransitionIntent
  readonly cleanup: AttemptCleanupAction
  readonly evidence: {
    readonly written: boolean
    readonly directory: string | null
    readonly exit: Exit.Exit<RunEvidenceResult, unknown>
  }
  readonly cleanupPlan: CleanupSummary
}

export type AttemptCleanupAction = 'none' | 'removed' | 'cleanup_hold_written'

export interface AttemptCompletionServiceShape {
  readonly completeAttempt: (
    input: AttemptCompletionInput,
  ) => Effect.Effect<AttemptCompletionResult, never, RunEvidenceServiceTag | WorkspaceManager>
}

export class AttemptCompletionService extends Context.Service<AttemptCompletionService, AttemptCompletionServiceShape>()(
  'symphony/AttemptCompletionService',
) {}

export const AttemptCompletionServiceLive = Layer.succeed(AttemptCompletionService)({
  completeAttempt: Effect.fn('AttemptCompletionService.completeAttempt')(function* (input: AttemptCompletionInput) {
    const evidenceService = yield* RunEvidenceServiceTag
    const workspaceManager = yield* WorkspaceManager

    const ownerCurrent = yield* (input.isCurrentOwner === undefined
      ? Effect.succeed(true)
      : input.isCurrentOwner(input.owner))
    const cleanupAuthorization = ownerCurrent || input.consumeCleanupAuthorization === undefined || !needsCleanupAuthorization(input)
      ? null
      : yield* input.consumeCleanupAuthorization(input.owner)
    const cleanupPlan = completionCleanupPlan(input.workerExit, input.config, input.interruptionIntent, ownerCurrent, cleanupAuthorization)
    const evidenceInput = buildRunEvidenceInput(input, cleanupPlan, cleanupAuthorization)
    const evidence = yield* Effect.exit(evidenceService.writeAttempt(evidenceInput))
    const evidenceWritten = Exit.isSuccess(evidence)
    const shouldCleanup = ownerCurrent || cleanupAuthorization !== null
    const transition = ownerCurrent
      ? buildTransitionIntent(input)
      : { _tag: 'none' as const }

    let cleanupAction: AttemptCleanupAction = 'none'

    if (shouldCleanup && cleanupPlan.outcome === 'planned') {
      if (evidenceWritten) {
        yield* workspaceManager.removeForIssueBestEffort(
          input.owner.issueIdentifier,
          input.config.workspace,
          input.config.hooks,
          () => Effect.void,
        )
        cleanupAction = 'removed'
      }
      else {
        yield* writeCleanupHold({
          issueId: input.owner.issueId,
          issueIdentifier: input.owner.issueIdentifier,
          attempt: cleanupAttemptNumber(input.owner.attempt),
          reason: 'terminal cleanup skipped because run evidence was not written',
          workspacePath: evidenceInput.workspacePath ?? input.owner.workspacePath,
          createdAtMs: input.completedAtMs,
        }).pipe(
          Effect.provide(NodeServices.layer),
          Effect.exit,
        )
        cleanupAction = 'cleanup_hold_written'
      }
    }

    if (ownerCurrent && input.applyTransition !== undefined && transition._tag !== 'none') {
      yield* input.applyTransition(transition)
    }

    return {
      ownerCurrent,
      transition,
      cleanup: cleanupAction,
      evidence: {
        written: evidenceWritten,
        directory: evidenceWritten
          ? evidence.value.directory
          : null,
        exit: evidence,
      },
      cleanupPlan,
    }
  }),
})

function buildRunEvidenceInput(
  input: AttemptCompletionInput,
  cleanup: CleanupSummary,
  cleanupAuthorization: TerminalCleanupAuthorization | null,
): RunEvidenceAttemptInput {
  const evidenceIssue = Exit.isSuccess(input.workerExit)
    ? input.workerExit.value.issue
    : input.interruptionIntent?.issue ?? cleanupAuthorization?.issue ?? input.issue
  const evidenceWorkspacePath = Exit.isSuccess(input.workerExit)
    ? input.workerExit.value.workspace.path
    : input.owner.workspacePath

  return {
    issue: evidenceIssue,
    attempt: input.owner.attempt,
    config: input.config,
    workspacePath: evidenceWorkspacePath,
    startedAtMs: input.owner.startedAtMs,
    completedAtMs: input.completedAtMs,
    workerExit: input.workerExit,
    codexEvents: input.codexEvents,
    workspaceFailures: input.workspaceFailures,
    cleanup,
  }
}

function needsCleanupAuthorization(input: AttemptCompletionInput): boolean {
  return input.interruptionIntent?.cause === 'terminal'
    || (Exit.isSuccess(input.workerExit) && isTerminal(input.workerExit.value.issue, input.config))
}

function completionCleanupPlan(
  workerExit: Exit.Exit<AgentRunResult, WorkerRunError>,
  config: ServiceConfig,
  interruptionIntent: WorkerInterruptionIntent | null,
  ownerCurrent: boolean,
  cleanupAuthorization: TerminalCleanupAuthorization | null,
): CleanupSummary {
  if (interruptionIntent?.cause === 'terminal') {
    return terminalCleanupPlan(ownerCurrent, cleanupAuthorization)
  }

  if (!Exit.isSuccess(workerExit)) {
    return {
      outcome: 'skipped',
      reason: 'worker did not complete successfully',
    }
  }

  if (isTerminal(workerExit.value.issue, config)) {
    return terminalCleanupPlan(ownerCurrent, cleanupAuthorization)
  }

  return {
    outcome: 'not_attempted',
    reason: 'issue is not terminal',
  }
}

function terminalCleanupPlan(
  ownerCurrent: boolean,
  cleanupAuthorization: TerminalCleanupAuthorization | null,
): CleanupSummary {
  if (ownerCurrent || cleanupAuthorization !== null) {
    return {
      outcome: 'planned',
      reason: 'terminal issue cleanup runs after evidence write',
    }
  }

  return {
    outcome: 'skipped',
    reason: 'terminal cleanup authorization unavailable',
  }
}

function buildTransitionIntent(input: AttemptCompletionInput): AttemptTransitionIntent {
  if (input.interruptionIntent?.cause === 'terminal') {
    return {
      _tag: 'terminal_completed',
      owner: input.owner,
    }
  }

  if (Exit.isSuccess(input.workerExit)) {
    if (isTerminal(input.workerExit.value.issue, input.config)) {
      return {
        _tag: 'terminal_completed',
        owner: input.owner,
      }
    }

    if (!isActive(input.workerExit.value.issue, input.config)) {
      return {
        _tag: 'non_active_completed',
        owner: input.owner,
      }
    }

    return {
      _tag: 'normal_completed',
      owner: input.owner,
    }
  }

  const nextAttempt = input.owner.attempt === null
    ? 1
    : input.owner.attempt + 1
  const delayMs = failureRetryDelayMs(nextAttempt, input.config)

  return {
    _tag: 'retry',
    owner: input.owner,
    nextAttempt,
    error: describeWorkerExit(input.workerExit),
    delayMs,
    dueAtMs: input.schedulerNowMs + delayMs,
  }
}

function isTerminal(issue: Issue, config: ServiceConfig): boolean {
  const normalizedState = normalizeStateName(issue.state)

  return config.tracker.terminalStates.some(state => normalizeStateName(state) === normalizedState)
}

function isActive(issue: Issue, config: ServiceConfig): boolean {
  const normalizedState = normalizeStateName(issue.state)

  return config.tracker.activeStates.some(state => normalizeStateName(state) === normalizedState)
}

function cleanupAttemptNumber(attempt: number | null): number {
  return (attempt ?? 0) + 1
}

function describeWorkerExit(exit: Exit.Exit<AgentRunResult, WorkerRunError>): string {
  if (Exit.isSuccess(exit)) {
    return 'worker completed successfully'
  }

  const typedError = firstWorkerTypedError(exit)

  if (typedError !== null) {
    return `${typedError.code}: ${typedError.reason}`
  }

  return Cause.pretty(exit.cause)
}

function firstWorkerTypedError(
  exit: Exit.Exit<AgentRunResult, WorkerRunError>,
): WorkerRunError | null {
  if (Exit.isSuccess(exit)) {
    return null
  }

  const typedError = Cause.findErrorOption(exit.cause)

  return Option.isSome(typedError) ? typedError.value : null
}
