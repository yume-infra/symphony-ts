import { Schema } from 'effect'

const NullableString = Schema.NullOr(Schema.String)
const NullableNumber = Schema.NullOr(Schema.Number)
const NullableBoolean = Schema.NullOr(Schema.Boolean)

const TokenUsageSchema = Schema.Struct({
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  totalTokens: Schema.Number,
})

const ErrorInfoSchema = Schema.Struct({
  tag: NullableString,
  code: NullableString,
  reason: Schema.String,
})

const ExitClassificationSchema = Schema.Literals([
  'success',
  'typed_failure',
  'defect',
  'interruption',
  'mixed_failure',
  'unknown_failure',
])

const RunExitSummarySchema = Schema.Struct({
  status: Schema.Literals(['success', 'failure']),
  classification: ExitClassificationSchema,
  message: NullableString,
  pretty: NullableString,
  typedErrors: Schema.Array(ErrorInfoSchema),
  defects: Schema.Array(ErrorInfoSchema),
  interruptions: Schema.Array(Schema.Struct({
    fiberId: NullableNumber,
  })),
})

const RawSessionReferenceSchema = Schema.Union([
  Schema.Struct({
    status: Schema.Literal('available'),
    path: Schema.String,
  }),
  Schema.Struct({
    status: Schema.Literal('unavailable'),
    reason: Schema.String,
  }),
])

const CleanupSummarySchema = Schema.Struct({
  outcome: Schema.Literals(['not_attempted', 'planned', 'skipped', 'removed', 'failed']),
  reason: NullableString,
})

const RunEvidenceEventSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('lifecycle'),
    timestamp: Schema.Number,
    label: Schema.String,
    message: NullableString,
  }),
  Schema.Struct({
    kind: Schema.Literal('codex_protocol'),
    timestamp: Schema.Number,
    event: Schema.String,
    direction: Schema.Literals(['client_request', 'server_request', 'server_response', 'notification']),
    method: NullableString,
    protocolId: NullableString,
    sessionId: NullableString,
    threadId: NullableString,
    turnId: NullableString,
    details: Schema.Unknown,
  }),
  Schema.Struct({
    kind: Schema.Literal('agent_message'),
    timestamp: Schema.Number,
    sessionId: NullableString,
    text: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('prompt'),
    timestamp: Schema.Number,
    sessionId: NullableString,
    promptSha256: NullableString,
    promptLength: NullableNumber,
    preview: NullableString,
  }),
  Schema.Struct({
    kind: Schema.Literal('tool_call'),
    timestamp: Schema.Number,
    sessionId: NullableString,
    toolName: Schema.String,
    callId: NullableString,
    success: NullableBoolean,
    error: NullableString,
    details: Schema.Unknown,
  }),
  Schema.Struct({
    kind: Schema.Literal('file_change'),
    timestamp: Schema.Number,
    sessionId: NullableString,
    path: Schema.String,
    operation: Schema.Literals(['added', 'modified', 'deleted', 'renamed', 'unknown']),
  }),
  Schema.Struct({
    kind: Schema.Literal('token_usage'),
    timestamp: Schema.Number,
    sessionId: NullableString,
    usage: TokenUsageSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal('final_answer'),
    timestamp: Schema.Number,
    sessionId: NullableString,
    text: Schema.String,
  }),
])

const ToolCallSummarySchema = Schema.Struct({
  toolName: Schema.String,
  callId: NullableString,
  success: NullableBoolean,
  error: NullableString,
  timestamp: Schema.Number,
  details: Schema.Unknown,
})

const FileChangeSummarySchema = Schema.Struct({
  path: Schema.String,
  operation: Schema.Literals(['added', 'modified', 'deleted', 'renamed', 'unknown']),
})

const HookOutcomeSchema = Schema.Struct({
  operation: Schema.String,
  workspacePath: Schema.String,
  issueIdentifier: NullableString,
  errorCode: Schema.String,
  hook: NullableString,
  reason: Schema.String,
})

const RunSummarySchema = Schema.Struct({
  schemaVersion: Schema.Literal('run-summary.v1'),
  issue: Schema.Struct({
    id: Schema.String,
    identifier: Schema.String,
    title: Schema.String,
    finalState: Schema.String,
    stateType: NullableString,
  }),
  attempt: Schema.Number,
  startedAt: Schema.String,
  completedAt: Schema.String,
  durationMs: Schema.Number,
  workspace: Schema.Struct({
    path: NullableString,
    cleanup: CleanupSummarySchema,
  }),
  codex: Schema.Struct({
    sessionId: NullableString,
    threadId: NullableString,
    turnId: NullableString,
    rawSession: RawSessionReferenceSchema,
    usage: TokenUsageSchema,
    rateLimits: Schema.Unknown,
  }),
  lifecycle: Schema.Struct({
    exit: RunExitSummarySchema,
  }),
  tools: Schema.Array(ToolCallSummarySchema),
  fileChanges: Schema.Array(FileChangeSummarySchema),
  hooks: Schema.Array(HookOutcomeSchema),
  timeline: Schema.Array(RunEvidenceEventSchema),
})

export type TokenUsage = Schema.Schema.Type<typeof TokenUsageSchema>
export type ErrorInfo = Schema.Schema.Type<typeof ErrorInfoSchema>
export type RunExitSummary = Schema.Schema.Type<typeof RunExitSummarySchema>
export type RawSessionReference = Schema.Schema.Type<typeof RawSessionReferenceSchema>
export type CleanupSummary = Schema.Schema.Type<typeof CleanupSummarySchema>
export type RunEvidenceEvent = Schema.Schema.Type<typeof RunEvidenceEventSchema>
export type ToolCallSummary = Schema.Schema.Type<typeof ToolCallSummarySchema>
export type FileChangeSummary = Schema.Schema.Type<typeof FileChangeSummarySchema>
export type HookOutcome = Schema.Schema.Type<typeof HookOutcomeSchema>
export type RunSummary = Schema.Schema.Type<typeof RunSummarySchema>

const RunSummaryJsonStringSchema = Schema.fromJsonString(RunSummarySchema)
const RunEvidenceEventJsonStringSchema = Schema.fromJsonString(RunEvidenceEventSchema)

export const encodeRunSummaryJson = Schema.encodeUnknownEffect(RunSummaryJsonStringSchema)
export const decodeRunSummaryJson = Schema.decodeUnknownEffect(RunSummaryJsonStringSchema)
export const encodeRunEvidenceEventJson = Schema.encodeUnknownEffect(RunEvidenceEventJsonStringSchema)
export const decodeRunEvidenceEventJson = Schema.decodeUnknownEffect(RunEvidenceEventJsonStringSchema)
