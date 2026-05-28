import type * as Scope from 'effect/Scope'
import type { CodexConfig, Issue, ServiceConfig } from '../domain/types.js'
import type { LinearTransportShape } from '../tracker/linear.js'
import { Buffer } from 'node:buffer'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Clock, Context, Effect, Layer, Queue, Ref, Schema, Stream } from 'effect'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'
import { executeLinearGraphQLTool } from '../client-tools/linear-graphql.js'
import { CodexError } from '../domain/errors.js'
import { LinearTransport } from '../tracker/linear.js'

export interface CodexRuntimeEvent {
  readonly event: string
  readonly timestamp: number
  readonly codexAppServerPid: string | null
  readonly sessionId: string | null
  readonly message: string | null
  readonly usage: TokenUsage | null
  readonly rateLimits: unknown
}

interface TokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
}

export interface CodexRunParams {
  readonly command: string
  readonly cwd: string
  readonly workspacePath: string
  readonly prompt: string
  readonly issue: Issue
  readonly config: CodexConfig
  readonly serviceConfig: ServiceConfig
  readonly threadId: string | null
  readonly turnNumber: number
  readonly onEvent?: (event: CodexRuntimeEvent) => Effect.Effect<void>
}

export interface CodexRunResult {
  readonly sessionId: string
  readonly threadId: string
  readonly turnId: string
  readonly turnCount: number
  readonly usage: TokenUsage
  readonly rateLimits: unknown
}

type JsonRpcId = number | string

interface JsonRpcRequest {
  readonly id: JsonRpcId
  readonly method: string
  readonly params?: unknown
}

interface JsonRpcResponse {
  readonly id: JsonRpcId
  readonly result?: unknown
  readonly error?: unknown
}

interface JsonRpcNotification {
  readonly method: string
  readonly params?: unknown
}

type CodexProtocolMessage = JsonRpcNotification | JsonRpcRequest | JsonRpcResponse

export interface CodexProtocolScript {
  readonly send: (message: CodexProtocolMessage) => void
  readonly nextMessage: () => unknown
}

interface CodexProtocolSession {
  readonly processId: string | null
  readonly send: (message: CodexProtocolMessage) => Effect.Effect<void, CodexError>
  readonly nextMessage: Effect.Effect<unknown, CodexError>
}

type ProtocolStage = 'initialize' | 'thread startup' | 'turn/start'

interface PendingProtocolRequest {
  readonly id: JsonRpcId
  readonly stage: ProtocolStage
  readonly deadlineMs: number
}

type ProcessProtocolEvent
  = | {
    readonly _tag: 'message'
    readonly message: CodexProtocolMessage
  }
  | {
    readonly _tag: 'failure'
    readonly error: CodexError
  }
  | {
    readonly _tag: 'exit'
    readonly exitCode: number | null
  }

export interface CodexAppServerClientShape {
  readonly runTurn: (
    params: CodexRunParams,
  ) => Effect.Effect<CodexRunResult, CodexError, LinearTransport>
}

export class CodexAppServerClient extends Context.Service<CodexAppServerClient, CodexAppServerClientShape>()(
  'symphony/CodexAppServerClient',
) {}

const CLIENT_INFO = {
  name: 'symphony-ts',
  version: '0.0.0',
} as const

