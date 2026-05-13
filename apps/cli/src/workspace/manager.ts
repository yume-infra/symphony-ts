import type { HookConfig, Workspace, WorkspaceConfig } from '../domain/types.js'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, rm, stat } from 'node:fs/promises'
import { isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { Context, Effect, Layer } from 'effect'
import { WorkspaceError } from '../domain/errors.js'

export interface HookRunResult {
  readonly hook: WorkspaceHookName
  readonly exitCode: number | null
  readonly timedOut: boolean
  readonly stdout: string
  readonly stderr: string
}

export type WorkspaceHookName = 'after_create' | 'before_run' | 'after_run' | 'before_remove'

export interface WorkspaceManagerShape {
  readonly createForIssue: (
    issueIdentifier: string,
    workspace: WorkspaceConfig,
    hooks: HookConfig,
  ) => Effect.Effect<Workspace, WorkspaceError>
  readonly runBeforeRun: (
    workspacePath: string,
    hooks: HookConfig,
  ) => Effect.Effect<HookRunResult | null, WorkspaceError>
  readonly runAfterRunBestEffort: (
    workspacePath: string,
    hooks: HookConfig,
  ) => Effect.Effect<HookRunResult | null>
  readonly removeForIssueBestEffort: (
    issueIdentifier: string,
    workspace: WorkspaceConfig,
    hooks: HookConfig,
  ) => Effect.Effect<void>
  readonly assertContained: (
    root: string,
    candidate: string,
  ) => Effect.Effect<string, WorkspaceError>
}

export class WorkspaceManager extends Context.Service<WorkspaceManager, WorkspaceManagerShape>()(
  'symphony/WorkspaceManager',
) {}

export const WorkspaceManagerLive = Layer.succeed(WorkspaceManager)({
  createForIssue,
  runBeforeRun,
  runAfterRunBestEffort,
  removeForIssueBestEffort,
  assertContained,
})

const MAX_HOOK_OUTPUT_BYTES = 8192

export function sanitizeWorkspaceKey(issueIdentifier: string): string {
  const sanitized = issueIdentifier.replace(/[^\w.-]/g, '_')

  return sanitized === '' ? '_' : sanitized
}

export function workspacePathFor(root: string, issueIdentifier: string): string {
  return normalize(join(normalize(root), sanitizeWorkspaceKey(issueIdentifier)))
}

export function isPathInside(root: string, candidate: string): boolean {
  const normalizedRoot = normalize(resolve(root))
  const normalizedCandidate = normalize(resolve(candidate))
  const pathRelativeToRoot = relative(normalizedRoot, normalizedCandidate)

  return pathRelativeToRoot === ''
    || (pathRelativeToRoot !== '..'
      && !pathRelativeToRoot.startsWith(`..${separatorForRelativePath(pathRelativeToRoot)}`)
      && !isAbsolute(pathRelativeToRoot))
}

export function assertContained(root: string, candidate: string): Effect.Effect<string, WorkspaceError> {
  const normalizedCandidate = normalize(resolve(candidate))

  if (!isPathInside(root, normalizedCandidate)) {
    return Effect.fail(new WorkspaceError({
      code: 'workspace_path_outside_root',
      path: normalizedCandidate,
      reason: `workspace path is outside root ${normalize(resolve(root))}`,
    }))
  }

  return Effect.succeed(normalizedCandidate)
}

export function createForIssue(
  issueIdentifier: string,
  workspace: WorkspaceConfig,
  hooks: HookConfig,
): Effect.Effect<Workspace, WorkspaceError> {
  return Effect.gen(function* () {
    const workspaceKey = sanitizeWorkspaceKey(issueIdentifier)
    const workspacePath = yield* assertContained(workspace.root, workspacePathFor(workspace.root, issueIdentifier))
    const rootPath = yield* assertContained(workspace.root, workspace.root)

    yield* tryPromise({
      path: rootPath,
      code: 'workspace_create_failed',
      reason: 'failed to create workspace root',
      try: () => mkdir(rootPath, { recursive: true }),
    })

    const createdNow = yield* ensureDirectory(workspacePath)

    if (createdNow && hooks.afterCreate !== null) {
      yield* runHook('after_create', hooks.afterCreate, workspacePath, hooks.timeoutMs)
    }

    return {
      path: workspacePath,
      workspaceKey,
      createdNow,
    }
  })
}

export function runBeforeRun(
  workspacePath: string,
  hooks: HookConfig,
): Effect.Effect<HookRunResult | null, WorkspaceError> {
  if (hooks.beforeRun === null) {
    return Effect.succeed(null)
  }

  return runHook('before_run', hooks.beforeRun, workspacePath, hooks.timeoutMs)
}

export function runAfterRunBestEffort(
  workspacePath: string,
  hooks: HookConfig,
): Effect.Effect<HookRunResult | null> {
  if (hooks.afterRun === null) {
    return Effect.succeed(null)
  }

  return runHook('after_run', hooks.afterRun, workspacePath, hooks.timeoutMs).pipe(
    Effect.catch(() => Effect.succeed(null)),
  )
}

export function removeForIssueBestEffort(
  issueIdentifier: string,
  workspace: WorkspaceConfig,
  hooks: HookConfig,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const workspacePath = yield* assertContained(workspace.root, workspacePathFor(workspace.root, issueIdentifier)).pipe(
      Effect.catch(() => Effect.succeed(null)),
    )

    if (workspacePath === null) {
      return
    }

    const exists = yield* pathExists(workspacePath)

    if (!exists) {
      return
    }

    if (hooks.beforeRemove !== null) {
      yield* runHook('before_remove', hooks.beforeRemove, workspacePath, hooks.timeoutMs).pipe(
        Effect.catch(() => Effect.succeed(null)),
      )
    }

    yield* Effect.promise(() => rm(workspacePath, { recursive: true, force: true }).catch(() => undefined))
  })
}

