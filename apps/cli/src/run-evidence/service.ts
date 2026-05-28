import type * as Cause from 'effect/Cause'
import type * as Exit from 'effect/Exit'
import type { CodexRuntimeEvent } from '../agent-runner/codex.js'
import type { AgentRunResult } from '../agent-runner/runner.js'
import type { RunEvidenceError } from '../domain/errors.js'
import type { Issue, ServiceConfig } from '../domain/types.js'
import type { WorkspaceBestEffortFailure } from '../workspace/manager.js'
import type {
  CleanupSummary,
  ErrorInfo,
  FileChangeSummary,
  HookOutcome,
  RawSessionReference,
  RunEvidenceEvent,
  RunExitSummary,
  RunSummary,
  TokenUsage,
  ToolCallSummary,
} from './schema.js'
import { dirname, join, normalize, resolve } from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Context, Effect, Cause as EffectCause, Exit as EffectExit, FileSystem, Layer } from 'effect'
import { RunEvidenceError as RunEvidenceWriteError } from '../domain/errors.js'
import { isPlainRecord } from '../domain/types.js'
import { isPathInside, sanitizeWorkspaceKey } from '../workspace/manager.js'
import { redactText, redactUnknown } from './redaction.js'
import { encodeRunEvidenceEventJson, encodeRunSummaryJson } from './schema.js'

export interface RunEvidenceAttemptInput {
  readonly issue: Issue
  readonly attempt: number | null
  readonly config: ServiceConfig
  readonly workspacePath: string | null
  readonly startedAtMs: number
  readonly completedAtMs: number
  readonly workerExit: Exit.Exit<AgentRunResult, unknown>
  readonly codexEvents: ReadonlyArray<CodexRuntimeEvent>
  readonly workspaceFailures: ReadonlyArray<WorkspaceBestEffortFailure>
  readonly cleanup: CleanupSummary
}

export interface RunEvidenceResult {
  readonly directory: string
  readonly summaryMarkdownPath: string
  readonly summaryJsonPath: string
  readonly protocolEventsPath: string
  readonly summary: RunSummary
}

export interface RunEvidenceServiceShape {
  readonly writeAttempt: (input: RunEvidenceAttemptInput) => Effect.Effect<RunEvidenceResult, RunEvidenceError>
}

export class RunEvidenceService extends Context.Service<RunEvidenceService, RunEvidenceServiceShape>()(
  'symphony/RunEvidenceService',
) {}

const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
}

function evidenceAttemptNumber(attempt: number | null): number {
  return (attempt ?? 0) + 1
}

export function evidenceDirectoryFor(
  workspaceRoot: string,
  issueIdentifier: string,
  attempt: number | null,
  timestampMs: number,
): string {
  const evidenceRoot = normalize(resolve(workspaceRoot, '..', 'evidence'))
  const directoryName = `${formatEvidenceTimestamp(timestampMs)}-${sanitizeWorkspaceKey(issueIdentifier)}-attempt-${evidenceAttemptNumber(attempt)}`

  return normalize(join(evidenceRoot, directoryName))
}

