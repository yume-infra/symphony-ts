import { Context, Effect, Layer } from 'effect'

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

const RuntimeLoggerLiveValue: RuntimeLoggerShape = {
  log: writeLog,
  info: (message, context) => writeLog('info', message, context),
  warn: (message, context) => writeLog('warn', message, context),
  error: (message, context) => writeLog('error', message, context),
}

export const RuntimeLoggerLive = Layer.succeed(RuntimeLogger)(RuntimeLoggerLiveValue)

function writeLog(level: LogLevel, message: string, context: LogContext = {}): Effect.Effect<void> {
  return Effect.sync(() => {
    const line = formatStructuredLog(level, message, context)
    const sink = level === 'error' || level === 'warn' ? console.error : console.log

    sink(line)
  })
}

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

  return /^[\w.:/\-[\]]+$/.test(stringValue) ? stringValue : JSON.stringify(stringValue)
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
