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
import type { AttemptOwner, WorkerInterruptionIntent } from './attempt-owner.js'
import { Context, Effect, Layer, Ref } from 'effect'
import { normalizeStateName } from '../domain/types.js'
import { ownerKey, workerOwnersMatch } from './attempt-owner.js'

interface WorkerExitCancellationCause {
  readonly terminal: true
  readonly not_active: true
}

export interface RuntimeRunningIssue extends RunningIssue {
  readonly attemptId: string
}

export interface RuntimeState {
  readonly running: ReadonlyMap<string, RuntimeRunningIssue>
  readonly claimed: ReadonlySet<string>
  readonly retryAttempts: ReadonlyMap<string, RetryEntry>
  readonly completed: ReadonlySet<string>
  readonly terminalCleanupAuthorizations: ReadonlyMap<string, TerminalCleanupAuthorization>
  readonly codexTotals: CodexTotals
  readonly rateLimits: unknown
}

export type WorkerExitReason
  = { readonly _tag: 'normal' }
    | { readonly _tag: 'failed', readonly error: string }
    | {
      readonly _tag: 'canceled'
      readonly error: string
      readonly cause: keyof WorkerExitCancellationCause | 'stalled' | 'manual'
      readonly grantCleanup?: boolean
    }

export interface TerminalCleanupAuthorization {
  readonly owner: AttemptOwner
  readonly issue: Issue
  readonly reason: string
  readonly grantedAtMs: number
}

export interface WorkerInterruptionCommand {
  readonly owner: AttemptOwner
  readonly intent: WorkerInterruptionIntent
}

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
    owner: AttemptOwner,
  ) => Effect.Effect<boolean>
  readonly isCurrentOwner: (owner: AttemptOwner) => Effect.Effect<boolean>
  readonly recordCodexEvent: (owner: AttemptOwner, event: CodexRuntimeEvent) => Effect.Effect<void>
  readonly handleWorkerExit: (
    owner: AttemptOwner,
    reason: WorkerExitReason,
    config: ServiceConfig,
    nowMs: number,
  ) => Effect.Effect<void>
  readonly reconcileRunning: (
    refreshed: ReadonlyArray<Issue>,
    config: ServiceConfig,
    nowMs: number,
  ) => Effect.Effect<ReadonlyArray<WorkerInterruptionCommand>>
  readonly getTerminalCleanupAuthorization: (owner: AttemptOwner) => Effect.Effect<TerminalCleanupAuthorization | null>
  readonly consumeTerminalCleanupAuthorization: (owner: AttemptOwner) => Effect.Effect<TerminalCleanupAuthorization | null>
  readonly scheduleRetry: (
    issue: Pick<Issue, 'id' | 'identifier'>,
    attempt: number,
    error: string | null,
    delayMs: number,
    nowMs: number,
  ) => Effect.Effect<void>
  readonly consumeDueRetry: (
    issueId: string,
    retryToken: string,
    nowMs: number,
  ) => Effect.Effect<Pick<RetryEntry, 'issueId' | 'attempt' | 'retryToken'> | null>
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

let nextRetryToken = 0

export function initialRuntimeState(): RuntimeState {
  return {
    running: new Map(),
    claimed: new Set(),
    retryAttempts: new Map(),
    completed: new Set(),
    terminalCleanupAuthorizations: new Map(),
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
    tryMarkRunning: (issue, config, nowMs, attempt, workspacePath, owner) =>
      Ref.modify(ref, state => tryMarkRunningInState(state, issue, config, nowMs, attempt, workspacePath, owner)),
    isCurrentOwner: owner =>
      Ref.get(ref).pipe(
        Effect.map(state => isCurrentStateOwner(state, owner)),
      ),
    recordCodexEvent: (owner, event) =>
      Ref.update(ref, state => recordCodexEventInState(state, owner, event)),
    handleWorkerExit: (owner, reason, config, nowMs) =>
      Ref.update(ref, state => handleWorkerExitInState(state, owner, reason, config, nowMs)),
    reconcileRunning: (refreshed, config, nowMs) =>
      Ref.modify(ref, state => reconcileRunningInState(state, refreshed, config, nowMs)),
    getTerminalCleanupAuthorization: owner =>
      Ref.get(ref).pipe(
        Effect.map(state => terminalCleanupAuthorizationInState(state, owner)),
      ),
    consumeTerminalCleanupAuthorization: owner =>
      Ref.modify(ref, state => consumeTerminalCleanupAuthorizationInState(state, owner)),
    scheduleRetry: (issue, attempt, error, delayMs, nowMs) =>
      Ref.update(ref, state => scheduleRetryInState(state, issue, attempt, error, delayMs, nowMs)),
    consumeDueRetry: (issueId, retryToken, nowMs) =>
      Ref.modify(ref, state => consumeDueRetryInState(state, issueId, retryToken, nowMs)),
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
  return Math.min(10_000 * 2 ** Math.max(attempt - 1, 0), config.agent.maxRetryBackoffMs)
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
    running: [...state.running.values()].map(toPublicRunningIssue),
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
  owner: AttemptOwner,
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
      attemptId: owner.attemptId,
    }),
    claimed: new Set(state.claimed).add(issue.id),
    retryAttempts: withoutMapValue(state.retryAttempts, issue.id),
    terminalCleanupAuthorizations: withoutCleanupAuthorizationForIssue(state.terminalCleanupAuthorizations, issue.id),
  }]
}

