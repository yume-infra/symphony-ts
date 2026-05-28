import type { PlatformError } from 'effect'
import type { ServiceConfig, WorkflowDefinition } from '../domain/types.js'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, normalize, resolve } from 'node:path'
import process from 'node:process'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Context, Effect, FileSystem, Layer, Schema } from 'effect'
import { ConfigError } from '../domain/errors.js'
import { normalizeStateName } from '../domain/types.js'

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

const DEFAULT_ACTIVE_STATES = ['Todo', 'In Progress'] as const
const DEFAULT_TERMINAL_STATES = ['Closed', 'Cancelled', 'Canceled', 'Duplicate', 'Done'] as const
const PositiveInteger = Schema.Int.check(Schema.isGreaterThan(0))
const RawWorkflowConfig = Schema.Struct({
  tracker: Schema.optionalKey(Schema.Struct({
    kind: Schema.optionalKey(Schema.String),
    endpoint: Schema.optionalKey(Schema.String),
    api_key: Schema.optionalKey(Schema.String),
    project_slug: Schema.optionalKey(Schema.String),
    active_states: Schema.optionalKey(Schema.Array(Schema.String)),
    terminal_states: Schema.optionalKey(Schema.Array(Schema.String)),
  })),
  polling: Schema.optionalKey(Schema.Struct({
    interval_ms: Schema.optionalKey(PositiveInteger),
  })),
  workspace: Schema.optionalKey(Schema.Struct({
    root: Schema.optionalKey(Schema.String),
  })),
  hooks: Schema.optionalKey(Schema.Struct({
    after_create: Schema.optionalKey(Schema.String),
    before_run: Schema.optionalKey(Schema.String),
    after_run: Schema.optionalKey(Schema.String),
    before_remove: Schema.optionalKey(Schema.String),
    timeout_ms: Schema.optionalKey(PositiveInteger),
  })),
  agent: Schema.optionalKey(Schema.Struct({
    max_concurrent_agents: Schema.optionalKey(PositiveInteger),
    max_turns: Schema.optionalKey(PositiveInteger),
    max_retry_backoff_ms: Schema.optionalKey(PositiveInteger),
    max_concurrent_agents_by_state: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  })),
  codex: Schema.optionalKey(Schema.Struct({
    command: Schema.optionalKey(Schema.String),
    approval_policy: Schema.optionalKey(Schema.Unknown),
    thread_sandbox: Schema.optionalKey(Schema.Unknown),
    turn_sandbox_policy: Schema.optionalKey(Schema.Unknown),
    turn_timeout_ms: Schema.optionalKey(PositiveInteger),
    read_timeout_ms: Schema.optionalKey(PositiveInteger),
    stall_timeout_ms: Schema.optionalKey(Schema.Int),
  })),
})
const decodeRawWorkflowConfig = Schema.decodeUnknownEffect(RawWorkflowConfig)

const invalidConfig = Effect.fn('invalidConfig')((config: ServiceConfig, field: string, reason: string): Effect.Effect<never, ConfigError> =>
  Effect.fail(new ConfigError({
    code: 'invalid_config_value',
    path: config.workflowPath,
    field,
    reason,
  })))

const validateConfigValues = Effect.fn('validateConfigValues')((config: ServiceConfig): Effect.Effect<void, ConfigError> => {
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
})

export const resolveServiceConfig = Effect.fn('resolveServiceConfig')(function* (
  workflow: WorkflowDefinition,
  options: ResolveConfigOptions = {},
): Effect.fn.Return<ServiceConfig, ConfigError> {
  const rawConfig = yield* decodeRawWorkflowConfig(workflow.config).pipe(
    Effect.mapError(cause => invalidRawConfig(workflow, cause)),
  )
  const env = options.env ?? (yield* loadEnvironment(workflow.directory, workflow.path))
  const tracker = rawConfig.tracker ?? {}
  const polling = rawConfig.polling ?? {}
  const workspace = rawConfig.workspace ?? {}
  const hooks = rawConfig.hooks ?? {}
  const agent = rawConfig.agent ?? {}
  const codex = rawConfig.codex ?? {}
  const trackerKind = tracker.kind ?? null
  const apiKey = resolveApiKey(tracker.api_key ?? null, trackerKind, env)
  const workspaceRoot = resolvePathValue(
    workspace.root ?? null,
    workflow.directory,
    env,
    options.homeDirectory ?? homedir(),
    options.systemTempDirectory ?? tmpdir(),
  )
  const config: ServiceConfig = {
    workflowPath: workflow.path,
    workflowDirectory: workflow.directory,
    promptTemplate: workflow.promptTemplate,
    tracker: {
      kind: trackerKind,
      endpoint: tracker.endpoint ?? 'https://api.linear.app/graphql',
      apiKey,
      projectSlug: tracker.project_slug ?? null,
      activeStates: stringArray(tracker.active_states, DEFAULT_ACTIVE_STATES),
      terminalStates: stringArray(tracker.terminal_states, DEFAULT_TERMINAL_STATES),
    },
    polling: {
      intervalMs: polling.interval_ms ?? 30000,
    },
    workspace: {
      root: workspaceRoot,
    },
    hooks: {
      afterCreate: hooks.after_create ?? null,
      beforeRun: hooks.before_run ?? null,
      afterRun: hooks.after_run ?? null,
      beforeRemove: hooks.before_remove ?? null,
      timeoutMs: hooks.timeout_ms ?? 60000,
    },
    agent: {
      maxConcurrentAgents: agent.max_concurrent_agents ?? 10,
      maxTurns: agent.max_turns ?? 20,
      maxRetryBackoffMs: agent.max_retry_backoff_ms ?? 300000,
      maxConcurrentAgentsByState: concurrencyByState(agent.max_concurrent_agents_by_state),
    },
    codex: {
      command: codex.command ?? 'codex app-server',
      approvalPolicy: codex.approval_policy,
      threadSandbox: codex.thread_sandbox,
      turnSandboxPolicy: codex.turn_sandbox_policy,
      turnTimeoutMs: codex.turn_timeout_ms ?? 3600000,
      readTimeoutMs: codex.read_timeout_ms ?? 5000,
      stallTimeoutMs: codex.stall_timeout_ms ?? 300000,
    },
  }

  yield* validateConfigValues(config)
  return config
})