const LINEAR_GRAPHQL_DYNAMIC_TOOL = {
  name: 'linear_graphql',
  description: [
    'Execute one Linear GraphQL query or mutation through the Symphony runtime Linear transport.',
    'Input must be { "query": string, "variables"?: object }.',
    'Use this tool instead of shell network calls or environment inspection; the worker never needs LINEAR_API_KEY.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: {
      query: {
        type: 'string',
      },
      variables: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
} as const

const MAX_PROTOCOL_LINE_BYTES = 10 * 1024 * 1024
const JSON_RPC_APPLICATION_ERROR = -32000
const JSON_RPC_METHOD_NOT_FOUND = -32601
const JsonRpcIdSchema = Schema.Union([Schema.Number, Schema.String])
const JsonRpcRequestSchema = Schema.Struct({
  id: JsonRpcIdSchema,
  method: Schema.String,
  params: Schema.optionalKey(Schema.Unknown),
})
const JsonRpcResponseSchema = Schema.Union([
  Schema.Struct({
    id: JsonRpcIdSchema,
    result: Schema.Unknown,
  }),
  Schema.Struct({
    id: JsonRpcIdSchema,
    error: Schema.Unknown,
  }),
])
const JsonRpcNotificationSchema = Schema.Struct({
  method: Schema.String,
  params: Schema.optionalKey(Schema.Unknown),
})
const CodexProtocolMessageFromJsonString = Schema.fromJsonString(Schema.Union([
  JsonRpcRequestSchema,
  JsonRpcResponseSchema,
  JsonRpcNotificationSchema,
]))
const decodeProtocolMessageLine = Schema.decodeUnknownEffect(CodexProtocolMessageFromJsonString)
const encodeProtocolMessageLine = Schema.encodeUnknownEffect(CodexProtocolMessageFromJsonString)
const encodeUnknownJsonString = Schema.encodeUnknownSync(Schema.UnknownFromJsonString)

interface DynamicToolResponse {
  readonly success: boolean
  readonly contentItems: ReadonlyArray<{
    readonly type: 'inputText'
    readonly text: string
  }>
}

interface DynamicToolExecution {
  readonly event: 'tool_call' | 'unsupported_tool_call'
  readonly response: DynamicToolResponse
}

interface TurnState {
  threadId: string | null
  turnId: string | null
  sessionId: string | null
  sessionStartedEmitted: boolean
  usage: TokenUsage
  rateLimits: unknown
}

const validateWorkspaceCwdEffect = Effect.fn('validateWorkspaceCwdEffect')((params: CodexRunParams): Effect.Effect<void, CodexError> =>
  Effect.try({
    try: () => validateWorkspaceCwd(params),
    catch: cause => cause instanceof CodexError
      ? cause
      : new CodexError({
          code: 'invalid_workspace_cwd',
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
  }))

const responseTimeout = Effect.fn('responseTimeout')((
  params: CodexRunParams,
  state: TurnState,
  stage: string,
): Effect.Effect<never, CodexError> =>
  Effect.fail(new CodexError({
    code: 'response_timeout',
    reason: `Codex app-server did not answer ${stage} within ${params.config.readTimeoutMs}ms`,
    sessionId: state.sessionId ?? undefined,
  })))

const readProtocolMessage = Effect.fn('readProtocolMessage')((
  session: CodexProtocolSession,
  params: CodexRunParams,
  state: TurnState,
  pendingRequest: PendingProtocolRequest | null,
): Effect.Effect<unknown, CodexError> => {
  if (pendingRequest === null) {
    return session.nextMessage
  }

  return Clock.currentTimeMillis.pipe(
    Effect.flatMap((nowMs) => {
      const remainingMs = pendingRequest.deadlineMs - nowMs

      if (remainingMs <= 0) {
        return responseTimeout(params, state, pendingRequest.stage)
      }

      return session.nextMessage.pipe(
        Effect.timeoutOrElse({
          duration: remainingMs,
          orElse: () => responseTimeout(params, state, pendingRequest.stage),
        }),
      )
    }),
  )
})

const encodeProtocolMessage = Effect.fn('encodeProtocolMessage')((message: CodexProtocolMessage): Effect.Effect<Uint8Array, CodexError> =>
  encodeProtocolMessageLine(message).pipe(
    Effect.map(line => Buffer.from(`${line}\n`, 'utf8')),
    Effect.mapError(cause => new CodexError({
      code: 'response_error',
      reason: 'failed to serialize Codex JSON-RPC message',
      cause,
    })),
  ))

const enqueueProcessLine = Effect.fn('enqueueProcessLine')((
  inbound: Queue.Enqueue<ProcessProtocolEvent>,
  line: string,
): Effect.Effect<boolean> => {
  if (line.trim() === '') {
    return Effect.succeed(true)
  }

  if (Buffer.byteLength(line, 'utf8') > MAX_PROTOCOL_LINE_BYTES) {
    return Queue.offer(inbound, {
      _tag: 'failure',
      error: new CodexError({
        code: 'malformed_message',
        reason: `Codex app-server protocol line exceeded ${MAX_PROTOCOL_LINE_BYTES} bytes`,
      }),
    })
  }

  return decodeProtocolMessageLine(line).pipe(
    Effect.matchEffect({
      onFailure: cause => Queue.offer(inbound, {
        _tag: 'failure',
        error: new CodexError({
          code: 'malformed_message',
          reason: 'Codex app-server emitted malformed or unsupported JSON-RPC',
          cause,
        }),
      }),
      onSuccess: message => Queue.offer(inbound, {
        _tag: 'message',
        message: message as CodexProtocolMessage,
      }),
    }),
  )
})

const emit = Effect.fn('emit')((params: CodexRunParams, event: CodexRuntimeEvent): Effect.Effect<void> =>
  params.onEvent?.(event) ?? Effect.void)

const maybeEmitSessionStarted = Effect.fn('maybeEmitSessionStarted')((
  params: CodexRunParams,
  state: TurnState,
  processId: string | null,
): Effect.Effect<void> => {
  if (!tryMarkSessionStarted(state)) {
    return Effect.void
  }

  return Clock.currentTimeMillis.pipe(
    Effect.flatMap(timestamp => emit(params, makeEvent(
      'session_started',
      timestamp,
      state.sessionId,
      {
        threadId: state.threadId,
        turnId: state.turnId,
        ...(processId === null ? {} : { pid: processId }),
      },
      state.usage,
      state.rateLimits,
    ))),
  )
})

const failOnJsonRpcError = Effect.fn('failOnJsonRpcError')((
  message: JsonRpcResponse,
  label: string,
  sessionId: string | null,
): Effect.Effect<void, CodexError> => {
  if (message.error === undefined) {
    return Effect.void
  }

  return Effect.fail(new CodexError({
    code: 'response_error',
    reason: `${label} failed: ${formatJsonRpcError(message.error)}`,
    sessionId: sessionId ?? undefined,
    cause: message.error,
  }))
})

const emitProtocolEvent = Effect.fn('emitProtocolEvent')((
  session: CodexProtocolSession,
  params: CodexRunParams,
  state: TurnState,
  event: string,
  payload: Record<string, unknown>,
): Effect.Effect<void> =>
  Clock.currentTimeMillis.pipe(
    Effect.flatMap(timestamp => emit(params, makeEvent(
      event,
      timestamp,
      state.sessionId,
      session.processId === null
        ? payload
        : {
            ...payload,
            pid: session.processId,
          },
      state.usage,
      state.rateLimits,
    ))),
  ))

const executeDynamicToolCall = Effect.fn('executeDynamicToolCall')(function* (
  params: CodexRunParams,
  requestParams: unknown,
): Effect.fn.Return<DynamicToolExecution, never, LinearTransport> {
  const payload = isRecord(requestParams) ? requestParams : {}
  const toolName = stringValue(payload.tool) ?? stringValue(payload.name)
  const toolInput = 'arguments' in payload
    ? payload.arguments
    : 'input' in payload
      ? payload.input
      : undefined

  if (toolName === 'linear_graphql') {
    const result = yield* executeLinearGraphQLTool(params.serviceConfig, toolInput)

    return {
      event: 'tool_call',
      response: dynamicToolResponse(result.success, result),
    }
  }

  const result = {
    success: false,
    error: {
      code: 'unsupported_tool_call',
      message: `Unsupported tool: ${toolName ?? 'unknown'}`,
    },
  }

  return {
    event: 'unsupported_tool_call',
    response: dynamicToolResponse(false, result),
  }
})

const handleProtocolServerRequest = Effect.fn('handleProtocolServerRequest')(function* (
  session: CodexProtocolSession,
  params: CodexRunParams,
  state: TurnState,
  message: JsonRpcRequest,
): Effect.fn.Return<void, CodexError, LinearTransport> {
  const payload = isRecord(message.params) ? message.params : {}

  if (message.method === 'item/tool/call') {
    const result = yield* executeDynamicToolCall(params, message.params)

    yield* session.send({
      id: message.id,
      result: result.response,
    })
    yield* emitProtocolEvent(session, params, state, result.event, payload)
    return
  }

  if (message.method === 'item/tool/requestUserInput') {
    yield* session.send(jsonRpcError(
      message.id,
      JSON_RPC_APPLICATION_ERROR,
      'Symphony does not support interactive user input during Codex turns',
    ))

    return yield* new CodexError({
      code: 'turn_input_required',
      reason: 'Codex requested user input; first-pass Symphony fails rather than stalling',
      sessionId: state.sessionId ?? undefined,
    })
  }

  if (isApprovalRequestMethod(message.method)) {
    const result = approvalApprovalResult(message.method, payload)

    yield* session.send(result === null
      ? jsonRpcError(message.id, JSON_RPC_APPLICATION_ERROR, `Symphony does not support approval request: ${message.method}`)
      : jsonRpcResult(message.id, result))
    yield* emitProtocolEvent(session, params, state, result === null ? 'approval_unsupported' : 'approval_granted', payload)
    return
  }

  yield* session.send(jsonRpcError(
    message.id,
    JSON_RPC_METHOD_NOT_FOUND,
    `Unsupported Codex server request method: ${message.method}`,
  ))

  return yield* new CodexError({
    code: 'response_error',
    reason: `unsupported Codex server request method: ${message.method}`,
    sessionId: state.sessionId ?? undefined,
  })
})

const handleProtocolNotification = Effect.fn('handleProtocolNotification')(function* (
  session: CodexProtocolSession,
  params: CodexRunParams,
  state: TurnState,
  message: JsonRpcNotification,
): Effect.fn.Return<CodexRunResult | null, CodexError> {
  const payload = isRecord(message.params) ? message.params : {}

  updateStateFromNotification(state, message)
  yield* maybeEmitSessionStarted(params, state, session.processId)

  if (message.method === 'thread/tokenUsage/updated') {
    state.usage = extractUsage(payload) ?? state.usage
  }

  if (message.method === 'account/rateLimits/updated') {
    state.rateLimits = extractRateLimits(payload)
  }

  yield* emitProtocolEvent(session, params, state, message.method, payload)

  if (message.method === 'error') {
    return yield* new CodexError({
      code: 'response_error',
      reason: stringValue(payload.message) ?? 'Codex app-server emitted an error notification',
      sessionId: state.sessionId ?? undefined,
    })
  }

  if (message.method !== 'turn/completed') {
    return null
  }

  const completion = completionFromTurnPayload(params, state, message.params)

  if (completion instanceof CodexError) {
    return yield* completion
  }

  return completion
})

const runCodexProtocolTurn = Effect.fn('runCodexProtocolTurn')(function* (
  session: CodexProtocolSession,
  params: CodexRunParams,
): Effect.fn.Return<CodexRunResult, CodexError, LinearTransport> {
  yield* validateWorkspaceCwdEffect(params)

  const state = createTurnState(params)
  let nextId = 1
  let pendingRequest: PendingProtocolRequest | null = null

  yield* sendProtocolRequest('initialize', initializeParams(), 'initialize')

  const runProtocolLoop = Effect.fn('runCodexProtocolTurn.loop')(function* (): Effect.fn.Return<CodexRunResult, CodexError, LinearTransport> {
    while (true) {
      const message = yield* readProtocolMessage(session, params, state, pendingRequest)

      if (isJsonRpcResponse(message)) {
        if (pendingRequest === null || !idsEqual(message.id, pendingRequest.id)) {
          return yield* new CodexError({
            code: 'response_error',
            reason: `unexpected JSON-RPC response id: ${String(message.id)}`,
            sessionId: state.sessionId ?? undefined,
          })
        }

        const request = pendingRequest
        pendingRequest = null

        yield* failOnJsonRpcError(message, request.stage, state.sessionId)

        if (request.stage === 'initialize') {
          yield* sendProtocolRequest(threadRequestMethod(params), threadRequestParams(params), 'thread startup')
          continue
        }

        if (request.stage === 'thread startup') {
          state.threadId = extractThreadId(message.result) ?? state.threadId

          if (state.threadId === null) {
            return yield* new CodexError({
              code: 'response_error',
              reason: 'thread/start or thread/resume response did not include thread identity',
              sessionId: state.sessionId ?? undefined,
            })
          }

          yield* sendProtocolRequest('turn/start', turnStartParams(params, state.threadId), 'turn/start')
          continue
        }

        updateThreadAndTurnFromPayload(state, message.result)
        yield* maybeEmitSessionStarted(params, state, session.processId)

        const completion = completionFromTurnPayload(params, state, message.result)

        if (completion instanceof CodexError) {
          return yield* completion
        }

        if (completion !== null) {
          return completion
        }

        continue
      }

      if (isJsonRpcRequest(message)) {
        yield* handleProtocolServerRequest(session, params, state, message)
        continue
      }

      if (isJsonRpcNotification(message)) {
        const completion = yield* handleProtocolNotification(session, params, state, message)

        if (completion !== null) {
          return completion
        }

        continue
      }

      return yield* new CodexError({
        code: 'malformed_message',
        reason: 'Codex app-server emitted an unsupported JSON-RPC message shape',
        sessionId: state.sessionId ?? undefined,
      })
    }
  })
  const result = yield* runProtocolLoop().pipe(
    Effect.timeoutOrElse({
      duration: params.config.turnTimeoutMs,
      orElse: () => Effect.fail(new CodexError({
        code: 'turn_timeout',
        reason: `Codex turn timed out after ${params.config.turnTimeoutMs}ms`,
        sessionId: state.sessionId ?? undefined,
      })),
    }),
  )

  return result

  function sendProtocolRequest(
    method: string,
    requestParams: Record<string, unknown>,
    stage: ProtocolStage,
  ): Effect.Effect<void, CodexError> {
    const id = nextId++

    return Clock.currentTimeMillis.pipe(
      Effect.flatMap((nowMs) => {
        pendingRequest = {
          id,
          stage,
          deadlineMs: nowMs + params.config.readTimeoutMs,
        }

        return session.send({
          id,
          method,
          params: requestParams,
        })
      }),
    )
  }
})

export const runCodexScriptTurn = Effect.fn('runCodexScriptTurn')(function* (
  script: CodexProtocolScript,
  params: CodexRunParams,
): Effect.fn.Return<CodexRunResult, CodexError, LinearTransport> {
  const session = scriptProtocolSession(script)

  return yield* runCodexProtocolTurn(session, params)
})

const makeCodexProcessSession = Effect.fn('makeCodexProcessSession')(function* (
  params: CodexRunParams,
): Effect.fn.Return<CodexProtocolSession, CodexError, ChildProcessSpawner.ChildProcessSpawner | Scope.Scope> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const outbound = yield* Queue.unbounded<Uint8Array>()
  const inbound = yield* Queue.unbounded<ProcessProtocolEvent>()
  const stderrTail = yield* Ref.make('')
  const command = ChildProcess.make('bash', ['-lc', params.command], {
    cwd: params.cwd,
    env: {
      LINEAR_API_KEY: '',
    },
    extendEnv: true,
    stdin: {
      stream: Stream.fromQueue(outbound),
      endOnDone: false,
    },
    stdout: 'pipe',
    stderr: 'pipe',
    killSignal: 'SIGTERM',
    forceKillAfter: '1 second',
  })
  const handle = yield* spawner.spawn(command).pipe(
    Effect.mapError(cause => new CodexError({
      code: 'codex_not_found',
      reason: 'failed to start Codex app-server command',
      cause,
    })),
  )

  yield* Effect.addFinalizer(() =>
    Effect.all([
      Queue.shutdown(outbound),
      Queue.shutdown(inbound),
    ], { discard: true }),
  )

  yield* handle.stdout.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.runForEach(line => enqueueProcessLine(inbound, line)),
    Effect.catch(cause => Queue.offer(inbound, {
      _tag: 'failure',
      error: new CodexError({
        code: 'response_error',
        reason: 'failed to read Codex app-server stdout',
        cause,
      }),
    })),
    Effect.forkScoped,
  )

  yield* handle.stderr.pipe(
    Stream.runForEach(chunk =>
      Ref.update(stderrTail, value => truncateDiagnostic(`${value}${Buffer.from(chunk).toString('utf8')}`)),
    ),
    Effect.catch(cause =>
      Ref.update(stderrTail, value => truncateDiagnostic(`${value}\nfailed to read stderr: ${String(cause)}`)),
    ),
    Effect.forkScoped,
  )

  yield* handle.exitCode.pipe(
    Effect.matchEffect({
      onFailure: cause => Queue.offer(inbound, {
        _tag: 'failure',
        error: new CodexError({
          code: 'process_exit',
          reason: 'Codex app-server exited before turn completion',
          cause,
        }),
      }),
      onSuccess: exitCode => Queue.offer(inbound, {
        _tag: 'exit',
        exitCode: Number(exitCode),
      }),
    }),
    Effect.forkScoped,
  )

  return {
    processId: String(handle.pid),
    send: (message: CodexProtocolMessage) => encodeProtocolMessage(message).pipe(
      Effect.flatMap(buffer => Queue.offer(outbound, buffer)),
      Effect.andThen(Effect.void),
    ),
    nextMessage: Queue.take(inbound).pipe(
      Effect.flatMap((event) => {
        if (event._tag === 'message') {
          return Effect.succeed(event.message)
        }

        if (event._tag === 'failure') {
          return Effect.fail(event.error)
        }

        return Ref.get(stderrTail).pipe(
          Effect.flatMap(stderr => Effect.fail(new CodexError({
            code: 'process_exit',
            reason: processExitReason(event.exitCode, stderr),
          }))),
        )
      }),
    ),
  }
})

const runCodexProcessTurnWithTransport = Effect.fn('runCodexProcessTurnWithTransport')(function* (
  params: CodexRunParams,
  linearTransport: LinearTransportShape,
): Effect.fn.Return<CodexRunResult, CodexError> {
  yield* validateWorkspaceCwdEffect(params)

  return yield* makeCodexProcessSession(params).pipe(
    Effect.flatMap(session =>
      runCodexProtocolTurn(session, params).pipe(
        Effect.provideService(LinearTransport, linearTransport),
      )),
    Effect.scoped,
    Effect.provide(NodeServices.layer),
  )
})

const runCodexProcessTurn = Effect.fn('runCodexProcessTurn')(function* (
  params: CodexRunParams,
): Effect.fn.Return<CodexRunResult, CodexError, LinearTransport> {
  const linearTransport = yield* LinearTransport

  return yield* runCodexProcessTurnWithTransport(params, linearTransport)
})

export const CodexAppServerClientLive = Layer.succeed(CodexAppServerClient)({
  runTurn: Effect.fn('CodexAppServerClient.runTurn')(function* (params: CodexRunParams) {
    return yield* runCodexProcessTurn(params)
  }),
})

function scriptProtocolSession(script: CodexProtocolScript): CodexProtocolSession {
  return {
    processId: null,
    send: message =>
      Effect.try({
        try: () => script.send(message),
        catch: cause => new CodexError({
          code: 'response_error',
          reason: cause instanceof Error ? cause.message : String(cause),
          cause,
        }),
      }),
    nextMessage: Effect.try({
      try: () => script.nextMessage(),
      catch: cause => new CodexError({
        code: 'response_timeout',
        reason: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
    }),
  }
}

function validateWorkspaceCwd(params: CodexRunParams): void {
  if (params.cwd !== params.workspacePath) {
    throw new CodexError({
      code: 'invalid_workspace_cwd',
      reason: 'Codex app-server cwd must equal the per-issue workspace path',
    })
  }
}

function initializeParams(): Record<string, unknown> {
  return {
    clientInfo: CLIENT_INFO,
    capabilities: {
      experimentalApi: true,
    },
  }
}

function threadRequestMethod(params: CodexRunParams): 'thread/resume' | 'thread/start' {
  return params.threadId === null ? 'thread/start' : 'thread/resume'
}

function threadRequestParams(params: CodexRunParams): Record<string, unknown> {
  return omitUndefined({
    ...(params.threadId === null
      ? { dynamicTools: [LINEAR_GRAPHQL_DYNAMIC_TOOL] }
      : { threadId: params.threadId }),
    cwd: params.cwd,
    approvalPolicy: params.config.approvalPolicy,
    sandbox: params.config.threadSandbox,
    serviceName: 'symphony-ts',
  })
}

function turnStartParams(params: CodexRunParams, threadId: string): Record<string, unknown> {
  return omitUndefined({
    threadId,
    cwd: params.cwd,
    approvalPolicy: params.config.approvalPolicy,
    sandboxPolicy: params.config.turnSandboxPolicy,
    input: [
      {
        type: 'text',
        text: params.prompt,
        text_elements: [],
      },
    ],
  })
}

function createTurnState(params: CodexRunParams): TurnState {
  return {
    threadId: params.threadId,
    turnId: null,
    sessionId: null,
    sessionStartedEmitted: false,
    usage: emptyUsage(),
    rateLimits: null,
  }
}

function updateStateFromNotification(state: TurnState, message: JsonRpcNotification): void {
  if (message.method === 'thread/started' || message.method === 'turn/started' || message.method === 'turn/completed') {
    updateThreadAndTurnFromPayload(state, message.params)
  }
}

function updateThreadAndTurnFromPayload(state: TurnState, payload: unknown): void {
  state.threadId = extractThreadId(payload) ?? state.threadId
  state.turnId = extractTurnId(payload) ?? state.turnId
  state.sessionId = composeSessionId(state.threadId, state.turnId) ?? state.sessionId
}

function tryMarkSessionStarted(state: TurnState): boolean {
  const sessionId = composeSessionId(state.threadId, state.turnId)

  if (sessionId === null || state.sessionStartedEmitted) {
    return false
  }

  state.sessionId = sessionId
  state.sessionStartedEmitted = true
  return true
}

function completionFromTurnPayload(
  params: CodexRunParams,
  state: TurnState,
  payload: unknown,
): CodexRunResult | CodexError | null {
  updateThreadAndTurnFromPayload(state, payload)

  const status = extractTurnStatus(payload)

  if (status === null || status === 'inProgress') {
    return null
  }

  if (status === 'completed') {
    if (state.threadId === null || state.turnId === null || state.sessionId === null) {
      return new CodexError({
        code: 'response_error',
        reason: 'turn/completed did not include thread and turn identity',
      })
    }

    return {
      sessionId: state.sessionId,
      threadId: state.threadId,
      turnId: state.turnId,
      turnCount: params.turnNumber,
      usage: state.usage,
      rateLimits: state.rateLimits,
    }
  }

  if (status === 'failed') {
    return new CodexError({
      code: 'turn_failed',
      reason: extractTurnFailureReason(payload) ?? 'Codex turn failed',
      sessionId: state.sessionId ?? undefined,
    })
  }

  if (status === 'interrupted') {
    return new CodexError({
      code: 'turn_cancelled',
      reason: extractTurnFailureReason(payload) ?? 'Codex turn was cancelled',
      sessionId: state.sessionId ?? undefined,
    })
  }

  return new CodexError({
    code: 'response_error',
    reason: `unknown Codex turn status: ${status}`,
    sessionId: state.sessionId ?? undefined,
  })
}

function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { id, result }
}

function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return {
    id,
    error: data === undefined
      ? { code, message }
      : { code, message, data },
  }
}

function dynamicToolResponse(success: boolean, result: unknown): DynamicToolResponse {
  return {
    success,
    contentItems: [
      {
        type: 'inputText',
        text: stringifyJson(result),
      },
    ],
  }
}

function isApprovalRequestMethod(method: string): boolean {
  return method === 'item/commandExecution/requestApproval'
    || method === 'item/fileChange/requestApproval'
    || method === 'item/permissions/requestApproval'
    || method === 'mcpServer/elicitation/request'
}

function approvalApprovalResult(method: string, payload: Record<string, unknown>): Record<string, unknown> | null {
  if (method === 'item/commandExecution/requestApproval') {
    return { decision: 'approve' }
  }

  if (method === 'item/fileChange/requestApproval') {
    return { decision: 'approve' }
  }

  if (method === 'item/permissions/requestApproval') {
    return {
      permissions: isRecord(payload.permissions) ? payload.permissions : {},
      scope: 'session',
      strictAutoReview: false,
    }
  }

  if (method === 'mcpServer/elicitation/request') {
    return { action: 'accept', content: {} }
  }

  return null
}

function makeEvent(
  event: string,
  timestamp: number,
  sessionId: string | null,
  payload: Record<string, unknown>,
  usage: TokenUsage | null,
  rateLimits: unknown,
): CodexRuntimeEvent {
  return {
    event,
    timestamp,
    codexAppServerPid: stringValue(payload.pid),
    sessionId,
    message: stringValue(payload.message),
    usage,
    rateLimits,
  }
}

function extractThreadId(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }

  return stringValue(payload.threadId)
    ?? stringValue(payload.thread_id)
    ?? (isRecord(payload.thread) ? stringValue(payload.thread.id) : null)
}

