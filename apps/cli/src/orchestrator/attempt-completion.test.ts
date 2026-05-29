import type { CodexRuntimeEvent } from '../agent-runner/codex.js'
import type { AgentRunResult } from '../agent-runner/runner.js'
import type { Issue, ServiceConfig } from '../domain/types.js'
import type { RunEvidenceAttemptInput, RunEvidenceService as RunEvidenceServiceType } from '../run-evidence/service.js'
import type { WorkspaceBestEffortFailure } from '../workspace/manager.js'
import type { AttemptCompletionInput, AttemptTransitionIntent, WorkerRunError } from './attempt-completion.js'
import type { WorkerInterruptionIntent } from './attempt-owner.js'
import type { TerminalCleanupAuthorization } from './state.js'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { describe, expect, it } from '@effect/vitest'
import { Cause, Effect, Exit, Layer, Option } from 'effect'
import { PromptRenderError, RunEvidenceError } from '../domain/errors.js'
import { readCleanupHold } from '../run-evidence/cleanup-hold.js'
import { buildRunSummary, RunEvidenceService as RunEvidenceServiceTag } from '../run-evidence/service.js'
import { WorkspaceManager } from '../workspace/manager.js'
import { AttemptCompletionService, AttemptCompletionServiceLive } from './attempt-completion.js'
import { failureRetryDelayMs } from './state.js'