function formatEvidenceTimestamp(timestampMs: number): string {
  const date = new Date(timestampMs)
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0')
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mi = String(date.getUTCMinutes()).padStart(2, '0')
  const ss = String(date.getUTCSeconds()).padStart(2, '0')

  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`
}

export function summarizeExit(exit: Exit.Exit<unknown, unknown>): RunExitSummary {
  if (EffectExit.isSuccess(exit)) {
    return {
      status: 'success',
      classification: 'success',
      message: 'worker completed successfully',
      pretty: null,
      typedErrors: [],
      defects: [],
      interruptions: [],
    }
  }

  const cause = exit.cause as Cause.Cause<unknown>
  const typedErrors = cause.reasons
    .filter(EffectCause.isFailReason)
    .map(reason => errorInfoFromUnknown(reason.error))
  const defects = cause.reasons
    .filter(EffectCause.isDieReason)
    .map(reason => errorInfoFromUnknown(reason.defect))
  const interruptions = cause.reasons
    .filter(EffectCause.isInterruptReason)
    .map(reason => ({ fiberId: reason.fiberId ?? null }))
  const hasTypedErrors = typedErrors.length > 0
  const hasDefects = defects.length > 0
  const hasInterruptions = interruptions.length > 0
  const categories = [hasTypedErrors, hasDefects, hasInterruptions].filter(Boolean).length
  const classification: RunExitSummary['classification'] = categories > 1
    ? 'mixed_failure'
    : hasTypedErrors
      ? 'typed_failure'
      : hasDefects
        ? 'defect'
        : hasInterruptions
          ? 'interruption'
          : 'unknown_failure'

  return {
    status: 'failure',
    classification,
    message: firstErrorMessage(typedErrors, defects, hasInterruptions),
    pretty: redactText(prettyCause(cause)),
    typedErrors,
    defects,
    interruptions,
  }
}

export function collectRunEvidenceEvents(
  codexEvents: ReadonlyArray<CodexRuntimeEvent>,
  startedAtMs: number,
  completedAtMs: number,
  exit: RunExitSummary,
): ReadonlyArray<RunEvidenceEvent> {
  const timeline: Array<RunEvidenceEvent> = [
    {
      kind: 'lifecycle',
      timestamp: startedAtMs,
      label: 'worker_attempt_started',
      message: null,
    },
  ]

  for (const event of codexEvents) {
    timeline.push(...eventsFromCodexRuntimeEvent(event))
  }

  timeline.push({
    kind: 'lifecycle',
    timestamp: completedAtMs,
    label: 'worker_attempt_completed',
    message: exit.classification,
  })

  return timeline.sort((left, right) => left.timestamp - right.timestamp)
}

export function buildRunSummary(input: RunEvidenceAttemptInput): RunSummary {
  const exit = summarizeExit(input.workerExit)
  const timeline = collectRunEvidenceEvents(input.codexEvents, input.startedAtMs, input.completedAtMs, exit)
  const session = latestSession(input.workerExit, input.codexEvents)
  const usage = latestUsage(input.workerExit, input.codexEvents)
  const rawSession = latestRawSessionReference(input.codexEvents)
  const tools = collectToolCalls(timeline)
  const fileChanges = collectFileChanges(timeline)

  return {
    schemaVersion: 'run-summary.v1',
    issue: {
      id: input.issue.id,
      identifier: input.issue.identifier,
      title: redactText(input.issue.title),
      finalState: input.issue.state,
      stateType: input.issue.stateType ?? null,
    },
    attempt: evidenceAttemptNumber(input.attempt),
    startedAt: new Date(input.startedAtMs).toISOString(),
    completedAt: new Date(input.completedAtMs).toISOString(),
    durationMs: Math.max(input.completedAtMs - input.startedAtMs, 0),
    workspace: {
      path: input.workspacePath,
      cleanup: input.cleanup,
    },
    codex: {
      sessionId: session.sessionId,
      threadId: session.threadId,
      turnId: session.turnId,
      rawSession,
      usage,
      rateLimits: redactUnknown(latestRateLimits(input.workerExit, input.codexEvents)),
    },
    lifecycle: {
      exit,
    },
    tools,
    fileChanges,
    hooks: input.workspaceFailures.map(hookOutcomeFromFailure),
    timeline,
  }
}

export const writeAttempt = Effect.fn('RunEvidenceService.writeAttempt')(function* (
  input: RunEvidenceAttemptInput,
): Effect.fn.Return<RunEvidenceResult, RunEvidenceError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem
  const directory = evidenceDirectoryFor(input.config.workspace.root, input.issue.identifier, input.attempt, input.completedAtMs)
  const evidenceRoot = normalize(resolve(input.config.workspace.root, '..', 'evidence'))

  if (!isPathInside(evidenceRoot, directory)) {
    return yield* new RunEvidenceWriteError({
      code: 'evidence_path_outside_root',
      path: directory,
      reason: `evidence path is outside evidence root ${evidenceRoot}`,
    })
  }

  const summary = buildRunSummary(input)
  const summaryJson = yield* encodeRunSummaryJson(summary).pipe(
    Effect.mapError(cause => new RunEvidenceWriteError({
      code: 'evidence_schema_encode_failed',
      path: join(directory, 'run-summary.json'),
      reason: 'run-summary.json failed schema encoding',
      cause,
    })),
  )
  const protocolEventLines = yield* Effect.all(
    summary.timeline.map(event =>
      encodeRunEvidenceEventJson(event).pipe(
        Effect.mapError(cause => new RunEvidenceWriteError({
          code: 'evidence_schema_encode_failed',
          path: join(directory, 'protocol-events.jsonl'),
          reason: 'protocol event failed schema encoding',
          cause,
        })),
      )),
  )
  const summaryMarkdown = renderSummaryMarkdown(summary)

  yield* failIfSymlink(fs, evidenceRoot)
  yield* fs.makeDirectory(evidenceRoot, { recursive: true }).pipe(
    Effect.mapError(cause => new RunEvidenceWriteError({
      code: 'evidence_directory_create_failed',
      path: evidenceRoot,
      reason: 'failed to create run evidence root directory',
      cause,
    })),
  )
  yield* failIfSymlink(fs, evidenceRoot)
  yield* failIfSymlink(fs, directory)

  yield* fs.makeDirectory(directory, { recursive: true }).pipe(
    Effect.mapError(cause => new RunEvidenceWriteError({
      code: 'evidence_directory_create_failed',
      path: directory,
      reason: 'failed to create run evidence directory',
      cause,
    })),
  )
  yield* failIfSymlink(fs, directory)

  const realEvidenceRoot = yield* fs.realPath(evidenceRoot).pipe(
    Effect.mapError(cause => new RunEvidenceWriteError({
      code: 'evidence_path_outside_root',
      path: evidenceRoot,
      reason: 'failed to resolve run evidence root real path',
      cause,
    })),
  )
  const realDirectory = yield* fs.realPath(directory).pipe(
    Effect.mapError(cause => new RunEvidenceWriteError({
      code: 'evidence_path_outside_root',
      path: directory,
      reason: 'failed to resolve run evidence directory real path',
      cause,
    })),
  )

  if (!isPathInside(realEvidenceRoot, realDirectory)) {
    return yield* new RunEvidenceWriteError({
      code: 'evidence_path_outside_root',
      path: realDirectory,
      reason: `real evidence path is outside evidence root ${realEvidenceRoot}`,
    })
  }

  const summaryMarkdownPath = join(directory, 'run-summary.md')
  const summaryJsonPath = join(directory, 'run-summary.json')
  const protocolEventsPath = join(directory, 'protocol-events.jsonl')

  yield* writeText(fs, summaryMarkdownPath, summaryMarkdown)
  yield* writeText(fs, summaryJsonPath, `${summaryJson}\n`)
  yield* writeText(fs, protocolEventsPath, `${protocolEventLines.join('\n')}\n`)

  return {
    directory,
    summaryMarkdownPath,
    summaryJsonPath,
    protocolEventsPath,
    summary,
  }
})

const writeAttemptWithNode = Effect.fn('RunEvidenceService.writeAttemptWithNode')((input: RunEvidenceAttemptInput) =>
  writeAttempt(input).pipe(
    Effect.provide(NodeServices.layer),
  ))

export const RunEvidenceServiceLive = Layer.succeed(RunEvidenceService)({
  writeAttempt: Effect.fn('RunEvidenceServiceLive.writeAttempt')(function* (input: RunEvidenceAttemptInput) {
    return yield* writeAttemptWithNode(input)
  }),
})

function writeText(
  fs: FileSystem.FileSystem,
  path: string,
  text: string,
): Effect.Effect<void, RunEvidenceError> {
  return fs.writeFileString(path, text).pipe(
    Effect.mapError(cause => new RunEvidenceWriteError({
      code: 'evidence_write_failed',
      path,
      reason: `failed to write ${path}`,
      cause,
    })),
  )
}

function failIfSymlink(fs: FileSystem.FileSystem, path: string): Effect.Effect<void, RunEvidenceError> {
  return Effect.matchEffect(fs.readLink(path), {
    onSuccess: target => new RunEvidenceWriteError({
      code: 'evidence_path_outside_root',
      path,
      reason: `run evidence path must not be a symlink: ${path} -> ${target}`,
    }),
    onFailure: () => Effect.void,
  })
}

function renderSummaryMarkdown(summary: RunSummary): string {
  const lines = [
    `# Run Summary: ${summary.issue.identifier} attempt ${summary.attempt}`,
    '',
    `- Issue: ${summary.issue.identifier} - ${summary.issue.title}`,
    `- Final tracker state: ${summary.issue.finalState}${summary.issue.stateType === null ? '' : ` (${summary.issue.stateType})`}`,
    `- Workspace: ${summary.workspace.path ?? 'unavailable'}`,
    `- Cleanup outcome: ${summary.workspace.cleanup.outcome}${summary.workspace.cleanup.reason === null ? '' : ` - ${summary.workspace.cleanup.reason}`}`,
    `- Exit: ${summary.lifecycle.exit.classification}`,
    `- Session: ${summary.codex.sessionId ?? 'unavailable'}`,
    `- Raw session: ${summary.codex.rawSession.status === 'available' ? summary.codex.rawSession.path : `unavailable - ${summary.codex.rawSession.reason}`}`,
    `- Tokens: input ${summary.codex.usage.inputTokens}, output ${summary.codex.usage.outputTokens}, total ${summary.codex.usage.totalTokens}`,
    `- Duration: ${summary.durationMs}ms`,
    '',
    '## Tools',
    ...renderTools(summary.tools),
    '',
    '## File Changes',
    ...renderFileChanges(summary.fileChanges),
    '',
    '## Timeline',
    ...summary.timeline.map(renderTimelineEvent),
    '',
  ]

  return `${lines.join('\n')}\n`
}