export function scheduleRetryInState(
  state: RuntimeState,
  issue: Pick<Issue, 'id' | 'identifier'>,
  attempt: number,
  error: string | null,
  delayMs: number,
  nowMs: number,
): RuntimeState {
  const retryToken = makeRetryToken(issue.id, attempt, nowMs)

  return {
    ...state,
    claimed: new Set(state.claimed).add(issue.id),
    retryAttempts: new Map(state.retryAttempts).set(issue.id, {
      issueId: issue.id,
      identifier: issue.identifier,
      attempt,
      dueAtMs: nowMs + delayMs,
      retryToken,
      error,
    }),
  }
}

function makeRetryToken(issueId: string, attempt: number, nowMs: number): string {
  nextRetryToken += 1

  return `${issueId}:${attempt}:${nowMs}:${nextRetryToken}`
}

function consumeDueRetryInState(
  state: RuntimeState,
  issueId: string,
  retryToken: string,
  nowMs: number,
): [Pick<RetryEntry, 'issueId' | 'attempt' | 'retryToken'> | null, RuntimeState] {
  const retry = state.retryAttempts.get(issueId)

  if (retry === undefined || retry.retryToken !== retryToken || retry.dueAtMs > nowMs) {
    return [null, state]
  }

  return [
    {
      issueId: retry.issueId,
      attempt: retry.attempt,
      retryToken: retry.retryToken,
    },
    {
      ...state,
      retryAttempts: withoutMapValue(state.retryAttempts, issueId),
      claimed: withoutSetValue(state.claimed, issueId),
    },
  ]
}

