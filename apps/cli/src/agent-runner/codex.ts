import type { CodexConfig, Issue, ServiceConfig } from '../domain/types.js'
import type { LinearTransportShape } from '../tracker/linear.js'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { Context, Effect, Layer } from 'effect'
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

export interface CodexAppServerClientShape {
  readonly runTurn: (
    params: CodexRunParams,
  ) => Effect.Effect<CodexRunResult, CodexError, LinearTransport>
}

export class CodexAppServerClient extends Context.Service<CodexAppServerClient, CodexAppServerClientShape>()(
  'symphony/CodexAppServerClient',
) {}

export const CodexAppServerClientLive = Layer.succeed(CodexAppServerClient)({
  runTurn: runCodexProcessTurn,
})

const CLIENT_INFO = {
  name: 'symphony-ts',
  version: '0.0.0',
} as const

const MAX_PROTOCOL_LINE_BYTES = 10 * 1024 * 1024
const JSON_RPC_APPLICATION_ERROR = -32000
const JSON_RPC_METHOD_NOT_FOUND = -32601

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

export function runCodexScriptTurn(
  script: CodexProtocolScript,
  params: CodexRunParams,
): Effect.Effect<CodexRunResult, CodexError, LinearTransport> {
  return Effect.gen(function* () {
    yield* validateWorkspaceCwdEffect(params)

    const state = createTurnState(params)
    let nextId = 1
    const initializeId = nextId++
    let threadRequestId: JsonRpcId | null = null
    let turnRequestId: JsonRpcId | null = null

    script.send(initializeRequest(initializeId))

    while (true) {
      const message = yield* readScriptMessage(script)

      if (isJsonRpcResponse(message)) {
        if (idsEqual(message.id, initializeId)) {
          yield* failOnJsonRpcError(message, 'initialize')
          threadRequestId = nextId++
          script.send(threadRequest(threadRequestId, params))
          continue
        }

        if (threadRequestId !== null && idsEqual(message.id, threadRequestId)) {
          yield* failOnJsonRpcError(message, 'thread startup')
          state.threadId = extractThreadId(message.result) ?? state.threadId

          if (state.threadId === null) {
            return yield* new CodexError({
              code: 'response_error',
              reason: 'thread/start or thread/resume response did not include thread identity',
            })
          }

          turnRequestId = nextId++
          script.send(turnStartRequest(turnRequestId, params, state.threadId))
          continue
        }

        if (turnRequestId !== null && idsEqual(message.id, turnRequestId)) {
          yield* failOnJsonRpcError(message, 'turn/start')
          updateThreadAndTurnFromPayload(state, message.result)
          yield* maybeEmitSessionStarted(params, state)

          const completion = completionFromTurnPayload(params, state, message.result)

          if (completion instanceof CodexError) {
            return yield* completion
          }

          if (completion !== null) {
            return completion
          }

          continue
        }

        return yield* new CodexError({
          code: 'response_error',
          reason: `unexpected JSON-RPC response id: ${String(message.id)}`,
        })
      }

      if (isJsonRpcRequest(message)) {
        yield* handleScriptServerRequest(script, params, state, message)
        continue
      }

      if (isJsonRpcNotification(message)) {
        const completion = yield* handleScriptNotification(params, state, message)

        if (completion !== null) {
          return completion
        }

        continue
      }

      return yield* new CodexError({
        code: 'malformed_message',
        reason: 'Codex app-server emitted an unsupported JSON-RPC message shape',
      })
    }
  })
}

function runCodexProcessTurn(
  params: CodexRunParams,
): Effect.Effect<CodexRunResult, CodexError, LinearTransport> {
  return Effect.gen(function* () {
    const linearTransport = yield* LinearTransport

    return yield* runCodexProcessTurnWithTransport(params, linearTransport)
  })
}