export function runHook(
  hook: WorkspaceHookName,
  script: string,
  cwd: string,
  timeoutMs: number,
): Effect.Effect<HookRunResult, WorkspaceError> {
  return Effect.callback<HookRunResult, WorkspaceError>((resume) => {
    const child = spawn('bash', ['-lc', script], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Array<Buffer> = []
    const stderr: Array<Buffer> = []
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) {
        return
      }

      settled = true
      child.kill('SIGTERM')
      resume(Effect.fail(new WorkspaceError({
        code: 'hook_timeout',
        path: cwd,
        hook,
        reason: `workspace hook timed out after ${timeoutMs}ms`,
      })))
    }, timeoutMs)

    child.stdout?.on('data', chunk => pushBounded(stdout, chunk))
    child.stderr?.on('data', chunk => pushBounded(stderr, chunk))
    child.on('error', (cause) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      resume(Effect.fail(new WorkspaceError({
        code: 'hook_failed',
        path: cwd,
        hook,
        reason: 'workspace hook process failed to start',
        cause,
      })))
    })
    child.on('close', (exitCode) => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)

      const result: HookRunResult = {
        hook,
        exitCode,
        timedOut: false,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }

      if (exitCode === 0) {
        resume(Effect.succeed(result))
        return
      }

      resume(Effect.fail(new WorkspaceError({
        code: 'hook_failed',
        path: cwd,
        hook,
        reason: `workspace hook exited with code ${exitCode}`,
      })))
    })

    return Effect.sync(() => {
      clearTimeout(timeout)

      if (!settled) {
        child.kill('SIGTERM')
      }
    })
  })
}

function ensureDirectory(path: string): Effect.Effect<boolean, WorkspaceError> {
  return Effect.tryPromise({
    try: async () => {
      try {
        const existing = await stat(path)

        if (!existing.isDirectory()) {
          throw new WorkspaceError({
            code: 'workspace_existing_non_directory',
            path,
            reason: 'workspace path exists but is not a directory',
          })
        }

        return false
      }
      catch (cause) {
        if (cause instanceof WorkspaceError) {
          throw cause
        }

        if (!isMissingFileError(cause)) {
          throw cause
        }

        await mkdir(path, { recursive: true })
        return true
      }
    },
    catch: cause => cause instanceof WorkspaceError
      ? cause
      : new WorkspaceError({
          code: 'workspace_create_failed',
          path,
          reason: 'failed to create workspace directory',
          cause,
        }),
  })
}

function pathExists(path: string): Effect.Effect<boolean> {
  return Effect.promise(() => access(path, constants.F_OK).then(() => true, () => false))
}

function tryPromise(options: {
  readonly path: string
  readonly code: 'workspace_create_failed' | 'workspace_remove_failed'
  readonly reason: string
  readonly try: () => Promise<unknown>
}): Effect.Effect<void, WorkspaceError> {
  return Effect.tryPromise({
    try: async () => {
      await options.try()
    },
    catch: cause => new WorkspaceError({
      code: options.code,
      path: options.path,
      reason: options.reason,
      cause,
    }),
  })
}

function pushBounded(chunks: Array<Buffer>, chunk: Buffer): void {
  if (Buffer.concat(chunks).byteLength >= MAX_HOOK_OUTPUT_BYTES) {
    return
  }

  chunks.push(chunk.subarray(0, MAX_HOOK_OUTPUT_BYTES))
}

function isMissingFileError(cause: unknown): boolean {
  return typeof cause === 'object'
    && cause !== null
    && 'code' in cause
    && cause.code === 'ENOENT'
}

function separatorForRelativePath(path: string): string {
  return path.includes('\\') ? '\\' : '/'
}