function renderTools(tools: ReadonlyArray<ToolCallSummary>): ReadonlyArray<string> {
  if (tools.length === 0) {
    return ['- None captured']
  }

  return tools.map(tool => `- ${tool.toolName}${tool.callId === null ? '' : ` (${tool.callId})`}: ${tool.success === null ? 'unknown' : tool.success ? 'success' : 'failed'}${tool.error === null ? '' : ` - ${tool.error}`}${renderDetailsSuffix(tool.details)}`)
}

function renderFileChanges(fileChanges: ReadonlyArray<FileChangeSummary>): ReadonlyArray<string> {
  if (fileChanges.length === 0) {
    return ['- None captured']
  }

  return fileChanges.map(file => `- ${file.operation}: ${file.path}`)
}

function renderTimelineEvent(event: RunEvidenceEvent): string {
  if (event.kind === 'lifecycle') {
    return `- ${new Date(event.timestamp).toISOString()} lifecycle ${event.label}${event.message === null ? '' : `: ${event.message}`}`
  }

  if (event.kind === 'tool_call') {
    return `- ${new Date(event.timestamp).toISOString()} tool ${event.toolName}${event.success === null ? '' : event.success ? ' succeeded' : ' failed'}${renderDetailsSuffix(event.details)}`
  }

  if (event.kind === 'prompt') {
    return `- ${new Date(event.timestamp).toISOString()} prompt received${event.promptLength === null ? '' : ` (${event.promptLength} chars)`}${event.promptSha256 === null ? '' : ` sha256=${event.promptSha256}`}`
  }

  if (event.kind === 'agent_message' || event.kind === 'final_answer') {
    return `- ${new Date(event.timestamp).toISOString()} ${event.kind}: ${truncate(event.text, 160)}`
  }

  if (event.kind === 'file_change') {
    return `- ${new Date(event.timestamp).toISOString()} file ${event.operation}: ${event.path}`
  }

  if (event.kind === 'token_usage') {
    return `- ${new Date(event.timestamp).toISOString()} tokens total=${event.usage.totalTokens}`
  }

  return `- ${new Date(event.timestamp).toISOString()} protocol ${event.event}`
}