const config: ServiceConfig = {
  workflowPath: '/repo/WORKFLOW.md',
  workflowDirectory: '/repo',
  promptTemplate: 'Prompt',
  tracker: {
    kind: 'linear',
    endpoint: 'https://linear.example/graphql',
    apiKey: 'linear-secret',
    projectSlug: 'symphony',
    activeStates: ['Todo', 'In Progress'],
    terminalStates: ['Done', 'Closed'],
  },
  polling: { intervalMs: 30000 },
  workspace: { root: '/tmp/symphony' },
  hooks: {
    afterCreate: null,
    beforeRun: null,
    afterRun: null,
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

describe('orchestrator attempt completion service', () => {
  it.effect('writes evidence before cleanup and removes workspace for terminal success', () =>
    Effect.gen(function* () {
      const events: Array<'evidence' | 'removed'> = []

      const result = yield* Effect.gen(function* () {
        const service = yield* AttemptCompletionService

        return yield* service.completeAttempt(makeCompletionInput({
          issue: issueFixture(),
          attempt: null,
          completedAtMs: 2_000,
          codexEvents: [],
          workspaceFailures: [],
        }))
      }).pipe(
        Effect.provide(Layer.mergeAll(
          AttemptCompletionServiceLive,
          fakeEvidenceService(events),
          fakeWorkspaceManager(events),
        )),
      )

      expect(events).toEqual(['evidence', 'removed'])
      expect(result.ownerCurrent).toBe(true)
      expect(result.cleanup).toBe('removed')
      expect(result.cleanupPlan.outcome).toBe('planned')
      expect(result.transition._tag).toBe('terminal_completed')
      expect(result.evidence.written).toBe(true)
      expect(result.evidence.directory).toBe('/tmp/evidence')
      expect(result.evidence.exit).toEqual(expect.any(Object))
    }))

  it.effect('writes a cleanup-hold when terminal evidence fails and does not remove workspace', () =>
    Effect.gen(function* () {
      const workspacePath = `/tmp/symphony-attempt-completion-fail-${Date.now()}`
      const issue = issueFixture({ state: 'Done' })
      const evidenceEvents: Array<'evidence' | 'removed'> = []
      const removed: Array<string> = []
      const evidenceInputs: Array<RunEvidenceAttemptInput> = []

      const result = yield* Effect.gen(function* () {
        const service = yield* AttemptCompletionService

        return yield* service.completeAttempt(makeCompletionInput({
          issue: issueFixture({ state: 'Done' }),
          attempt: 0,
          completedAtMs: 3_000,
          ownerWorkspacePath: workspacePath,
          codexEvents: [],
          workspaceFailures: [],
        }))
      }).pipe(
        Effect.provide(Layer.mergeAll(
          AttemptCompletionServiceLive,
          fakeEvidenceService(evidenceEvents, { fail: true }, evidenceInputs),
          fakeWorkspaceManager(evidenceEvents, removed),
        )),
      )

      const hold = yield* readCleanupHold(workspacePath)

      expect(result.ownerCurrent).toBe(true)
      expect(result.evidence.written).toBe(false)
      expect(result.cleanup).toBe('cleanup_hold_written')
      expect(evidenceEvents).toEqual(['evidence'])
      expect(removed).toEqual([])
      expect(result.evidence.exit._tag).toBe('Failure')
      if (Exit.isFailure(result.evidence.exit)) {
        const writeFailure = Cause.findErrorOption(result.evidence.exit.cause)
        expect(Option.isSome(writeFailure)).toBe(true)
        const writeFailureValue = Option.getOrUndefined(writeFailure)
        expect(writeFailureValue).toMatchObject({ code: 'evidence_write_failed' })
      }
      expect(evidenceInputs).toHaveLength(1)
      expect(hold).not.toBeNull()
      expect(hold).toMatchObject({
        issueIdentifier: issue.identifier,
        attempt: 1,
        reason: 'terminal cleanup skipped because run evidence was not written',
      })
    }).pipe(Effect.provide(NodeServices.layer)))

  it.effect('writes full interruption/failure exit to evidence and skips cleanup', () =>
    Effect.gen(function* () {
      const workerExit = Exit.fail(new PromptRenderError({
        code: 'template_render_error',
        reason: 'bad template',
      }))
      const events: Array<'evidence' | 'removed'> = []
      const removed: Array<string> = []
      const evidenceInputs: Array<RunEvidenceAttemptInput> = []

      const result = yield* Effect.gen(function* () {
        const service = yield* AttemptCompletionService

        return yield* service.completeAttempt(makeCompletionInput({
          issue: issueFixture(),
          attempt: 2,
          completedAtMs: 4_000,
          schedulerNowMs: 4_500,
          codexEvents: [],
          workspaceFailures: [],
          workerExit,
        }))
      }).pipe(
        Effect.provide(Layer.mergeAll(
          AttemptCompletionServiceLive,
          fakeEvidenceService(events, {}, evidenceInputs),
          fakeWorkspaceManager(events, removed),
        )),
      )

      const transition = result.transition

      expect(result.evidence.exit).toMatchObject({ _tag: 'Success' })
      expect(result.evidence.written).toBe(true)
      expect(result.cleanup).toBe('none')
      expect(result.cleanupPlan.outcome).toBe('skipped')
      expect(evidenceInputs).toHaveLength(1)
      expect(Exit.isFailure(evidenceInputs[0]!.workerExit)).toBe(true)
      expect(transition._tag).toBe('retry')
      expect((transition as { nextAttempt: number }).nextAttempt).toBe(3)
      expect(transition).toMatchObject({
        _tag: 'retry',
        dueAtMs: 4_500 + failureRetryDelayMs(3, config),
      })
      expect(result.ownerCurrent).toBe(true)
      expect(removed).toEqual([])
      expect(events).toEqual(['evidence'])
    }))

  it.effect('writes evidence for worker interruption without cleanup', () =>
    Effect.gen(function* () {
      const events: Array<'evidence' | 'removed'> = []
      const removed: Array<string> = []
      const evidenceInputs: Array<RunEvidenceAttemptInput> = []

      const result = yield* Effect.gen(function* () {
        const service = yield* AttemptCompletionService

        return yield* service.completeAttempt(makeCompletionInput({
          issue: issueFixture(),
          attempt: 2,
          completedAtMs: 4_300,
          codexEvents: [],
          workspaceFailures: [],
          workerExit: Exit.interrupt(1),
        }))
      }).pipe(
        Effect.provide(Layer.mergeAll(
          AttemptCompletionServiceLive,
          fakeEvidenceService(events, {}, evidenceInputs),
          fakeWorkspaceManager(events, removed),
        )),
      )

      expect(result.evidence.exit).toMatchObject({ _tag: 'Success' })
      expect(result.cleanup).toBe('none')
      expect(result.transition._tag).toBe('retry')
      expect(evidenceInputs).toHaveLength(1)
      const failedAttemptExit = evidenceInputs[0]!.workerExit
      expect(Exit.isFailure(failedAttemptExit)).toBe(true)
      if (Exit.isFailure(failedAttemptExit)) {
        expect(Cause.hasInterruptsOnly(failedAttemptExit.cause)).toBe(true)
      }
      expect(removed).toEqual([])
      expect(events).toEqual(['evidence'])
    }))

  it.effect('skips state transition and cleanup when owner is not current', () =>
    Effect.gen(function* () {
      const events: Array<'evidence' | 'removed'> = []
      const removed: Array<string> = []
      const transitions: Array<AttemptTransitionIntent> = []
      let consumeCalls = 0

      const result = yield* Effect.gen(function* () {
        const service = yield* AttemptCompletionService

        return yield* service.completeAttempt(makeCompletionInput({
          issue: issueFixture(),
          attempt: 1,
          completedAtMs: 5_000,
          codexEvents: [],
          workspaceFailures: [],
          interruptionIntent: {
            cause: 'stalled',
            cleanup: false,
            reason: 'stale owner replaced by a newer attempt',
          },
          isCurrentOwner: () => Effect.succeed(false),
          applyTransition: transition => Effect.sync(() => {
            transitions.push(transition)
          }),
          consumeCleanupAuthorization: () => Effect.sync(() => {
            consumeCalls += 1

            return cleanupAuthorizationFixture()
          }),
        }))
      }).pipe(
        Effect.provide(Layer.mergeAll(
          AttemptCompletionServiceLive,
          fakeEvidenceService(events),
          fakeWorkspaceManager(events, removed),
        )),
      )

      expect(result.ownerCurrent).toBe(false)
      expect(result.transition._tag).toBe('none')
      expect(result.cleanup).toBe('none')
      expect(consumeCalls).toBe(0)
      expect(removed).toEqual([])
      expect(transitions).toEqual([])
      expect(result.evidence.written).toBe(true)
      expect(events).toEqual(['evidence'])
    }))

  it.effect('allows terminal cleanup when transition was pre-applied and owner is no longer current', () =>
    Effect.gen(function* () {
      const events: Array<'evidence' | 'removed'> = []
      const removed: Array<string> = []
      const transitions: Array<AttemptTransitionIntent> = []
      const consumed: Array<string> = []
      const authorization = cleanupAuthorizationFixture({
        issue: issueFixture({ state: 'Done' }),
      })

      const result = yield* Effect.gen(function* () {
        const service = yield* AttemptCompletionService

        return yield* service.completeAttempt(makeCompletionInput({
          issue: issueFixture(),
          attempt: null,
          completedAtMs: 6_000,
          codexEvents: [],
          workspaceFailures: [],
          interruptionIntent: {
            cause: 'terminal',
            cleanup: true,
            reason: 'terminal refresh already pre-applied in state',
          },
          isCurrentOwner: () => Effect.succeed(false),
          applyTransition: transition => Effect.sync(() => {
            transitions.push(transition)
          }),
          consumeCleanupAuthorization: owner => Effect.sync(() => {
            consumed.push(owner.attemptId)

            return authorization
          }),
        }))
      }).pipe(
        Effect.provide(Layer.mergeAll(
          AttemptCompletionServiceLive,
          fakeEvidenceService(events),
          fakeWorkspaceManager(events, removed),
        )),
      )

      expect(result.ownerCurrent).toBe(false)
      expect(result.transition._tag).toBe('none')
      expect(result.cleanup).toBe('removed')
      expect(result.cleanupPlan.outcome).toBe('planned')
      expect(result.evidence.written).toBe(true)
      expect(consumed).toEqual(['attempt:issue-1:initial'])
      expect(transitions).toEqual([])
      expect(removed).toEqual(['SYM-1'])
      expect(events).toEqual(['evidence', 'removed'])
    }))

  it.effect('refuses stale terminal cleanup without an owner-scoped cleanup authorization', () =>
    Effect.gen(function* () {
      const events: Array<'evidence' | 'removed'> = []
      const removed: Array<string> = []
      const transitions: Array<AttemptTransitionIntent> = []

      const result = yield* Effect.gen(function* () {
        const service = yield* AttemptCompletionService

        return yield* service.completeAttempt(makeCompletionInput({
          issue: issueFixture(),
          attempt: null,
          completedAtMs: 6_500,
          codexEvents: [],
          workspaceFailures: [],
          interruptionIntent: {
            cause: 'terminal',
            cleanup: true,
            reason: 'terminal refresh already pre-applied in state',
          },
          isCurrentOwner: () => Effect.succeed(false),
          applyTransition: transition => Effect.sync(() => {
            transitions.push(transition)
          }),
        }))
      }).pipe(
        Effect.provide(Layer.mergeAll(
          AttemptCompletionServiceLive,
          fakeEvidenceService(events),
          fakeWorkspaceManager(events, removed),
        )),
      )

      expect(result.ownerCurrent).toBe(false)
      expect(result.transition._tag).toBe('none')
      expect(result.cleanup).toBe('none')
      expect(result.cleanupPlan).toMatchObject({
        outcome: 'skipped',
        reason: 'terminal cleanup authorization unavailable',
      })
      expect(transitions).toEqual([])
      expect(removed).toEqual([])
      expect(events).toEqual(['evidence'])
    }))

  it.effect('refuses stale terminal cleanup when the cleanup authorization was already consumed', () =>
    Effect.gen(function* () {
      const events: Array<'evidence' | 'removed'> = []
      const removed: Array<string> = []
      const consumed: Array<string> = []

      const result = yield* Effect.gen(function* () {
        const service = yield* AttemptCompletionService

        return yield* service.completeAttempt(makeCompletionInput({
          issue: issueFixture(),
          attempt: null,
          completedAtMs: 6_700,
          codexEvents: [],
          workspaceFailures: [],
          interruptionIntent: {
            cause: 'terminal',
            cleanup: true,
            reason: 'terminal refresh already pre-applied in state',
          },
          isCurrentOwner: () => Effect.succeed(false),
          consumeCleanupAuthorization: owner => Effect.sync(() => {
            consumed.push(owner.attemptId)

            return null
          }),
        }))
      }).pipe(
        Effect.provide(Layer.mergeAll(
          AttemptCompletionServiceLive,
          fakeEvidenceService(events),
          fakeWorkspaceManager(events, removed),
        )),
      )

      expect(result.ownerCurrent).toBe(false)
      expect(result.transition._tag).toBe('none')
      expect(result.cleanup).toBe('none')
      expect(result.cleanupPlan.outcome).toBe('skipped')
      expect(consumed).toEqual(['attempt:issue-1:initial'])
      expect(removed).toEqual([])
      expect(events).toEqual(['evidence'])
    }))
})

function makeCompletionInput({
  issue,
  attempt,
  completedAtMs,
  schedulerNowMs = completedAtMs,
  ownerWorkspacePath,
  codexEvents,
  workspaceFailures,
  workerExit,
  interruptionIntent,
  isCurrentOwner,
  consumeCleanupAuthorization,
  applyTransition,
}: {
  issue: Issue
  attempt: number | null
  completedAtMs: number
  schedulerNowMs?: number
  ownerWorkspacePath?: string
  codexEvents: ReadonlyArray<CodexRuntimeEvent>
  workspaceFailures: ReadonlyArray<WorkspaceBestEffortFailure>
  workerExit?: Exit.Exit<AgentRunResult, WorkerRunError>
  interruptionIntent?: WorkerInterruptionIntent | null
  isCurrentOwner?: () => Effect.Effect<boolean>
  consumeCleanupAuthorization?: (owner: AttemptCompletionInput['owner']) => Effect.Effect<TerminalCleanupAuthorization | null>
  applyTransition?: (transition: AttemptTransitionIntent) => Effect.Effect<void>
}): AttemptCompletionInput {
  const completionIssue = { ...issue, state: attempt === null ? 'Done' : issue.state }
  const terminalWorkspacePath = ownerWorkspacePath ?? '/tmp/workspace/SYM-1'
  const runResult: AgentRunResult = {
    issue: completionIssue,
    workspace: {
      path: terminalWorkspacePath,
      workspaceKey: issue.identifier,
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
  }

  return {
    owner: {
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      attempt,
      attemptId: `attempt:${issue.id}:${attempt ?? 'initial'}`,
      workspacePath: terminalWorkspacePath,
      startedAtMs: 1_000,
    },
    issue,
    workerExit: workerExit ?? Exit.succeed(runResult),
    interruptionIntent: interruptionIntent ?? null,
    codexEvents,
    workspaceFailures,
    config,
    schedulerNowMs,
    completedAtMs,
    isCurrentOwner: isCurrentOwner === undefined ? undefined : () => isCurrentOwner(),
    consumeCleanupAuthorization,
    applyTransition,
  }
}

function cleanupAuthorizationFixture({
  issue = issueFixture({ state: 'Done' }),
  attempt = null,
  workspacePath = '/tmp/workspace/SYM-1',
}: {
  readonly issue?: Issue
  readonly attempt?: number | null
  readonly workspacePath?: string
} = {}): TerminalCleanupAuthorization {
  return {
    owner: {
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      attempt,
      attemptId: `attempt:${issue.id}:${attempt ?? 'initial'}`,
      workspacePath,
      startedAtMs: 1_000,
    },
    issue,
    reason: `issue state ${issue.state} is terminal`,
    grantedAtMs: 6_000,
  }
}

function fakeEvidenceService(
  events: Array<'evidence' | 'removed'>,
  options: { readonly fail?: boolean } = {},
  evidenceInputs: Array<RunEvidenceAttemptInput> = [],
): Layer.Layer<RunEvidenceServiceType> {
  return Layer.succeed(RunEvidenceServiceTag)({
    writeAttempt: input => Effect.sync(() => {
      events.push('evidence')
      evidenceInputs.push(input)
    }).pipe(
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

function fakeWorkspaceManager(
  events: Array<'evidence' | 'removed'>,
  removed: Array<string> = [],
): Layer.Layer<WorkspaceManager> {
  return Layer.succeed(WorkspaceManager)({
    createForIssue: () => Effect.die(new Error('should not be called in completion tests')),
    runBeforeRun: () => Effect.die(new Error('should not be called in completion tests')),
    runAfterRunBestEffort: () => Effect.die(new Error('should not be called in completion tests')),
    removeForIssueBestEffort: issueIdentifier => Effect.sync(() => {
      removed.push(issueIdentifier)
      events.push('removed')
    }).pipe(Effect.as(undefined)),
    assertContained: () => Effect.die(new Error('should not be called in completion tests')),
  })
}

function issueFixture(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    identifier: 'SYM-1',
    title: 'Implement completion service',
    description: null,
    priority: 1,
    state: 'Todo',
    stateType: null,
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
    ...overrides,
  }
}
