import type { ServiceConfig, WorkflowDefinition } from '../domain/types.js'
import { existsSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, normalize, resolve } from 'node:path'
import process from 'node:process'
import { Context, Effect, Layer } from 'effect'
import { ConfigError } from '../domain/errors.js'
import { isPlainRecord, normalizeStateName } from '../domain/types.js'

export interface ConfigResolverShape {
  readonly resolve: (
    workflow: WorkflowDefinition,
    options?: ResolveConfigOptions,
  ) => Effect.Effect<ServiceConfig, ConfigError>
  readonly validateDispatch: (config: ServiceConfig) => Effect.Effect<void, ConfigError>
}

export interface ResolveConfigOptions {
  readonly env?: Record<string, string | undefined>
  readonly homeDirectory?: string
  readonly systemTempDirectory?: string
}

export class ConfigResolver extends Context.Service<ConfigResolver, ConfigResolverShape>()(
  'symphony/ConfigResolver',
) {}

export const ConfigResolverLive = Layer.succeed(ConfigResolver)({
  resolve: resolveServiceConfig,
  validateDispatch,
})

const DEFAULT_ACTIVE_STATES = ['Todo', 'In Progress'] as const
const DEFAULT_TERMINAL_STATES = ['Closed', 'Cancelled', 'Canceled', 'Duplicate', 'Done'] as const

export function resolveServiceConfig(
  workflow: WorkflowDefinition,
  options: ResolveConfigOptions = {},
): Effect.Effect<ServiceConfig, ConfigError> {
  return Effect.sync(() => {
    const env = options.env ?? loadEnvironment(workflow.directory)
    const tracker = getRecord(workflow.config, 'tracker')
    const polling = getRecord(workflow.config, 'polling')
    const workspace = getRecord(workflow.config, 'workspace')
    const hooks = getRecord(workflow.config, 'hooks')
    const agent = getRecord(workflow.config, 'agent')
    const codex = getRecord(workflow.config, 'codex')
    const trackerKind = optionalString(tracker.kind)
    const apiKey = resolveApiKey(optionalString(tracker.api_key), trackerKind, env)
    const workspaceRoot = resolvePathValue(
      optionalString(workspace.root),
      workflow.directory,
      env,
      options.homeDirectory ?? homedir(),
      options.systemTempDirectory ?? tmpdir(),
    )

    return {
      workflowPath: workflow.path,
      workflowDirectory: workflow.directory,
      promptTemplate: workflow.promptTemplate,
      tracker: {
        kind: trackerKind,
        endpoint: optionalString(tracker.endpoint) ?? 'https://api.linear.app/graphql',
        apiKey,
        projectSlug: optionalString(tracker.project_slug),
        activeStates: stringArray(tracker.active_states, DEFAULT_ACTIVE_STATES),
        terminalStates: stringArray(tracker.terminal_states, DEFAULT_TERMINAL_STATES),
      },
      polling: {
        intervalMs: positiveInteger(polling.interval_ms, 30000),
      },
      workspace: {
        root: workspaceRoot,
      },
      hooks: {
        afterCreate: optionalString(hooks.after_create),
        beforeRun: optionalString(hooks.before_run),
        afterRun: optionalString(hooks.after_run),
        beforeRemove: optionalString(hooks.before_remove),
        timeoutMs: positiveInteger(hooks.timeout_ms, 60000),
      },
      agent: {
        maxConcurrentAgents: positiveInteger(agent.max_concurrent_agents, 10),
        maxTurns: positiveInteger(agent.max_turns, 20),
        maxRetryBackoffMs: positiveInteger(agent.max_retry_backoff_ms, 300000),
        maxConcurrentAgentsByState: concurrencyByState(agent.max_concurrent_agents_by_state),
      },
      codex: {
        command: optionalString(codex.command) ?? 'codex app-server',
        approvalPolicy: codex.approval_policy,
        threadSandbox: codex.thread_sandbox,
        turnSandboxPolicy: codex.turn_sandbox_policy,
        turnTimeoutMs: positiveInteger(codex.turn_timeout_ms, 3600000),
        readTimeoutMs: positiveInteger(codex.read_timeout_ms, 5000),
        stallTimeoutMs: integer(codex.stall_timeout_ms, 300000),
      },
    }
  }).pipe(
    Effect.flatMap(config =>
      validateConfigValues(config).pipe(
        Effect.as(config),
      ),
    ),
  )
}

export function validateDispatch(config: ServiceConfig): Effect.Effect<void, ConfigError> {
  if (config.tracker.kind === null || config.tracker.kind.trim() === '') {
    return Effect.fail(new ConfigError({
      code: 'missing_tracker_kind',
      path: config.workflowPath,
      field: 'tracker.kind',
      reason: 'tracker.kind is required for dispatch',
    }))
  }

  if (normalizeStateName(config.tracker.kind) !== 'linear') {
    return Effect.fail(new ConfigError({
      code: 'unsupported_tracker_kind',
      path: config.workflowPath,
      field: 'tracker.kind',
      reason: `unsupported tracker kind: ${config.tracker.kind}`,
    }))
  }

  if (config.tracker.apiKey === null || config.tracker.apiKey.trim() === '') {
    return Effect.fail(new ConfigError({
      code: 'missing_tracker_api_key',
      path: config.workflowPath,
      field: 'tracker.api_key',
      reason: 'tracker.api_key or LINEAR_API_KEY is required for Linear dispatch',
    }))
  }

  if (config.tracker.projectSlug === null || config.tracker.projectSlug.trim() === '') {
    return Effect.fail(new ConfigError({
      code: 'missing_tracker_project_slug',
      path: config.workflowPath,
      field: 'tracker.project_slug',
      reason: 'tracker.project_slug is required for Linear dispatch',
    }))
  }

  if (config.codex.command.trim() === '') {
    return Effect.fail(new ConfigError({
      code: 'missing_codex_command',
      path: config.workflowPath,
      field: 'codex.command',
      reason: 'codex.command must be non-empty',
    }))
  }

  return Effect.void
}