function renderDetailsSuffix(details: unknown): string {
  const text = stringifyForSummary(details)

  return text === '{}' ? '' : ` - details: ${truncate(text, 240)}`
}

function eventsFromCodexRuntimeEvent(event: CodexRuntimeEvent): ReadonlyArray<RunEvidenceEvent> {
  const output: Array<RunEvidenceEvent> = []
  const sessionId = event.sessionId
  const eventType = 'type' in event ? event.type : 'runtime'

  if (event.usage !== null) {
    output.push({
      kind: 'token_usage',
      timestamp: event.timestamp,
      sessionId,
      usage: event.usage,
    })
  }

  if (eventType === 'tool_call') {
    output.push({
      kind: 'tool_call',
      timestamp: event.timestamp,
      sessionId,
      toolName: 'toolName' in event ? event.toolName : 'unknown',
      callId: 'callId' in event ? event.callId : null,
      success: 'success' in event ? event.success : null,
      error: 'error' in event && event.error !== null ? redactText(event.error) : null,
      details: redactUnknown('details' in event ? event.details : {}),
    })
    return output
  }

  if (eventType === 'agent_message' && 'text' in event && event.text !== '') {
    output.push({
      kind: 'agent_message',
      timestamp: event.timestamp,
      sessionId,
      text: redactText(event.text),
    })

    if (event.event === 'item/agentMessage/completed') {
      output.push({
        kind: 'final_answer',
        timestamp: event.timestamp,
        sessionId,
        text: redactText(event.text),
      })
    }

    return output
  }

  if (eventType === 'protocol_client_request' && 'method' in event && event.method === 'turn/start') {
    const details = 'details' in event && isPlainRecord(event.details) ? event.details : {}

    output.push({
      kind: 'prompt',
      timestamp: event.timestamp,
      sessionId,
      promptSha256: stringField(details.promptSha256),
      promptLength: numberField(details.promptLength),
      preview: stringField(details.promptPreview),
    })
  }

  if (eventType === 'turn_completed') {
    const finalAnswer = 'finalAnswer' in event ? event.finalAnswer : null

    if (finalAnswer !== null && finalAnswer !== '') {
      output.push({
        kind: 'final_answer',
        timestamp: event.timestamp,
        sessionId,
        text: redactText(finalAnswer),
      })
    }
  }

  for (const fileChange of fileChangesFromEvent(event)) {
    output.push({
      kind: 'file_change',
      timestamp: event.timestamp,
      sessionId,
      path: fileChange.path,
      operation: fileChange.operation,
    })
  }

  output.push({
    kind: 'codex_protocol',
    timestamp: event.timestamp,
    event: event.event,
    direction: protocolDirection(eventType),
    method: 'method' in event ? event.method : event.event,
    protocolId: 'protocolId' in event ? event.protocolId : null,
    sessionId,
    threadId: 'threadId' in event ? event.threadId ?? threadIdFromSession(sessionId) : threadIdFromSession(sessionId),
    turnId: 'turnId' in event ? event.turnId ?? turnIdFromSession(sessionId) : turnIdFromSession(sessionId),
    details: redactUnknown('details' in event ? event.details : {}),
  })

  return output
}

