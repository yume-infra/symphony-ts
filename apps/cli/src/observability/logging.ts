import { Context, Effect, Layer, Schema } from 'effect'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  readonly issue_id?: string
  readonly issue_identifier?: string
  readonly session_id?: string
  readonly [key: string]: string | number | boolean | null | undefined
}

export interface RuntimeLoggerShape {
  readonly log: (level: LogLevel, message: string, context?: LogContext) => Effect.Effect<void>
  readonly info: (message: string, context?: LogContext) => Effect.Effect<void>
  readonly warn: (message: string, context?: LogContext) => Effect.Effect<void>
  readonly error: (message: string, context?: LogContext) => Effect.Effect<void>
}

export class RuntimeLogger extends Context.Service<RuntimeLogger, RuntimeLoggerShape>()(
  'symphony/RuntimeLogger',
) {}

const encodeUnknownJsonString = Schema.encodeUnknownSync(Schema.UnknownFromJsonString)

const writeLog = Effect.fn('writeLog')((level: LogLevel, message: string, context: LogContext = {}): Effect.Effect<void> =>
  Effect.sync(() => {
    const line = formatStructuredLog(level, message, context)
    const sink = level === 'error' || level === 'warn' ? console.error : console.log

    sink(line)
  }))

const RuntimeLoggerLiveValue: RuntimeLoggerShape = {
  log: Effect.fn('RuntimeLogger.log')((level: LogLevel, message: string, context?: LogContext) => writeLog(level, message, context)),
  info: Effect.fn('RuntimeLogger.info')((message: string, context?: LogContext) => writeLog('info', message, context)),
  warn: Effect.fn('RuntimeLogger.warn')((message: string, context?: LogContext) => writeLog('warn', message, context)),
  error: Effect.fn('RuntimeLogger.error')((message: string, context?: LogContext) => writeLog('error', message, context)),
}

export const RuntimeLoggerLive = Layer.succeed(RuntimeLogger)(RuntimeLoggerLiveValue)

export function formatStructuredLog(level: LogLevel, message: string, context: LogContext = {}): string {
  const fields = {
    level,
    message,
    ...context,
  }

  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatLogValue(redactIfSecret(key, value))}`)
    .join(' ')
}

function formatLogValue(value: string | number | boolean | null): string {
  if (value === null) {
    return 'null'
  }

  const stringValue = String(value)

  return /^[\w.:/\-[\]]+$/.test(stringValue) ? stringValue : encodeUnknownJsonString(stringValue)
}

function redactIfSecret(
  key: string,
  value: string | number | boolean | null | undefined,
): string | number | boolean | null {
  if (value === undefined) {
    return null
  }

  if (typeof value === 'number') {
    return value
  }

  if (/token|secret|api_key|authorization/i.test(key)) {
    return '[redacted]'
  }

  return value
}