function extractTurnId(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }

  return stringValue(payload.turnId)
    ?? stringValue(payload.turn_id)
    ?? (isRecord(payload.turn) ? stringValue(payload.turn.id) : null)
}

function extractTurnStatus(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }

  return stringValue(payload.status)
    ?? (isRecord(payload.turn) ? stringValue(payload.turn.status) : null)
}

function extractTurnFailureReason(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null
  }

  const error = isRecord(payload.turn) ? payload.turn.error : payload.error

  if (typeof error === 'string') {
    return error
  }

  if (!isRecord(error)) {
    return null
  }

  return stringValue(error.message)
    ?? stringValue(error.reason)
    ?? stringValue(error.code)
}

function extractUsage(payload: Record<string, unknown>): TokenUsage | null {
  const tokenUsage = isRecord(payload.tokenUsage) ? payload.tokenUsage : null
  const source = tokenUsage !== null && isRecord(tokenUsage.total)
    ? tokenUsage.total
    : isRecord(payload.total_token_usage)
      ? payload.total_token_usage
      : payload
  const input = numberValue(source.inputTokens) ?? numberValue(source.input_tokens)
  const output = numberValue(source.outputTokens) ?? numberValue(source.output_tokens)
  const total = numberValue(source.totalTokens) ?? numberValue(source.total_tokens)

  if (input === null && output === null && total === null) {
    return null
  }

  const inputTokens = input ?? 0
  const outputTokens = output ?? 0

  return {
    inputTokens,
    outputTokens,
    totalTokens: total ?? inputTokens + outputTokens,
  }
}

