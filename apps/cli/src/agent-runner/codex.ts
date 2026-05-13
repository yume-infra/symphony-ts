import type { Buffer } from 'node:buffer'
import type { CodexConfig, Issue, ServiceConfig } from '../domain/types.js'
import type { LinearTransport } from '../tracker/linear.js'
import { spawn } from 'node:child_process'
import { Context, Effect, Layer } from 'effect'
import { executeLinearGraphQLTool } from '../client-tools/linear-graphql.js'
import { CodexError } from '../domain/errors.js'

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

interface CodexProtocolMessage {
  readonly event: string
  readonly payload?: unknown
}

export interface CodexProtocolScript {
  readonly send: (message: unknown) => void
  readonly nextMessage: () => CodexProtocolMessage
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

export function runCodexScriptTurn(
  script: CodexProtocolScript,
  params: CodexRunParams,
): Effect.Effect<CodexRunResult, CodexError, LinearTransport> {
  return Effect.gen(function* () {
    yield* validateWorkspaceCwdEffect(params)
    script.send(startMessage(params))

    let threadId = params.threadId
    let turnId: string | null = null
    let usage: TokenUsage = emptyUsage()
    let rateLimits: unknown = null
    let sessionId: string | null = null

    while (true) {
      const message = yield* readScriptMessage(script)
      const payload = isRecord(message.payload) ? message.payload : {}

      if (message.event === 'session_started') {
        threadId = stringValue(payload.thread_id) ?? stringValue(payload.threadId) ?? threadId
        turnId = stringValue(payload.turn_id) ?? stringValue(payload.turnId) ?? turnId
        sessionId = composeSessionId(threadId, turnId)
        yield* emit(params, makeEvent(message.event, sessionId, payload, null, null))
        continue
      }

      if (message.event === 'token_usage' || message.event === 'thread/tokenUsage/updated') {
        usage = extractUsage(payload) ?? usage
        yield* emit(params, makeEvent(message.event, sessionId, payload, usage, rateLimits))
        continue
      }

      if (message.event === 'rate_limits') {
        rateLimits = payload
        yield* emit(params, makeEvent(message.event, sessionId, payload, usage, rateLimits))
        continue
      }

      if (message.event === 'tool_call') {
        const toolName = stringValue(payload.name)
        const toolInput = 'input' in payload ? payload.input : undefined

        if (toolName === 'linear_graphql') {
          const result = yield* executeLinearGraphQLTool(params.serviceConfig, toolInput)
          script.send({
            type: 'tool_result',
            name: toolName,
            result,
          })
        }
        else {
          const result = {
            success: false,
            error: {
              code: 'unsupported_tool_call',
              message: `Unsupported tool: ${toolName ?? 'unknown'}`,
            },
          }
          script.send({
            type: 'tool_result',
            name: toolName,
            result,
          })
          yield* emit(params, makeEvent('unsupported_tool_call', sessionId, payload, usage, rateLimits))
        }

        continue
      }

      yield* emit(params, makeEvent(message.event, sessionId, payload, usage, rateLimits))

      if (message.event === 'turn_completed') {
        const completedThreadId = stringValue(payload.thread_id) ?? stringValue(payload.threadId) ?? threadId
        const completedTurnId = stringValue(payload.turn_id) ?? stringValue(payload.turnId) ?? turnId
        const completedSessionId = composeSessionId(completedThreadId, completedTurnId)

        if (completedThreadId === null || completedTurnId === null || completedSessionId === null) {
          return yield* new CodexError({
            code: 'response_error',
            reason: 'turn_completed did not include thread and turn identity',
          })
        }

        return {
          sessionId: completedSessionId,
          threadId: completedThreadId,
          turnId: completedTurnId,
          turnCount: params.turnNumber,
          usage,
          rateLimits,
        }
      }

      if (message.event === 'turn_failed') {
        return yield* new CodexError({
          code: 'turn_failed',
          reason: stringValue(payload.reason) ?? 'Codex turn failed',
          sessionId: sessionId ?? undefined,
        })
      }

      if (message.event === 'turn_cancelled') {
        return yield* new CodexError({
          code: 'turn_cancelled',
          reason: stringValue(payload.reason) ?? 'Codex turn was cancelled',
          sessionId: sessionId ?? undefined,
        })
      }

      if (message.event === 'turn_input_required') {
        return yield* new CodexError({
          code: 'turn_input_required',
          reason: 'Codex requested user input; first-pass Symphony fails rather than stalling',
          sessionId: sessionId ?? undefined,
        })
      }
    }
  })
}

function runCodexProcessTurn(
  params: CodexRunParams,
): Effect.Effect<CodexRunResult, CodexError, LinearTransport> {
  return Effect.callback<CodexRunResult, CodexError, LinearTransport>((resume) => {
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
    let settled = false
    let buffer = ''
    let threadId = params.threadId
    let turnId: string | null = null
    let usage = emptyUsage()
    let rateLimits: unknown = null
    let sessionId: string | null = null
    const timeout = setTimeout(() => {
      if (settled) {
        return
      }

      settled = true
      child.kill('SIGTERM')
      resume(Effect.fail(new CodexError({
        code: 'turn_timeout',
        reason: `Codex turn timed out after ${params.config.turnTimeoutMs}ms`,
        sessionId: sessionId ?? undefined,
      })))
    }, params.config.turnTimeoutMs)

    child.stdin?.write(`${JSON.stringify(startMessage(params))}\n`)
    child.stdin?.end()
    child.on('error', cause => settleFailure(new CodexError({
      code: 'codex_not_found',
      reason: 'failed to start Codex app-server command',
      cause,
    })))
    child.on('exit', (code) => {
      if (!settled) {
        settleFailure(new CodexError({
          code: 'process_exit',
          reason: `Codex app-server exited before turn completion with code ${code}`,
          sessionId: sessionId ?? undefined,
        }))
      }
    })
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.trim() === '') {
          continue
        }

        let message: CodexProtocolMessage

        try {
          message = JSON.parse(line) as CodexProtocolMessage
        }
        catch (cause) {
          settleFailure(new CodexError({
            code: 'malformed_message',
            reason: 'Codex app-server emitted malformed JSON',
            cause,
          }))
          return
        }

        const payload = isRecord(message.payload) ? message.payload : {}

        if (message.event === 'session_started') {
          threadId = stringValue(payload.thread_id) ?? stringValue(payload.threadId) ?? threadId
          turnId = stringValue(payload.turn_id) ?? stringValue(payload.turnId) ?? turnId
          sessionId = composeSessionId(threadId, turnId)
        }

        if (message.event === 'token_usage' || message.event === 'thread/tokenUsage/updated') {
          usage = extractUsage(payload) ?? usage
        }

        if (message.event === 'rate_limits') {
          rateLimits = payload
        }

        if (message.event === 'turn_completed') {
          const completedThreadId = stringValue(payload.thread_id) ?? stringValue(payload.threadId) ?? threadId
          const completedTurnId = stringValue(payload.turn_id) ?? stringValue(payload.turnId) ?? turnId
          const completedSessionId = composeSessionId(completedThreadId, completedTurnId)

          if (completedThreadId === null || completedTurnId === null || completedSessionId === null) {
            settleFailure(new CodexError({
              code: 'response_error',
              reason: 'turn_completed did not include thread and turn identity',
            }))
            return
          }

          settleSuccess({
            sessionId: completedSessionId,
            threadId: completedThreadId,
            turnId: completedTurnId,
            turnCount: params.turnNumber,
            usage,
            rateLimits,
          })
          return
        }
      }
    })

    function settleSuccess(result: CodexRunResult): void {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      child.kill('SIGTERM')
      resume(Effect.succeed(result))
    }

    function settleFailure(error: CodexError): void {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      child.kill('SIGTERM')
      resume(Effect.fail(error))
    }

    return Effect.sync(() => {
      clearTimeout(timeout)

      if (!settled) {
        child.kill('SIGTERM')
      }
    })
  })
}

function readScriptMessage(script: CodexProtocolScript): Effect.Effect<CodexProtocolMessage, CodexError> {
  return Effect.try({
    try: () => script.nextMessage(),
    catch: cause => new CodexError({
      code: 'response_timeout',
      reason: cause instanceof Error ? cause.message : String(cause),
      cause,
    }),
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

function startMessage(params: CodexRunParams): Record<string, unknown> {
  return {
    type: 'turn_start',
    cwd: params.cwd,
    prompt: params.prompt,
    title: `${params.issue.identifier}: ${params.issue.title}`,
    thread_id: params.threadId,
    turn_number: params.turnNumber,
    tools: ['linear_graphql'],
    approval_policy: params.config.approvalPolicy,
    thread_sandbox: params.config.threadSandbox,
    turn_sandbox_policy: params.config.turnSandboxPolicy,
  }
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

function extractUsage(payload: Record<string, unknown>): TokenUsage | null {
  const source = isRecord(payload.total_token_usage) ? payload.total_token_usage : payload
  const input = numberValue(source.input_tokens) ?? numberValue(source.inputTokens)
  const output = numberValue(source.output_tokens) ?? numberValue(source.outputTokens)
  const total = numberValue(source.total_tokens) ?? numberValue(source.totalTokens)

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