function runCodexProcessTurnWithTransport(
  params: CodexRunParams,
  linearTransport: LinearTransportShape,
): Effect.Effect<CodexRunResult, CodexError> {
  return Effect.callback<CodexRunResult, CodexError>((resume) => {
    try {
      validateWorkspaceCwd(params)
    }
    catch (cause) {
      resume(Effect.fail(cause instanceof CodexError
        ? cause
        : new CodexError({
            code: 'invalid_workspace_cwd',
            reason: cause instanceof Error ? cause.message : String(cause),
          })))
      return
    }

    const child = spawn('bash', ['-lc', params.command], {
      cwd: params.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const state = createTurnState(params)
    const pendingResponses = new Map<JsonRpcId, (message: JsonRpcResponse) => void>()
    let settled = false
    let nextId = 1
    let buffer = ''
    let stderrTail = ''
    let readTimeout: ReturnType<typeof setTimeout> | null = null
    const turnTimeout = setTimeout(() => {
      settleFailure(new CodexError({
        code: 'turn_timeout',
        reason: `Codex turn timed out after ${params.config.turnTimeoutMs}ms`,
        sessionId: state.sessionId ?? undefined,
      }))
    }, params.config.turnTimeoutMs)

    child.on('error', cause => settleFailure(new CodexError({
      code: 'codex_not_found',
      reason: 'failed to start Codex app-server command',
      cause,
    })))
    child.on('exit', (code) => {
      if (!settled) {
        settleFailure(new CodexError({
          code: 'process_exit',
          reason: processExitReason(code, stderrTail),
          sessionId: state.sessionId ?? undefined,
        }))
      }
    })
    child.stdin?.on('error', cause => settleFailure(new CodexError({
      code: 'response_error',
      reason: 'failed to write to Codex app-server stdin',
      cause,
      sessionId: state.sessionId ?? undefined,
    })))
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = truncateDiagnostic(`${stderrTail}${chunk.toString('utf8')}`)
    })
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')

      if (Buffer.byteLength(buffer, 'utf8') > MAX_PROTOCOL_LINE_BYTES) {
        settleFailure(new CodexError({
          code: 'malformed_message',
          reason: `Codex app-server protocol line exceeded ${MAX_PROTOCOL_LINE_BYTES} bytes`,
          sessionId: state.sessionId ?? undefined,
        }))
        return
      }

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.trim() === '' || settled) {
          continue
        }

        handleProcessLine(line)
      }
    })

    sendRequest('initialize', initializeParams(), (message) => {
      if (!finishJsonRpcResponse(message, 'initialize')) {
        return
      }

      sendRequest(threadRequestMethod(params), threadRequestParams(params), (threadMessage) => {
        if (!finishJsonRpcResponse(threadMessage, 'thread startup')) {
          return
        }

        state.threadId = extractThreadId(threadMessage.result) ?? state.threadId

        if (state.threadId === null) {
          settleFailure(new CodexError({
            code: 'response_error',
            reason: 'thread/start or thread/resume response did not include thread identity',
          }))
          return
        }

        sendRequest('turn/start', turnStartParams(params, state.threadId), (turnMessage) => {
          if (!finishJsonRpcResponse(turnMessage, 'turn/start')) {
            return
          }

          updateThreadAndTurnFromPayload(state, turnMessage.result)
          emitSessionStartedFromProcess()
          settleTerminalPayload(turnMessage.result)
        })
      })
    })

    function sendRequest(
      method: string,
      requestParams: Record<string, unknown>,
      onResponse: (message: JsonRpcResponse) => void,
    ): void {
      if (settled) {
        return
      }

      const id = nextId++
      pendingResponses.set(id, onResponse)
      armReadTimeout(method)
      sendMessage({
        id,
        method,
        params: requestParams,
      })
    }

    function sendResult(id: JsonRpcId, result: unknown): void {
      sendMessage({ id, result })
    }

    function sendError(id: JsonRpcId, code: number, message: string, data?: unknown): void {
      sendMessage({
        id,
        error: data === undefined
          ? { code, message }
          : { code, message, data },
      })
    }

    function sendMessage(message: CodexProtocolMessage): void {
      if (settled || child.stdin === null || child.stdin.destroyed) {
        return
      }

      child.stdin.write(`${JSON.stringify(message)}\n`)
    }

    function handleProcessLine(line: string): void {
      let parsed: unknown

      try {
        parsed = JSON.parse(line)
      }
      catch (cause) {
        settleFailure(new CodexError({
          code: 'malformed_message',
          reason: 'Codex app-server emitted malformed JSON',
          cause,
          sessionId: state.sessionId ?? undefined,
        }))
        return
      }

      if (isJsonRpcResponse(parsed)) {
        const handler = pendingResponses.get(parsed.id)

        if (handler === undefined) {
          settleFailure(new CodexError({
            code: 'response_error',
            reason: `unexpected JSON-RPC response id: ${String(parsed.id)}`,
            sessionId: state.sessionId ?? undefined,
          }))
          return
        }

        pendingResponses.delete(parsed.id)
        clearReadTimeout()
        handler(parsed)
        return
      }

      if (isJsonRpcRequest(parsed)) {
        handleProcessServerRequest(parsed)
        return
      }

      if (isJsonRpcNotification(parsed)) {
        handleProcessNotification(parsed)
        return
      }

      settleFailure(new CodexError({
        code: 'malformed_message',
        reason: 'Codex app-server emitted an unsupported JSON-RPC message shape',
        sessionId: state.sessionId ?? undefined,
      }))
    }

    function handleProcessServerRequest(message: JsonRpcRequest): void {
      const payload = isRecord(message.params) ? message.params : {}

      if (message.method === 'item/tool/call') {
        void Effect.runPromise(
          executeDynamicToolCall(params, message.params).pipe(
            Effect.provideService(LinearTransport, linearTransport),
          ),
        ).then((result) => {
          if (settled) {
            return
          }

          sendResult(message.id, result.response)
          emitProcessEvent(result.event, payload)
        }).catch(cause => settleFailure(new CodexError({
          code: 'response_error',
          reason: 'failed to execute Codex dynamic tool call',
          cause,
          sessionId: state.sessionId ?? undefined,
        })))
        return
      }

      if (message.method === 'item/tool/requestUserInput') {
        sendError(
          message.id,
          JSON_RPC_APPLICATION_ERROR,
          'Symphony does not support interactive user input during Codex turns',
        )
        settleFailure(new CodexError({
          code: 'turn_input_required',
          reason: 'Codex requested user input; first-pass Symphony fails rather than stalling',
          sessionId: state.sessionId ?? undefined,
        }))
        return
      }

      if (isApprovalRequestMethod(message.method)) {
        const result = approvalRejectionResult(message.method)

        if (result === null) {
          sendError(
            message.id,
            JSON_RPC_APPLICATION_ERROR,
            `Symphony rejected unsupported approval request: ${message.method}`,
          )
        }
        else {
          sendResult(message.id, result)
        }

        emitProcessEvent('approval_rejected', payload)
        return
      }

      sendError(
        message.id,
        JSON_RPC_METHOD_NOT_FOUND,
        `Unsupported Codex server request method: ${message.method}`,
      )
      settleFailure(new CodexError({
        code: 'response_error',
        reason: `unsupported Codex server request method: ${message.method}`,
        sessionId: state.sessionId ?? undefined,
      }))
    }

    function handleProcessNotification(message: JsonRpcNotification): void {
      const payload = isRecord(message.params) ? message.params : {}

      updateStateFromNotification(state, message)
      emitSessionStartedFromProcess()

      if (message.method === 'thread/tokenUsage/updated') {
        state.usage = extractUsage(payload) ?? state.usage
      }

      if (message.method === 'account/rateLimits/updated') {
        state.rateLimits = extractRateLimits(payload)
      }

      emitProcessEvent(message.method, payload)

      if (message.method === 'error') {
        settleFailure(new CodexError({
          code: 'response_error',
          reason: stringValue(payload.message) ?? 'Codex app-server emitted an error notification',
          sessionId: state.sessionId ?? undefined,
        }))
        return
      }

      if (message.method === 'turn/completed') {
        settleTerminalPayload(message.params)
      }
    }

    function settleTerminalPayload(payload: unknown): void {
      const completion = completionFromTurnPayload(params, state, payload)

      if (completion instanceof CodexError) {
        settleFailure(completion)
        return
      }

      if (completion !== null) {
        settleSuccess(completion)
      }
    }

    function finishJsonRpcResponse(message: JsonRpcResponse, label: string): boolean {
      if (message.error === undefined) {
        return true
      }

      settleFailure(new CodexError({
        code: 'response_error',
        reason: `${label} failed: ${formatJsonRpcError(message.error)}`,
        sessionId: state.sessionId ?? undefined,
        cause: message.error,
      }))
      return false
    }

    function emitSessionStartedFromProcess(): void {
      if (!tryMarkSessionStarted(state)) {
        return
      }

      emitProcessEvent('session_started', {
        threadId: state.threadId,
        turnId: state.turnId,
      })
    }

    function emitProcessEvent(event: string, payload: Record<string, unknown>): void {
      const eventPayload = child.pid === undefined
        ? payload
        : {
            ...payload,
            pid: String(child.pid),
          }

      void Effect.runPromise(emit(params, makeEvent(event, state.sessionId, eventPayload, state.usage, state.rateLimits)))
    }

    function armReadTimeout(stage: string): void {
      clearReadTimeout()
      readTimeout = setTimeout(() => {
        settleFailure(new CodexError({
          code: 'response_timeout',
          reason: `Codex app-server did not answer ${stage} within ${params.config.readTimeoutMs}ms`,
          sessionId: state.sessionId ?? undefined,
        }))
      }, params.config.readTimeoutMs)
    }

    function clearReadTimeout(): void {
      if (readTimeout !== null) {
        clearTimeout(readTimeout)
        readTimeout = null
      }
    }

    function settleSuccess(result: CodexRunResult): void {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(turnTimeout)
      clearReadTimeout()
      child.kill('SIGTERM')
      resume(Effect.succeed(result))
    }

    function settleFailure(error: CodexError): void {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(turnTimeout)
      clearReadTimeout()
      child.kill('SIGTERM')
      resume(Effect.fail(error))
    }

    return Effect.sync(() => {
      clearTimeout(turnTimeout)
      clearReadTimeout()

      if (!settled) {
        child.kill('SIGTERM')
      }
    })
  })
}

