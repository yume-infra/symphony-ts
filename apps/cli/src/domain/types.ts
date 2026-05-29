interface BlockerRef {
  readonly id: string | null
  readonly identifier: string | null
  readonly state: string | null
}

export interface Issue {
  readonly id: string
  readonly identifier: string
  readonly title: string
  readonly description: string | null
  readonly priority: number | null
  readonly state: string
  readonly stateType: string | null
  readonly branchName: string | null
  readonly url: string | null
  readonly labels: ReadonlyArray<string>
  readonly blockedBy: ReadonlyArray<BlockerRef>
  readonly createdAt: string | null
  readonly updatedAt: string | null
}

export interface WorkflowDefinition {
  readonly path: string
  readonly directory: string
  readonly config: Record<string, unknown>
  readonly promptTemplate: string
}

interface TrackerConfig {
  readonly kind: string | null
  readonly endpoint: string
  readonly apiKey: string | null
  readonly projectSlug: string | null
  readonly activeStates: ReadonlyArray<string>
  readonly terminalStates: ReadonlyArray<string>
}

interface PollingConfig {
  readonly intervalMs: number
}

export interface WorkspaceConfig {
  readonly root: string
}

export interface HookConfig {
  readonly afterCreate: string | null
  readonly beforeRun: string | null
  readonly afterRun: string | null
  readonly beforeRemove: string | null
  readonly timeoutMs: number
}

interface AgentConfig {
  readonly maxConcurrentAgents: number
  readonly maxTurns: number
  readonly maxRetryBackoffMs: number
  readonly maxConcurrentAgentsByState: ReadonlyMap<string, number>
}

export interface CodexConfig {
  readonly command: string
  readonly approvalPolicy: unknown
  readonly threadSandbox: unknown
  readonly turnSandboxPolicy: unknown
  readonly turnTimeoutMs: number
  readonly readTimeoutMs: number
  readonly stallTimeoutMs: number
}

export interface ServiceConfig {
  readonly workflowPath: string
  readonly workflowDirectory: string
  readonly promptTemplate: string
  readonly tracker: TrackerConfig
  readonly polling: PollingConfig
  readonly workspace: WorkspaceConfig
  readonly hooks: HookConfig
  readonly agent: AgentConfig
  readonly codex: CodexConfig
}

export interface Workspace {
  readonly path: string
  readonly workspaceKey: string
  readonly createdNow: boolean
}

export interface LiveSession {
  readonly sessionId: string
  readonly threadId: string
  readonly turnId: string
  readonly codexAppServerPid: string | null
  readonly lastCodexEvent: string | null
  readonly lastCodexTimestamp: number | null
  readonly lastCodexMessage: string | null
  readonly codexInputTokens: number
  readonly codexOutputTokens: number
  readonly codexTotalTokens: number
  readonly lastReportedInputTokens: number
  readonly lastReportedOutputTokens: number
  readonly lastReportedTotalTokens: number
  readonly turnCount: number
}

export interface RetryEntry {
  readonly issueId: string
  readonly identifier: string
  readonly attempt: number
  readonly dueAtMs: number
  readonly retryToken: string
  readonly error: string | null
}

export interface RunningIssue {
  readonly issue: Issue
  readonly attempt: number | null
  readonly startedAtMs: number
  readonly workspacePath: string | null
  readonly session: LiveSession | null
}

export interface CodexTotals {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
  readonly secondsRunning: number
}

export interface OrchestratorSnapshot {
  readonly pollIntervalMs: number
  readonly maxConcurrentAgents: number
  readonly running: ReadonlyArray<RunningIssue>
  readonly retrying: ReadonlyArray<RetryEntry>
  readonly codexTotals: CodexTotals
  readonly rateLimits: unknown
}

export const DEFAULT_PROMPT = 'You are working on an issue from Linear.'

export function normalizeStateName(state: string): string {
  return state.toLowerCase()
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
