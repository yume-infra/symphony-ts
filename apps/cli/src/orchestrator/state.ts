import type { CodexRuntimeEvent } from '../agent-runner/codex.js'
import type {
  CodexTotals,
  Issue,
  LiveSession,
  OrchestratorSnapshot,
  RetryEntry,
  RunningIssue,
  ServiceConfig,
} from '../domain/types.js'
import { Context, Effect, Layer, Ref } from 'effect'
import { normalizeStateName } from '../domain/types.js'

export interface RuntimeState {
  readonly running: ReadonlyMap<string, RunningIssue>
  readonly claimed: ReadonlySet<string>
  readonly retryAttempts: ReadonlyMap<string, RetryEntry>
  readonly completed: ReadonlySet<string>
  readonly codexTotals: CodexTotals
  readonly rateLimits: unknown
}

export type WorkerExitReason
  = | { readonly _tag: 'normal' }
    | { readonly _tag: 'failed', readonly error: string }
    | { readonly _tag: 'stalled', readonly error: string }
    | { readonly _tag: 'canceled', readonly error: string }

export interface OrchestratorStateShape {
  readonly get: Effect.Effect<RuntimeState>
  readonly set: (state: RuntimeState) => Effect.Effect<void>
  readonly snapshot: (config: ServiceConfig, nowMs: number) => Effect.Effect<OrchestratorSnapshot>
  readonly tryMarkRunning: (
    issue: Issue,
    config: ServiceConfig,
    nowMs: number,
    attempt: number | null,
    workspacePath: string | null,
  ) => Effect.Effect<boolean>
  readonly recordCodexEvent: (issueId: string, event: CodexRuntimeEvent) => Effect.Effect<void>
  readonly handleWorkerExit: (
    issueId: string,
    reason: WorkerExitReason,
    config: ServiceConfig,
    nowMs: number,
  ) => Effect.Effect<void>
  readonly scheduleRetry: (
    issue: Pick<Issue, 'id' | 'identifier'>,
    attempt: number,
    error: string | null,
    delayMs: number,
    nowMs: number,
  ) => Effect.Effect<void>
  readonly releaseClaim: (issueId: string) => Effect.Effect<void>
}

export class OrchestratorState extends Context.Service<OrchestratorState, OrchestratorStateShape>()(
  'symphony/OrchestratorState',
) {}

export const OrchestratorStateLive = Layer.effect(OrchestratorState)(
  Ref.make(initialRuntimeState()).pipe(
    Effect.map(ref => makeOrchestratorState(ref)),
  ),
)

export function initialRuntimeState(): RuntimeState {
  return {
    running: new Map(),
    claimed: new Set(),
    retryAttempts: new Map(),
    completed: new Set(),
    codexTotals: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      secondsRunning: 0,
    },
    rateLimits: null,
  }
}

export function makeOrchestratorState(ref: Ref.Ref<RuntimeState>): OrchestratorStateShape {
  return {
    get: Ref.get(ref),
    set: state => Ref.set(ref, state),
    snapshot: (config, nowMs) =>
      Ref.get(ref).pipe(
        Effect.map(state => snapshotFromState(state, config, nowMs)),
      ),
    tryMarkRunning: (issue, config, nowMs, attempt, workspacePath) =>
      Ref.modify(ref, state => tryMarkRunningInState(state, issue, config, nowMs, attempt, workspacePath)),
    recordCodexEvent: (issueId, event) =>
      Ref.update(ref, state => recordCodexEventInState(state, issueId, event)),
    handleWorkerExit: (issueId, reason, config, nowMs) =>
      Ref.update(ref, state => handleWorkerExitInState(state, issueId, reason, config, nowMs)),
    scheduleRetry: (issue, attempt, error, delayMs, nowMs) =>
      Ref.update(ref, state => scheduleRetryInState(state, issue, attempt, error, delayMs, nowMs)),
    releaseClaim: issueId =>
      Ref.update(ref, state => ({
        ...state,
        claimed: withoutSetValue(state.claimed, issueId),
        retryAttempts: withoutMapValue(state.retryAttempts, issueId),
      })),
  }
}

export function sortCandidates(issues: ReadonlyArray<Issue>): ReadonlyArray<Issue> {
  return [...issues].sort((left, right) => {
    const priority = priorityRank(left.priority) - priorityRank(right.priority)

    if (priority !== 0) {
      return priority
    }

    const created = timestampRank(left.createdAt) - timestampRank(right.createdAt)

    if (created !== 0) {
      return created
    }

    return left.identifier.localeCompare(right.identifier)
  })
}