function protocolDirection(eventType: string): 'client_request' | 'server_request' | 'server_response' | 'notification' {
  if (eventType === 'protocol_client_request') {
    return 'client_request'
  }

  if (eventType === 'protocol_request') {
    return 'server_request'
  }

  if (eventType === 'protocol_response') {
    return 'server_response'
  }

  return 'notification'
}

function collectToolCalls(timeline: ReadonlyArray<RunEvidenceEvent>): ReadonlyArray<ToolCallSummary> {
  return timeline
    .filter((event): event is Extract<RunEvidenceEvent, { kind: 'tool_call' }> => event.kind === 'tool_call')
    .map(event => ({
      toolName: event.toolName,
      callId: event.callId,
      success: event.success,
      error: event.error,
      timestamp: event.timestamp,
      details: event.details,
    }))
}

function collectFileChanges(timeline: ReadonlyArray<RunEvidenceEvent>): ReadonlyArray<FileChangeSummary> {
  const byKey = new Map<string, FileChangeSummary>()

  for (const event of timeline) {
    if (event.kind === 'file_change') {
      byKey.set(`${event.operation}:${event.path}`, {
        path: event.path,
        operation: event.operation,
      })
    }
  }

  return [...byKey.values()].sort((left, right) => left.path.localeCompare(right.path))
}