function extractRateLimits(payload: Record<string, unknown>): unknown {
  return 'rateLimits' in payload ? payload.rateLimits : payload
}

function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  }
}

function composeSessionId(threadId: string | null, turnId: string | null): string | null {
  return threadId === null || turnId === null ? null : `${threadId}-${turnId}`
}

function idsEqual(left: JsonRpcId, right: JsonRpcId): boolean {
  return left === right
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return isRecord(value)
    && isJsonRpcId(value.id)
    && typeof value.method === 'string'
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return isRecord(value)
    && isJsonRpcId(value.id)
    && !('method' in value)
    && ('result' in value || 'error' in value)
}

function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  return isRecord(value)
    && !('id' in value)
    && typeof value.method === 'string'
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'number' || typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function omitUndefined(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))
}

function stringifyJson(value: unknown): string {
  try {
    return encodeUnknownJsonString(value)
  }
  catch {
    return encodeUnknownJsonString({
      success: false,
      error: {
        code: 'non_serializable_tool_result',
        message: 'Tool result could not be serialized as JSON',
      },
    })
  }
}

function formatJsonRpcError(error: unknown): string {
  if (!isRecord(error)) {
    return String(error)
  }

  return stringValue(error.message)
    ?? stringValue(error.reason)
    ?? stringifyJson(error)
}

function processExitReason(code: number | null, stderrTail: string): string {
  const base = `Codex app-server exited before turn completion with code ${code}`

  if (stderrTail.trim() === '') {
    return base
  }

  return `${base}: ${stderrTail.trim()}`
}

function truncateDiagnostic(value: string): string {
  if (value.length <= 4000) {
    return value
  }

  return value.slice(value.length - 4000)
}