export function isDispatchEligible(issue: Issue, state: RuntimeState, config: ServiceConfig): boolean {
  if (issue.id === '' || issue.identifier === '' || issue.title === '' || issue.state === '') {
    return false
  }

  const normalizedState = normalizeStateName(issue.state)

  if (!config.tracker.activeStates.some(activeState => normalizeStateName(activeState) === normalizedState)) {
    return false
  }

  if (config.tracker.terminalStates.some(terminalState => normalizeStateName(terminalState) === normalizedState)) {
    return false
  }

  if (state.running.has(issue.id) || state.claimed.has(issue.id)) {
    return false
  }

  if (availableGlobalSlots(state, config) <= 0) {
    return false
  }

  if (availableStateSlots(state, config, issue.state) <= 0) {
    return false
  }

  if (normalizedState === 'todo') {
    return !issue.blockedBy.some(blocker => blocker.state === null || !isTerminalState(blocker.state, config))
  }

  return true
}

function continuationRetryDelayMs(): number {
  return 1000
}

export function failureRetryDelayMs(attempt: number, config: ServiceConfig): number {
  return Math.min(10000 * 2 ** Math.max(attempt - 1, 0), config.agent.maxRetryBackoffMs)
}

function snapshotFromState(
  state: RuntimeState,
  config: ServiceConfig,
  nowMs: number,
): OrchestratorSnapshot {
  const activeSeconds = [...state.running.values()]
    .reduce((sum, running) => sum + Math.max(nowMs - running.startedAtMs, 0) / 1000, 0)

  return {
    pollIntervalMs: config.polling.intervalMs,
    maxConcurrentAgents: config.agent.maxConcurrentAgents,
    running: [...state.running.values()],
    retrying: [...state.retryAttempts.values()].sort((left, right) => left.dueAtMs - right.dueAtMs),
    codexTotals: {
      ...state.codexTotals,
      secondsRunning: state.codexTotals.secondsRunning + activeSeconds,
    },
    rateLimits: state.rateLimits,
  }
}

export function tryMarkRunningInState(
  state: RuntimeState,
  issue: Issue,
  config: ServiceConfig,
  nowMs: number,
  attempt: number | null,
  workspacePath: string | null,
): [boolean, RuntimeState] {
  if (!isDispatchEligible(issue, state, config)) {
    return [false, state]
  }

  return [true, {
    ...state,
    running: new Map(state.running).set(issue.id, {
      issue,
      attempt,
      startedAtMs: nowMs,
      workspacePath,
      session: null,
    }),
    claimed: new Set(state.claimed).add(issue.id),
    retryAttempts: withoutMapValue(state.retryAttempts, issue.id),
  }]
}

function scheduleRetryInState(
  state: RuntimeState,
  issue: Pick<Issue, 'id' | 'identifier'>,
  attempt: number,
  error: string | null,
  delayMs: number,
  nowMs: number,
): RuntimeState {
  return {
    ...state,
    claimed: new Set(state.claimed).add(issue.id),
    retryAttempts: new Map(state.retryAttempts).set(issue.id, {
      issueId: issue.id,
      identifier: issue.identifier,
      attempt,
      dueAtMs: nowMs + delayMs,
      error,
    }),
  }
}

export function handleWorkerExitInState(
  state: RuntimeState,
  issueId: string,
  reason: WorkerExitReason,
  config: ServiceConfig,
  nowMs: number,
): RuntimeState {
  const running = state.running.get(issueId)

  if (running === undefined) {
    return state
  }

  const baseState: RuntimeState = {
    ...state,
    running: withoutMapValue(state.running, issueId),
    codexTotals: {
      ...state.codexTotals,
      secondsRunning: state.codexTotals.secondsRunning + Math.max(nowMs - running.startedAtMs, 0) / 1000,
    },
  }

  if (reason._tag === 'normal') {
    return scheduleRetryInState(
      {
        ...baseState,
        completed: new Set(baseState.completed).add(issueId),
      },
      running.issue,
      1,
      null,
      continuationRetryDelayMs(),
      nowMs,
    )
  }

  const nextAttempt = (running.attempt ?? 0) + 1

  return scheduleRetryInState(
    baseState,
    running.issue,
    nextAttempt,
    reason.error,
    failureRetryDelayMs(nextAttempt, config),
    nowMs,
  )
}