function latestSession(
  exit: Exit.Exit<AgentRunResult, unknown>,
  events: ReadonlyArray<CodexRuntimeEvent>,
): { readonly sessionId: string | null, readonly threadId: string | null, readonly turnId: string | null } {
  if (EffectExit.isSuccess(exit)) {
    return {
      sessionId: exit.value.session.sessionId,
      threadId: exit.value.session.threadId,
      turnId: exit.value.session.turnId,
    }
  }

  for (const event of [...events].reverse()) {
    const sessionId = event.sessionId

    if (sessionId !== null) {
      return {
        sessionId,
        threadId: 'threadId' in event ? event.threadId ?? threadIdFromSession(sessionId) : threadIdFromSession(sessionId),
        turnId: 'turnId' in event ? event.turnId ?? turnIdFromSession(sessionId) : turnIdFromSession(sessionId),
      }
    }
  }

  return {
    sessionId: null,
    threadId: null,
    turnId: null,
  }
}

function latestUsage(
  exit: Exit.Exit<AgentRunResult, unknown>,
  events: ReadonlyArray<CodexRuntimeEvent>,
): TokenUsage {
  if (EffectExit.isSuccess(exit)) {
    return exit.value.session.usage
  }

  return [...events].reverse().find(event => event.usage !== null)?.usage ?? EMPTY_USAGE
}

function latestRateLimits(
  exit: Exit.Exit<AgentRunResult, unknown>,
  events: ReadonlyArray<CodexRuntimeEvent>,
): unknown {
  if (EffectExit.isSuccess(exit)) {
    return exit.value.session.rateLimits
  }

  return [...events].reverse().find(event => event.rateLimits !== null)?.rateLimits ?? null
}

function latestRawSessionReference(events: ReadonlyArray<CodexRuntimeEvent>): RawSessionReference {
  for (const event of [...events].reverse()) {
    if ('rawSessionPath' in event && event.rawSessionPath !== null) {
      return {
        status: 'available',
        path: event.rawSessionPath,
      }
    }
  }

  return {
    status: 'unavailable',
    reason: 'not provided by Codex app-server protocol/runtime data',
  }
}

function hookOutcomeFromFailure(failure: WorkspaceBestEffortFailure): HookOutcome {
  return {
    operation: failure.operation,
    workspacePath: failure.workspacePath,
    issueIdentifier: failure.issueIdentifier ?? null,
    errorCode: failure.error.code,
    hook: failure.error.hook ?? null,
    reason: failure.error.reason,
  }
}