function readScriptMessage(script: CodexProtocolScript): Effect.Effect<unknown, CodexError> {
  return Effect.try({
    try: () => script.nextMessage(),
    catch: cause => new CodexError({
      code: 'response_timeout',
      reason: cause instanceof Error ? cause.message : String(cause),
      cause,
    }),
  })
}

function handleScriptServerRequest(
  script: CodexProtocolScript,
  params: CodexRunParams,
  state: TurnState,
  message: JsonRpcRequest,
): Effect.Effect<void, CodexError, LinearTransport> {
  return Effect.gen(function* () {
    const payload = isRecord(message.params) ? message.params : {}

    if (message.method === 'item/tool/call') {
      const result = yield* executeDynamicToolCall(params, message.params)

      script.send({
        id: message.id,
        result: result.response,
      })
      yield* emit(params, makeEvent(result.event, state.sessionId, payload, state.usage, state.rateLimits))
      return
    }

    if (message.method === 'item/tool/requestUserInput') {
      script.send(jsonRpcError(
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
      const result = approvalRejectionResult(message.method)

      script.send(result === null
        ? jsonRpcError(message.id, JSON_RPC_APPLICATION_ERROR, `Symphony rejected unsupported approval request: ${message.method}`)
        : jsonRpcResult(message.id, result))
      yield* emit(params, makeEvent('approval_rejected', state.sessionId, payload, state.usage, state.rateLimits))
      return
    }

    script.send(jsonRpcError(
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
}

function handleScriptNotification(
  params: CodexRunParams,
  state: TurnState,
  message: JsonRpcNotification,
): Effect.Effect<CodexRunResult | null, CodexError> {
  return Effect.gen(function* () {
    const payload = isRecord(message.params) ? message.params : {}

    updateStateFromNotification(state, message)
    yield* maybeEmitSessionStarted(params, state)

    if (message.method === 'thread/tokenUsage/updated') {
      state.usage = extractUsage(payload) ?? state.usage
    }

    if (message.method === 'account/rateLimits/updated') {
      state.rateLimits = extractRateLimits(payload)
    }

    yield* emit(params, makeEvent(message.method, state.sessionId, payload, state.usage, state.rateLimits))

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
}

function executeDynamicToolCall(
  params: CodexRunParams,
  requestParams: unknown,
): Effect.Effect<DynamicToolExecution, never, LinearTransport> {
  return Effect.gen(function* () {
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
}

function validateWorkspaceCwd(params: CodexRunParams): void {
  if (params.cwd !== params.workspacePath) {
    throw new CodexError({
      code: 'invalid_workspace_cwd',
      reason: 'Codex app-server cwd must equal the per-issue workspace path',
    })
  }
}

function validateWorkspaceCwdEffect(params: CodexRunParams): Effect.Effect<void, CodexError> {
  return Effect.try({
    try: () => validateWorkspaceCwd(params),
    catch: cause => cause instanceof CodexError
      ? cause
      : new CodexError({
          code: 'invalid_workspace_cwd',
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
  })
}

function initializeRequest(id: JsonRpcId): JsonRpcRequest {
  return {
    id,
    method: 'initialize',
    params: initializeParams(),
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

function threadRequest(id: JsonRpcId, params: CodexRunParams): JsonRpcRequest {
  return {
    id,
    method: threadRequestMethod(params),
    params: threadRequestParams(params),
  }
}

function threadRequestMethod(params: CodexRunParams): 'thread/resume' | 'thread/start' {
  return params.threadId === null ? 'thread/start' : 'thread/resume'
}

function threadRequestParams(params: CodexRunParams): Record<string, unknown> {
  return omitUndefined({
    ...(params.threadId === null ? {} : { threadId: params.threadId }),
    cwd: params.cwd,
    approvalPolicy: params.config.approvalPolicy,
    sandbox: params.config.threadSandbox,
    serviceName: 'symphony-ts',
  })
}

function turnStartRequest(id: JsonRpcId, params: CodexRunParams, threadId: string): JsonRpcRequest {
  return {
    id,
    method: 'turn/start',
    params: turnStartParams(params, threadId),
  }
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

function maybeEmitSessionStarted(params: CodexRunParams, state: TurnState): Effect.Effect<void> {
  if (!tryMarkSessionStarted(state)) {
    return Effect.void
  }

  return emit(params, makeEvent('session_started', state.sessionId, {
    threadId: state.threadId,
    turnId: state.turnId,
  }, state.usage, state.rateLimits))
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

function failOnJsonRpcError(message: JsonRpcResponse, label: string): Effect.Effect<void, CodexError> {
  if (message.error === undefined) {
    return Effect.void
  }

  return Effect.fail(new CodexError({
    code: 'response_error',
    reason: `${label} failed: ${formatJsonRpcError(message.error)}`,
    cause: message.error,
  }))
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

function approvalRejectionResult(method: string): Record<string, unknown> | null {
  if (method === 'item/commandExecution/requestApproval') {
    return { decision: 'decline' }
  }

  if (method === 'item/fileChange/requestApproval') {
    return { decision: 'decline' }
  }

  if (method === 'item/tool/requestUserInput') {
    return { answers: {} }
  }

  return null
}

function makeEvent(
  event: string,
  sessionId: string | null,
  payload: Record<string, unknown>,
  usage: TokenUsage | null,
  rateLimits: unknown,
): CodexRuntimeEvent {
  return {
    event,
    timestamp: Date.now(),
    codexAppServerPid: stringValue(payload.pid),
    sessionId,
    message: stringValue(payload.message),
    usage,
    rateLimits,
  }
}

function emit(params: CodexRunParams, event: CodexRuntimeEvent): Effect.Effect<void> {
  return params.onEvent?.(event) ?? Effect.void
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
    return JSON.stringify(value) ?? 'null'
  }
  catch {
    return JSON.stringify({
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