function recordCodexEventInState(
  state: RuntimeState,
  issueId: string,
  event: CodexRuntimeEvent,
): RuntimeState {
  const running = state.running.get(issueId)

  if (running === undefined) {
    return state
  }

  const previousSession = running.session
  const session = updateLiveSession(previousSession, event)
  const tokenDelta = tokenDeltaFromEvent(previousSession, event)

  return {
    ...state,
    running: new Map(state.running).set(issueId, {
      ...running,
      session,
    }),
    codexTotals: {
      inputTokens: state.codexTotals.inputTokens + tokenDelta.inputTokens,
      outputTokens: state.codexTotals.outputTokens + tokenDelta.outputTokens,
      totalTokens: state.codexTotals.totalTokens + tokenDelta.totalTokens,
      secondsRunning: state.codexTotals.secondsRunning,
    },
    rateLimits: event.rateLimits ?? state.rateLimits,
  }
}

export function removeRunningForReconciliation(
  state: RuntimeState,
  issueId: string,
  addCompleted: boolean,
): RuntimeState {
  return {
    ...state,
    running: withoutMapValue(state.running, issueId),
    claimed: withoutSetValue(state.claimed, issueId),
    completed: addCompleted ? new Set(state.completed).add(issueId) : state.completed,
  }
}

function updateLiveSession(previous: LiveSession | null, event: CodexRuntimeEvent): LiveSession {
  const sessionId = event.sessionId ?? previous?.sessionId ?? 'unknown-session'
  const [threadId = 'unknown-thread', turnId = 'unknown-turn'] = sessionId.split('-')
  const usage = event.usage

  return {
    sessionId,
    threadId,
    turnId,
    codexAppServerPid: event.codexAppServerPid ?? previous?.codexAppServerPid ?? null,
    lastCodexEvent: event.event,
    lastCodexTimestamp: event.timestamp,
    lastCodexMessage: event.message,
    codexInputTokens: usage?.inputTokens ?? previous?.codexInputTokens ?? 0,
    codexOutputTokens: usage?.outputTokens ?? previous?.codexOutputTokens ?? 0,
    codexTotalTokens: usage?.totalTokens ?? previous?.codexTotalTokens ?? 0,
    lastReportedInputTokens: usage?.inputTokens ?? previous?.lastReportedInputTokens ?? 0,
    lastReportedOutputTokens: usage?.outputTokens ?? previous?.lastReportedOutputTokens ?? 0,
    lastReportedTotalTokens: usage?.totalTokens ?? previous?.lastReportedTotalTokens ?? 0,
    turnCount: Math.max(previous?.turnCount ?? 0, sessionId === previous?.sessionId ? previous?.turnCount ?? 0 : (previous?.turnCount ?? 0) + 1),
  }
}

function tokenDeltaFromEvent(previous: LiveSession | null, event: CodexRuntimeEvent): CodexTotals {
  if (event.usage === null) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      secondsRunning: 0,
    }
  }

  return {
    inputTokens: Math.max(event.usage.inputTokens - (previous?.lastReportedInputTokens ?? 0), 0),
    outputTokens: Math.max(event.usage.outputTokens - (previous?.lastReportedOutputTokens ?? 0), 0),
    totalTokens: Math.max(event.usage.totalTokens - (previous?.lastReportedTotalTokens ?? 0), 0),
    secondsRunning: 0,
  }
}

function availableGlobalSlots(state: RuntimeState, config: ServiceConfig): number {
  return Math.max(config.agent.maxConcurrentAgents - state.running.size, 0)
}

function availableStateSlots(state: RuntimeState, config: ServiceConfig, stateName: string): number {
  const normalized = normalizeStateName(stateName)
  const limit = config.agent.maxConcurrentAgentsByState.get(normalized) ?? config.agent.maxConcurrentAgents
  const runningInState = [...state.running.values()]
    .filter(running => normalizeStateName(running.issue.state) === normalized)
    .length

  return Math.max(limit - runningInState, 0)
}

function isTerminalState(state: string, config: ServiceConfig): boolean {
  const normalized = normalizeStateName(state)

  return config.tracker.terminalStates.some(terminalState => normalizeStateName(terminalState) === normalized)
}

function priorityRank(priority: number | null): number {
  return priority ?? Number.MAX_SAFE_INTEGER
}

function timestampRank(timestamp: string | null): number {
  return timestamp === null ? Number.MAX_SAFE_INTEGER : Date.parse(timestamp)
}

function withoutMapValue<K, V>(map: ReadonlyMap<K, V>, key: K): Map<K, V> {
  const next = new Map(map)
  next.delete(key)

  return next
}

function withoutSetValue<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set)
  next.delete(value)

  return next
}