export function handleWorkerExitInState(
  state: RuntimeState,
  owner: AttemptOwner,
  reason: WorkerExitReason,
  config: ServiceConfig,
  nowMs: number,
): RuntimeState {
  const running = state.running.get(owner.issueId)

  if (running === undefined || !runningAttemptMatches(running, owner)) {
    return state
  }

  const baseState: RuntimeState = {
    ...state,
    running: withoutMapValue(state.running, owner.issueId),
    claimed: withoutSetValue(state.claimed, owner.issueId),
    codexTotals: {
      ...state.codexTotals,
      secondsRunning: state.codexTotals.secondsRunning + Math.max(nowMs - running.startedAtMs, 0) / 1000,
    },
  }

  if (reason._tag === 'normal') {
    return scheduleRetryInState(
      {
        ...baseState,
        completed: new Set(baseState.completed).add(owner.issueId),
      },
      running.issue,
      1,
      null,
      continuationRetryDelayMs(),
      nowMs,
    )
  }

  if (reason._tag === 'canceled' && reason.cause === 'terminal') {
    const terminalState = {
      ...baseState,
      completed: new Set(baseState.completed).add(owner.issueId),
    }

    if (reason.grantCleanup !== true) {
      return terminalState
    }

    return {
      ...terminalState,
      terminalCleanupAuthorizations: new Map(terminalState.terminalCleanupAuthorizations).set(ownerKey(owner), {
        owner,
        issue: running.issue,
        reason: reason.error,
        grantedAtMs: nowMs,
      }),
    }
  }

  if (reason._tag === 'canceled' && reason.cause === 'not_active') {
    return baseState
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

export function removeRunningForReconciliation(
  state: RuntimeState,
  owner: AttemptOwner,
  addCompleted: boolean,
): RuntimeState {
  const running = state.running.get(owner.issueId)

  if (running === undefined || !runningAttemptMatches(running, owner)) {
    return state
  }

  return {
    ...state,
    running: withoutMapValue(state.running, owner.issueId),
    claimed: withoutSetValue(state.claimed, owner.issueId),
    completed: addCompleted ? new Set(state.completed).add(owner.issueId) : state.completed,
  }
}

function reconcileRunningInState(
  state: RuntimeState,
  refreshed: ReadonlyArray<Issue>,
  config: ServiceConfig,
  nowMs: number,
): [ReadonlyArray<WorkerInterruptionCommand>, RuntimeState] {
  const refreshResult = reconcileRefreshedRunningIssuesInState(state, refreshed, config, nowMs)
  const staleResult = reconcileStalledRunsInState(refreshResult.state, config, nowMs)

  return [[...refreshResult.interruptions, ...staleResult.interruptions], staleResult.state]
}

function reconcileRefreshedRunningIssuesInState(
  state: RuntimeState,
  refreshed: ReadonlyArray<Issue>,
  config: ServiceConfig,
  nowMs: number,
): { readonly state: RuntimeState, readonly interruptions: ReadonlyArray<WorkerInterruptionCommand> } {
  let nextState = state
  const interruptions: Array<WorkerInterruptionCommand> = []

  for (const issue of refreshed) {
    const running = nextState.running.get(issue.id)

    if (running === undefined) {
      continue
    }

    const owner = ownerFromRunning(running)

    if (isTerminalIssue(issue, config)) {
      const reason = `issue state ${issue.state} is terminal`
      nextState = {
        ...nextState,
        running: new Map(nextState.running).set(issue.id, {
          ...running,
          issue,
        }),
      }
      nextState = handleWorkerExitInState(
        nextState,
        owner,
        {
          _tag: 'canceled',
          error: reason,
          cause: 'terminal',
          grantCleanup: true,
        },
        config,
        nowMs,
      )
      interruptions.push(makeInterruption(running, 'terminal', true, reason, issue))
      continue
    }

    if (!isActiveIssue(issue, config)) {
      const reason = `issue state ${issue.state} is no longer active`
      nextState = handleWorkerExitInState(
        nextState,
        owner,
        {
          _tag: 'canceled',
          error: reason,
          cause: 'not_active',
        },
        config,
        nowMs,
      )
      interruptions.push(makeInterruption(running, 'not_active', false, reason, issue))
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

  return { state: nextState, interruptions }
}

function reconcileStalledRunsInState(
  state: RuntimeState,
  config: ServiceConfig,
  nowMs: number,
): { readonly state: RuntimeState, readonly interruptions: ReadonlyArray<WorkerInterruptionCommand> } {
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

function makeInterruption(
  running: RuntimeRunningIssue,
  cause: WorkerInterruptionIntent['cause'],
  cleanup: boolean,
  reason: string,
  issue?: Issue,
): WorkerInterruptionCommand {
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

function terminalCleanupAuthorizationInState(
  state: RuntimeState,
  owner: AttemptOwner,
): TerminalCleanupAuthorization | null {
  const authorization = state.terminalCleanupAuthorizations.get(ownerKey(owner))

  if (authorization === undefined || !workerOwnersMatch(authorization.owner, owner)) {
    return null
  }

  return authorization
}

function consumeTerminalCleanupAuthorizationInState(
  state: RuntimeState,
  owner: AttemptOwner,
): [TerminalCleanupAuthorization | null, RuntimeState] {
  const authorization = terminalCleanupAuthorizationInState(state, owner)

  if (authorization === null) {
    return [null, state]
  }

  return [authorization, {
    ...state,
    terminalCleanupAuthorizations: withoutMapValue(state.terminalCleanupAuthorizations, ownerKey(owner)),
  }]
}

function recordCodexEventInState(
  state: RuntimeState,
  owner: AttemptOwner,
  event: CodexRuntimeEvent,
): RuntimeState {
  const running = state.running.get(owner.issueId)

  if (running === undefined || !runningAttemptMatches(running, owner)) {
    return state
  }

  const previousSession = running.session
  const session = updateLiveSession(previousSession, event)
  const tokenDelta = tokenDeltaFromEvent(previousSession, event)

  return {
    ...state,
    running: new Map(state.running).set(owner.issueId, {
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

function isCurrentStateOwner(state: RuntimeState, owner: AttemptOwner): boolean {
  const running = state.running.get(owner.issueId)

  return running !== undefined && runningAttemptMatches(running, owner)
}

function isActiveIssue(issue: Issue, config: ServiceConfig): boolean {
  const normalized = normalizeStateName(issue.state)

  return config.tracker.activeStates.some(state => normalizeStateName(state) === normalized)
}

function isTerminalIssue(issue: Issue, config: ServiceConfig): boolean {
  const normalized = normalizeStateName(issue.state)

  return config.tracker.terminalStates.some(state => normalizeStateName(state) === normalized)
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

function runningAttemptMatches(running: RuntimeRunningIssue, owner: AttemptOwner): boolean {
  return workerOwnersMatch(ownerFromRunning(running), owner)
}

function toPublicRunningIssue(running: RuntimeRunningIssue): RunningIssue {
  return {
    issue: running.issue,
    attempt: running.attempt,
    startedAtMs: running.startedAtMs,
    workspacePath: running.workspacePath,
    session: running.session,
  }
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

function withoutCleanupAuthorizationForIssue(
  authorizations: ReadonlyMap<string, TerminalCleanupAuthorization>,
  issueId: string,
): Map<string, TerminalCleanupAuthorization> {
  const next = new Map(authorizations)

  for (const [key, authorization] of next) {
    if (authorization.owner.issueId === issueId) {
      next.delete(key)
    }
  }

  return next
}
