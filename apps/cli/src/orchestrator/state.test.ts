import type { CodexRuntimeEvent } from '../agent-runner/codex.js'
import type { Issue, ServiceConfig } from '../domain/types.js'
import type { AttemptOwner } from './attempt-owner.js'
import type { RuntimeState } from './state.js'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Ref } from 'effect'
import {
  failureRetryDelayMs,
  handleWorkerExitInState,
  initialRuntimeState,
  isDispatchEligible,
  makeOrchestratorState,
  sortCandidates,
  tryMarkRunningInState,
} from './state.js'

export const config: ServiceConfig = {
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

describe('orchestrator state rules', () => {
  it('sorts candidates by priority, creation time, then identifier', () => {
    expect(sortCandidates([
      issue({ identifier: 'SYM-3', priority: null, createdAt: '2026-05-14T00:00:00Z' }),
      issue({ identifier: 'SYM-2', priority: 1, createdAt: '2026-05-14T00:02:00Z' }),
      issue({ identifier: 'SYM-1', priority: 1, createdAt: '2026-05-14T00:01:00Z' }),
    ]).map(candidate => candidate.identifier)).toEqual(['SYM-1', 'SYM-2', 'SYM-3'])
  })

  it('rejects duplicate, blocked Todo, and slot-exhausted dispatches', () => {
    const blocked = issue({
      blockedBy: [{ id: 'b1', identifier: 'SYM-0', state: 'Todo' }],
    })
    const owner = makeOwner('attempt-current', 1000)
    const [marked, markedState] = tryMarkRunningInState(initialRuntimeState(), issue(), config, 0, null, '/tmp/SYM-1', owner)

    expect(marked).toBe(true)
    expect(isDispatchEligible(issue(), markedState, config)).toBe(false)
    expect(isDispatchEligible(blocked, initialRuntimeState(), config)).toBe(false)
    expect(isDispatchEligible(issue({ id: 'issue-2', identifier: 'SYM-2' }), markedState, {
      ...config,
      agent: {
        ...config.agent,
        maxConcurrentAgents: 1,
      },
    })).toBe(false)
  })

  it('schedules continuation and capped failure retries on worker exit', () => {
    const owner = makeOwner('attempt-initial', 0, 2)
    const [_, runningState] = tryMarkRunningInState(initialRuntimeState(), issue(), config, 0, 2, '/tmp/SYM-1', owner)
    const normal = handleWorkerExitInState(runningState, owner, { _tag: 'normal' }, config, 5000)
    const failed = handleWorkerExitInState(runningState, owner, { _tag: 'failed', error: 'boom' }, {
      ...config,
      agent: {
        ...config.agent,
        maxRetryBackoffMs: 15000,
      },
    }, 5000)

    expect(normal.retryAttempts.get('issue-1')).toMatchObject({
      attempt: 1,
      dueAtMs: 6000,
      error: null,
    })
    expect(failed.retryAttempts.get('issue-1')).toMatchObject({
      attempt: 3,
      dueAtMs: 20000,
      error: 'boom',
    })
    expect(failureRetryDelayMs(6, {
      ...config,
      agent: {
        ...config.agent,
        maxRetryBackoffMs: 300000,
      },
    })).toBe(300000)
  })

  it.effect('fences stale worker exits and codex events by owner token', () =>
    Effect.gen(function* () {
      const oldOwner = makeOwner('attempt-old', 1000)
      const currentOwner = makeOwner('attempt-new', 2000)
      const [_, firstAttemptState] = tryMarkRunningInState(
        initialRuntimeState(),
        issue(),
        config,
        0,
        null,
        '/tmp/SYM-1',
        oldOwner,
      )
      const stateWithCurrentAttempt = {
        ...firstAttemptState,
        running: new Map(firstAttemptState.running).set(
          'issue-1',
          {
            ...firstAttemptState.running.get('issue-1')!,
            attemptId: currentOwner.attemptId,
            startedAtMs: currentOwner.startedAtMs,
          },
        ),
      }
      const afterOldExit = handleWorkerExitInState(stateWithCurrentAttempt, oldOwner, {
        _tag: 'normal',
      }, config, 5000)
      const ref = yield* Ref.make<RuntimeState>(stateWithCurrentAttempt as RuntimeState)
      const state = makeOrchestratorState(ref)
      yield* state.recordCodexEvent(oldOwner, event({
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      }))

      const afterOldEvent = yield* state.get

      yield* state.recordCodexEvent(currentOwner, event({
        timestamp: 2500,
        usage: { inputTokens: 13, outputTokens: 8, totalTokens: 21 },
      }))

      const afterCurrentEvent = yield* state.get

      expect(afterOldExit.running.get('issue-1')?.attemptId).toBe('attempt-new')
      expect(afterOldExit.retryAttempts.has('issue-1')).toBe(false)
      expect(afterOldEvent.running.get('issue-1')?.session).toBeNull()
      expect(afterCurrentEvent.running.get('issue-1')?.session?.codexInputTokens).toBe(13)
      expect(afterCurrentEvent.running.get('issue-1')?.session?.codexOutputTokens).toBe(8)
      expect(afterCurrentEvent.running.get('issue-1')?.session?.lastCodexMessage).toBe(null)
    }))

  it('does not retry terminal worker completion and marks issue completed', () => {
    const owner = makeOwner('attempt-terminal', 0)
    const [, runningState] = tryMarkRunningInState(initialRuntimeState(), issue(), config, 0, null, '/tmp/SYM-1', owner)
    const canceled = handleWorkerExitInState(runningState, owner, {
      _tag: 'canceled',
      error: 'issue state Done is terminal',
      cause: 'terminal',
    }, config, 5000)

    expect(canceled.running.has('issue-1')).toBe(false)
    expect(canceled.claimed.has('issue-1')).toBe(false)
    expect(canceled.completed.has('issue-1')).toBe(true)
    expect(canceled.retryAttempts.has('issue-1')).toBe(false)
  })

  it.effect('grants one-shot terminal cleanup authorization for the interrupted owner', () =>
    Effect.gen(function* () {
      const ref = yield* Ref.make(initialRuntimeState())
      const state = makeOrchestratorState(ref)
      const owner = makeOwner('attempt-terminal-reconcile', 1000)
      const [, runningState] = tryMarkRunningInState(initialRuntimeState(), issue(), config, 1000, null, '/tmp/SYM-1', owner)

      yield* state.set(runningState)
      const interruptions = yield* state.reconcileRunning([issue({ state: 'Done' })], config, 5000)
      const granted = yield* state.getTerminalCleanupAuthorization(owner)
      const consumed = yield* state.consumeTerminalCleanupAuthorization(owner)
      const consumedAgain = yield* state.consumeTerminalCleanupAuthorization(owner)
      const snapshot = yield* state.get

      expect(interruptions).toHaveLength(1)
      expect(interruptions[0]).toMatchObject({
        owner: {
          attemptId: 'attempt-terminal-reconcile',
        },
        intent: {
          cause: 'terminal',
          cleanup: true,
          issue: {
            state: 'Done',
          },
        },
      })
      expect(snapshot.running.has('issue-1')).toBe(false)
      expect(snapshot.completed.has('issue-1')).toBe(true)
      expect(granted).toMatchObject({
        owner: {
          attemptId: 'attempt-terminal-reconcile',
        },
        issue: {
          state: 'Done',
        },
        reason: 'issue state Done is terminal',
      })
      expect(consumed).toEqual(granted)
      expect(consumedAgain).toBeNull()
    }))

  it.effect('revokes stale cleanup authorization when a new owner claims the issue', () =>
    Effect.gen(function* () {
      const ref = yield* Ref.make(initialRuntimeState())
      const state = makeOrchestratorState(ref)
      const oldOwner = makeOwner('attempt-old-terminal', 1000)
      const newOwner = makeOwner('attempt-new-active', 6000)
      const [, runningState] = tryMarkRunningInState(initialRuntimeState(), issue(), config, 1000, null, '/tmp/SYM-1', oldOwner)

      yield* state.set(runningState)
      yield* state.reconcileRunning([issue({ state: 'Done' })], config, 5000)

      expect(yield* state.getTerminalCleanupAuthorization(oldOwner)).not.toBeNull()

      const marked = yield* state.tryMarkRunning(issue(), config, 6000, 1, '/tmp/SYM-1', newOwner)

      expect(marked).toBe(true)
      expect(yield* state.getTerminalCleanupAuthorization(oldOwner)).toBeNull()
      expect(yield* state.consumeTerminalCleanupAuthorization(oldOwner)).toBeNull()
    }))

  it.effect('fences due retry consumption by token and keeps replaced retries intact', () =>
    Effect.gen(function* () {
      const ref = yield* Ref.make(initialRuntimeState())
      const state = makeOrchestratorState(ref)

      yield* state.scheduleRetry(issue(), 1, 'first failure', 0, 1000)
      const firstToken = (yield* state.get).retryAttempts.get('issue-1')?.retryToken

      expect(firstToken).toBeDefined()
      expect(yield* state.consumeDueRetry('issue-1', 'retry-token-mismatch', 1000)).toBeNull()

      yield* state.scheduleRetry(issue(), 2, 'replaced failure', 0, 1001)
      const replacedToken = (yield* state.get).retryAttempts.get('issue-1')?.retryToken

      expect(replacedToken).toBeDefined()
      expect(replacedToken).not.toBe(firstToken)
      expect(yield* state.consumeDueRetry('issue-1', firstToken!, 1001)).toBeNull()

      const consumed = yield* state.consumeDueRetry('issue-1', replacedToken!, 1001)

      expect(consumed).toEqual({
        issueId: 'issue-1',
        attempt: 2,
        retryToken: replacedToken,
      })
      expect((yield* state.get).retryAttempts.has('issue-1')).toBe(false)
      expect((yield* state.get).claimed.has('issue-1')).toBe(false)
    }))

  it.effect('aggregates token deltas and exposes live runtime in snapshots', () =>
    Effect.gen(function* () {
      const ref = yield* Ref.make(initialRuntimeState())
      const state = makeOrchestratorState(ref)
      const owner = makeOwner('attempt-running', 1000)
      const [, runningState] = tryMarkRunningInState(
        initialRuntimeState(),
        issue(),
        config,
        1000,
        null,
        '/tmp/SYM-1',
        owner,
      )

      yield* state.set(runningState)
      yield* state.recordCodexEvent(owner, event({
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }))
      yield* state.recordCodexEvent(owner, event({
        timestamp: 2200,
        usage: { inputTokens: 13, outputTokens: 8, totalTokens: 21 },
        rateLimits: { remaining: 1 },
      }))

      const snapshot = yield* state.snapshot(config, 3000)

      expect(snapshot.codexTotals).toMatchObject({
        inputTokens: 13,
        outputTokens: 8,
        totalTokens: 21,
        secondsRunning: 2,
      })
      expect(snapshot.rateLimits).toEqual({ remaining: 1 })
      expect('attemptId' in (snapshot.running[0] as object)).toBe(false)
      expect('owner' in (snapshot.running[0] as object)).toBe(false)
      expect('fiber' in (snapshot.running[0] as object)).toBe(false)
    }))
})

export function issue(overrides: Partial<Issue> = {}): Issue {
  return {
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
    ...overrides,
  }
}

function event(overrides: Partial<CodexRuntimeEvent> = {}): CodexRuntimeEvent {
  const base: CodexRuntimeEvent = {
    type: 'protocol_notification',
    event: 'thread/tokenUsage/updated',
    timestamp: 2000,
    codexAppServerPid: null,
    sessionId: 'thread-1-turn-1',
    message: null,
    usage: null,
    rateLimits: null,
    method: 'thread/tokenUsage/updated',
    threadId: 'thread-1',
    turnId: 'turn-1',
    details: {},
  }

  return {
    ...base,
    ...overrides,
  } as CodexRuntimeEvent
}

function makeOwner(attemptId: string, startedAtMs: number, attempt: number | null = null): AttemptOwner {
  return {
    issueId: 'issue-1',
    issueIdentifier: 'SYM-1',
    attempt,
    attemptId,
    workspacePath: '/tmp/SYM-1',
    startedAtMs,
  }
}