export const validateDispatch = Effect.fn('validateDispatch')(function* (config: ServiceConfig): Effect.fn.Return<void, ConfigError> {
  if (config.tracker.kind === null || config.tracker.kind.trim() === '') {
    return yield* new ConfigError({
      code: 'missing_tracker_kind',
      path: config.workflowPath,
      field: 'tracker.kind',
      reason: 'tracker.kind is required for dispatch',
    })
  }

  if (normalizeStateName(config.tracker.kind) !== 'linear') {
    return yield* new ConfigError({
      code: 'unsupported_tracker_kind',
      path: config.workflowPath,
      field: 'tracker.kind',
      reason: `unsupported tracker kind: ${config.tracker.kind}`,
    })
  }

  if (config.tracker.apiKey === null || config.tracker.apiKey.trim() === '') {
    return yield* new ConfigError({
      code: 'missing_tracker_api_key',
      path: config.workflowPath,
      field: 'tracker.api_key',
      reason: 'tracker.api_key or LINEAR_API_KEY is required for Linear dispatch',
    })
  }

  if (config.tracker.projectSlug === null || config.tracker.projectSlug.trim() === '') {
    return yield* new ConfigError({
      code: 'missing_tracker_project_slug',
      path: config.workflowPath,
      field: 'tracker.project_slug',
      reason: 'tracker.project_slug is required for Linear dispatch',
    })
  }

  if (config.codex.command.trim() === '') {
    return yield* new ConfigError({
      code: 'missing_codex_command',
      path: config.workflowPath,
      field: 'codex.command',
      reason: 'codex.command must be non-empty',
    })
  }
})

export const ConfigResolverLive = Layer.succeed(ConfigResolver)({
  resolve: Effect.fn('ConfigResolver.resolve')((workflow: WorkflowDefinition, options?: ResolveConfigOptions) =>
    resolveServiceConfig(workflow, options)),
  validateDispatch: Effect.fn('ConfigResolver.validateDispatch')(function* (config: ServiceConfig) {
    yield* validateDispatch(config)
  }),
})

function stringArray(value: unknown, fallback: ReadonlyArray<string>): ReadonlyArray<string> {
  if (!Array.isArray(value)) {
    return [...fallback]
  }

  const strings = value.filter((item): item is string => typeof item === 'string')

  return strings.length > 0 ? strings : [...fallback]
}

function concurrencyByState(value: unknown): ReadonlyMap<string, number> {
  const output = new Map<string, number>()

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return output
  }

  for (const [state, limit] of Object.entries(value)) {
    if (Number.isInteger(limit) && (limit as number) > 0) {
      output.set(normalizeStateName(state), limit as number)
    }
  }

  return output
}

function invalidRawConfig(workflow: WorkflowDefinition, cause: unknown): ConfigError {
  return new ConfigError({
    code: 'invalid_config_value',
    path: workflow.path,
    field: 'workflow.config',
    reason: `workflow config failed schema validation: ${String(cause)}`,
    cause,
  })
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

const readDotEnv = Effect.fn('readDotEnv')(function* (
  workflowDirectory: string,
  workflowPath: string,
): Effect.fn.Return<Record<string, string>, ConfigError, FileSystem.FileSystem> {
  const path = join(workflowDirectory, '.env')
  const fs = yield* FileSystem.FileSystem
  const source = yield* fs.readFileString(path).pipe(
    Effect.catchTag('PlatformError', recoverMissingDotEnv(workflowPath, path)),
  )

  if (source === null) {
    return {}
  }

  return parseDotEnvSource(source)
})

function loadEnvironment(
  workflowDirectory: string,
  workflowPath: string,
): Effect.Effect<Record<string, string | undefined>, ConfigError> {
  return readDotEnv(workflowDirectory, workflowPath).pipe(
    Effect.map(dotEnv => ({
      ...dotEnv,
      ...process.env,
    })),
    Effect.provide(NodeServices.layer),
  )
}

function recoverMissingDotEnv(workflowPath: string, path: string) {
  return (cause: PlatformError.PlatformError): Effect.Effect<string | null, ConfigError> =>
    cause.reason._tag === 'NotFound'
      ? Effect.succeed(null)
      : Effect.fail(dotEnvReadError(workflowPath, path, cause))
}

function parseDotEnvSource(source: string): Record<string, string> {
  const output: Record<string, string> = {}

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

function dotEnvReadError(
  workflowPath: string,
  path: string,
  cause: PlatformError.PlatformError,
): ConfigError {
  return new ConfigError({
    code: 'invalid_config_value',
    path: workflowPath,
    field: '.env',
    reason: `.env file could not be read: ${path}`,
    cause,
  })
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
