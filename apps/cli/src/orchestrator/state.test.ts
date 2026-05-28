import type { CodexRuntimeEvent } from '../agent-runner/codex.js'
import type { Issue, ServiceConfig } from '../domain/types.js'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Ref } from 'effect'
import {
  attachWorkerFiberInState,
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
    const [marked, state] = tryMarkRunningInState(initialRuntimeState(), issue(), config, 0, null, null)

    expect(marked).toBe(true)
    expect(isDispatchEligible(issue(), state, config)).toBe(false)
    expect(isDispatchEligible(blocked, initialRuntimeState(), config)).toBe(false)
    expect(isDispatchEligible(issue({ id: 'issue-2', identifier: 'SYM-2' }), state, {
      ...config,
      agent: {
        ...config.agent,
        maxConcurrentAgents: 1,
      },
    })).toBe(false)
  })

  it('schedules continuation and capped failure retries on worker exit', () => {
    const [_, runningState] = tryMarkRunningInState(initialRuntimeState(), issue(), config, 0, 2, '/tmp/SYM-1')
    const normal = handleWorkerExitInState(runningState, 'issue-1', { _tag: 'normal' }, config, 5000)
    const failed = handleWorkerExitInState(runningState, 'issue-1', { _tag: 'failed', error: 'boom' }, {
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

  it('fences stale worker exits and codex events by attempt id', () => {
    const [_, firstAttemptState] = tryMarkRunningInState(
      initialRuntimeState(),
      issue(),
      config,
      0,
      null,
      '/tmp/SYM-1',
      'attempt-old',
    )
    const newAttemptState = {
      ...firstAttemptState,
      running: new Map(firstAttemptState.running).set('issue-1', {
        ...firstAttemptState.running.get('issue-1')!,
        ownership: {
          attemptId: 'attempt-new',
          workerFiber: null,
        },
      }),
    }

    const afterOldExit = handleWorkerExitInState(
      newAttemptState,
      'issue-1',
      { _tag: 'normal' },
      config,
      5000,
      'attempt-old',
    )

    expect(afterOldExit.running.get('issue-1')?.ownership?.attemptId).toBe('attempt-new')
    expect(afterOldExit.retryAttempts.has('issue-1')).toBe(false)
  })

  it('attaches worker fibers only to the current attempt owner', () => {
    const fakeFiber = { id: 1 } as never
    const [_, runningState] = tryMarkRunningInState(
      initialRuntimeState(),
      issue(),
      config,
      0,
      null,
      '/tmp/SYM-1',
      'attempt-current',
    )

    const [staleAttached, afterStaleAttach] = attachWorkerFiberInState(
      runningState,
      'issue-1',
      'attempt-stale',
      fakeFiber,
    )
    const [currentAttached, afterCurrentAttach] = attachWorkerFiberInState(
      afterStaleAttach,
      'issue-1',
      'attempt-current',
      fakeFiber,
    )

    expect(staleAttached).toBe(false)
    expect(currentAttached).toBe(true)
    expect(afterCurrentAttach.running.get('issue-1')?.ownership?.workerFiber).toBe(fakeFiber)
  })

  it.effect('aggregates token deltas and exposes live runtime in snapshots', () =>
    Effect.gen(function* () {
      const ref = yield* Ref.make(initialRuntimeState())
      const state = makeOrchestratorState(ref)
      yield* state.set(tryMarkRunningInState(initialRuntimeState(), issue(), config, 1000, null, null)[1])

      yield* state.recordCodexEvent('issue-1', event({
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }))
      yield* state.recordCodexEvent('issue-1', event({
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