function validateConfigValues(config: ServiceConfig): Effect.Effect<void, ConfigError> {
  if (config.hooks.timeoutMs <= 0) {
    return invalidConfig(config, 'hooks.timeout_ms', 'hooks.timeout_ms must be positive')
  }

  if (config.polling.intervalMs <= 0) {
    return invalidConfig(config, 'polling.interval_ms', 'polling.interval_ms must be positive')
  }

  if (config.agent.maxConcurrentAgents <= 0) {
    return invalidConfig(config, 'agent.max_concurrent_agents', 'agent.max_concurrent_agents must be positive')
  }

  if (config.agent.maxTurns <= 0) {
    return invalidConfig(config, 'agent.max_turns', 'agent.max_turns must be positive')
  }

  if (config.agent.maxRetryBackoffMs <= 0) {
    return invalidConfig(config, 'agent.max_retry_backoff_ms', 'agent.max_retry_backoff_ms must be positive')
  }

  if (config.codex.turnTimeoutMs <= 0) {
    return invalidConfig(config, 'codex.turn_timeout_ms', 'codex.turn_timeout_ms must be positive')
  }

  if (config.codex.readTimeoutMs <= 0) {
    return invalidConfig(config, 'codex.read_timeout_ms', 'codex.read_timeout_ms must be positive')
  }

  return Effect.void
}

function invalidConfig(config: ServiceConfig, field: string, reason: string): Effect.Effect<void, ConfigError> {
  return Effect.fail(new ConfigError({
    code: 'invalid_config_value',
    path: config.workflowPath,
    field,
    reason,
  }))
}

function getRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parent[key]

  return isPlainRecord(value) ? value : {}
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function stringArray(value: unknown, fallback: ReadonlyArray<string>): ReadonlyArray<string> {
  if (!Array.isArray(value)) {
    return [...fallback]
  }

  const strings = value.filter((item): item is string => typeof item === 'string')

  return strings.length > 0 ? strings : [...fallback]
}

function positiveInteger(value: unknown, fallback: number): number {
  const resolved = integer(value, fallback)

  return resolved > 0 ? resolved : fallback
}

function integer(value: unknown, fallback: number): number {
  return Number.isInteger(value) ? value as number : fallback
}

function concurrencyByState(value: unknown): ReadonlyMap<string, number> {
  const output = new Map<string, number>()

  if (!isPlainRecord(value)) {
    return output
  }

  for (const [state, limit] of Object.entries(value)) {
    if (Number.isInteger(limit) && (limit as number) > 0) {
      output.set(normalizeStateName(state), limit as number)
    }
  }

  return output
}

function resolveApiKey(
  configured: string | null,
  trackerKind: string | null,
  env: Record<string, string | undefined>,
): string | null {
  if (configured !== null) {
    return resolveEnvString(configured, env)
  }

  if (trackerKind !== null && normalizeStateName(trackerKind) === 'linear') {
    const value = env.LINEAR_API_KEY

    return value === undefined || value === '' ? null : value
  }

  return null
}

function resolvePathValue(
  configured: string | null,
  workflowDirectory: string,
  env: Record<string, string | undefined>,
  homeDirectory: string,
  systemTempDirectory: string,
): string {
  const value = resolveEnvString(configured ?? join(systemTempDirectory, 'symphony_workspaces'), env)
  const expanded = value.startsWith('~/')
    ? join(homeDirectory, value.slice(2))
    : value === '~'
      ? homeDirectory
      : value
  const absolute = isAbsolute(expanded) ? expanded : resolve(workflowDirectory, expanded)

  return normalize(absolute)
}

function resolveEnvString(value: string, env: Record<string, string | undefined>): string {
  if (!value.startsWith('$')) {
    return value
  }

  const variable = value.slice(1)

  if (!/^[A-Z_]\w*$/i.test(variable)) {
    return value
  }

  return env[variable] ?? ''
}

function loadEnvironment(workflowDirectory: string): Record<string, string | undefined> {
  return {
    ...readDotEnv(workflowDirectory),
    ...process.env,
  }
}

function readDotEnv(workflowDirectory: string): Record<string, string> {
  const path = join(workflowDirectory, '.env')

  if (!existsSync(path)) {
    return {}
  }

  const output: Record<string, string> = {}
  const source = readFileSync(path, 'utf8')

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue
    }

    const separator = trimmed.indexOf('=')

    if (separator <= 0) {
      continue
    }

    const key = trimmed.slice(0, separator).trim()
    const rawValue = trimmed.slice(separator + 1).trim()
    output[key] = stripEnvQuotes(rawValue)
  }

  return output
}

function stripEnvQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith('\'') && value.endsWith('\''))
  ) {
    return value.slice(1, -1)
  }

  return value
}