function errorInfoFromUnknown(value: unknown): ErrorInfo {
  if (isPlainRecord(value)) {
    return {
      tag: typeof value._tag === 'string' ? value._tag : typeof value.name === 'string' ? value.name : null,
      code: codeFromUnknown(value),
      reason: redactText(reasonFromRecord(value)),
    }
  }

  if (value instanceof Error) {
    return {
      tag: value.name,
      code: null,
      reason: redactText(value.message),
    }
  }

  return {
    tag: null,
    code: null,
    reason: redactText(String(value)),
  }
}

function codeFromUnknown(value: unknown): string | null {
  if (!isPlainRecord(value)) {
    return null
  }

  return typeof value.code === 'string' ? value.code : null
}

function reasonFromRecord(value: Record<string, unknown>): string {
  if (typeof value.reason === 'string') {
    return value.reason
  }

  if (typeof value.message === 'string') {
    return value.message
  }

  return stringifyForSummary(redactUnknown(value))
}

function firstErrorMessage(
  typedErrors: ReadonlyArray<ErrorInfo>,
  defects: ReadonlyArray<ErrorInfo>,
  hasInterruptions: boolean,
): string | null {
  return typedErrors[0]?.reason
    ?? defects[0]?.reason
    ?? (hasInterruptions ? 'worker interrupted' : null)
}

function threadIdFromSession(sessionId: string | null): string | null {
  if (sessionId === null) {
    return null
  }

  const marker = '-turn-'
  const markerIndex = sessionId.lastIndexOf(marker)

  return markerIndex === -1 ? sessionId.split('-')[0] ?? null : sessionId.slice(0, markerIndex)
}

function turnIdFromSession(sessionId: string | null): string | null {
  if (sessionId === null) {
    return null
  }

  const marker = '-turn-'
  const markerIndex = sessionId.lastIndexOf(marker)

  if (markerIndex !== -1) {
    return sessionId.slice(markerIndex + 1)
  }

  const parts = sessionId.split('-')

  return parts.length <= 1 ? null : parts.slice(1).join('-')
}

function fileChangesFromEvent(event: CodexRuntimeEvent): ReadonlyArray<FileChangeSummary> {
  const details = 'details' in event ? event.details : null
  const directPath = isPlainRecord(details) ? stringField(details.path) ?? stringField(details.filePath) : null
  const operation = isPlainRecord(details) ? fileOperation(details.operation ?? details.type) : 'unknown'

  if (directPath !== null) {
    return [{ path: directPath, operation }]
  }

  const files = isPlainRecord(details) && Array.isArray(details.files) ? details.files : []

  return files.flatMap((file) => {
    if (typeof file === 'string') {
      return [{ path: file, operation: 'unknown' as const }]
    }

    if (!isPlainRecord(file)) {
      return []
    }

    const path = stringField(file.path) ?? stringField(file.filePath)

    if (path === null) {
      return []
    }

    return [{
      path,
      operation: fileOperation(file.operation ?? file.type),
    }]
  })
}

function fileOperation(value: unknown): FileChangeSummary['operation'] {
  if (value === 'added' || value === 'created') {
    return 'added'
  }

  if (value === 'modified' || value === 'updated') {
    return 'modified'
  }

  if (value === 'deleted' || value === 'removed') {
    return 'deleted'
  }

  if (value === 'renamed' || value === 'moved') {
    return 'renamed'
  }

  return 'unknown'
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function numberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringifyForSummary(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, entry: unknown) =>
      typeof entry === 'bigint' ? `${String(entry)}n` : entry) ?? String(value)
  }
  catch {
    return String(value)
  }
}

function prettyCause(cause: Cause.Cause<unknown>): string {
  try {
    return EffectCause.pretty(cause)
  }
  catch {
    return stringifyForSummary(cause)
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`
}

export function evidenceParentDirectory(workspaceRoot: string): string {
  return dirname(evidenceDirectoryFor(workspaceRoot, 'example', null, 0))
}
