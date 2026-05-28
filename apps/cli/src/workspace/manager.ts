import type { PlatformError } from 'effect'
import type * as Scope from 'effect/Scope'
import type { HookConfig, Workspace, WorkspaceConfig } from '../domain/types.js'
import { Buffer } from 'node:buffer'
import { isAbsolute, join, normalize, relative, resolve } from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Context, Effect, FileSystem, Layer, Stream } from 'effect'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'
import { WorkspaceError } from '../domain/errors.js'

export interface HookRunResult {
  readonly hook: WorkspaceHookName
  readonly exitCode: number | null
  readonly timedOut: boolean
  readonly stdout: string
  readonly stderr: string
}

export type WorkspaceHookName = 'after_create' | 'before_run' | 'after_run' | 'before_remove'

export interface WorkspaceBestEffortFailure {
  readonly operation: 'after_run' | 'before_remove' | 'check_workspace_exists' | 'remove_workspace' | 'resolve_workspace_path'
  readonly issueIdentifier?: string
  readonly workspacePath: string
  readonly error: WorkspaceError
}

export type WorkspaceBestEffortFailureHandler = (
  failure: WorkspaceBestEffortFailure,
) => Effect.Effect<unknown>

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
    onFailure?: WorkspaceBestEffortFailureHandler,
  ) => Effect.Effect<HookRunResult | null>
  readonly removeForIssueBestEffort: (
    issueIdentifier: string,
    workspace: WorkspaceConfig,
    hooks: HookConfig,
    onFailure?: WorkspaceBestEffortFailureHandler,
  ) => Effect.Effect<void>
  readonly assertContained: (
    root: string,
    candidate: string,
  ) => Effect.Effect<string, WorkspaceError>
}

export class WorkspaceManager extends Context.Service<WorkspaceManager, WorkspaceManagerShape>()(
  'symphony/WorkspaceManager',
) {}

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

export const assertContained = Effect.fn('assertContained')((root: string, candidate: string): Effect.Effect<string, WorkspaceError> => {
  const normalizedCandidate = normalize(resolve(candidate))

  if (!isPathInside(root, normalizedCandidate)) {
    return Effect.fail(new WorkspaceError({
      code: 'workspace_path_outside_root',
      path: normalizedCandidate,
      reason: `workspace path is outside root ${normalize(resolve(root))}`,
    }))
  }

  return Effect.succeed(normalizedCandidate)
})

const ensureDirectory = Effect.fn('ensureDirectory')(function* (
  path: string,
): Effect.fn.Return<boolean, WorkspaceError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem
  const existing = yield* fs.stat(path).pipe(
    Effect.catchTag('PlatformError', recoverMissingWorkspaceDirectory(path)),
  )

  if (existing !== null) {
    if (existing.type !== 'Directory') {
      return yield* new WorkspaceError({
        code: 'workspace_existing_non_directory',
        path,
        reason: 'workspace path exists but is not a directory',
      })
    }

    return false
  }

  yield* fs.makeDirectory(path, { recursive: true }).pipe(
    Effect.mapError(cause => workspacePlatformError(cause, {
      code: 'workspace_create_failed',
      path,
      reason: 'failed to create workspace directory',
    })),
  )

  return true
})

const createForIssueWithFileSystem = Effect.fn('createForIssue.fileSystem')(function* (
  issueIdentifier: string,
  workspace: WorkspaceConfig,
  hooks: HookConfig,
): Effect.fn.Return<Workspace, WorkspaceError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem
  const workspaceKey = sanitizeWorkspaceKey(issueIdentifier)
  const workspacePath = yield* assertContained(workspace.root, workspacePathFor(workspace.root, issueIdentifier))
  const rootPath = yield* assertContained(workspace.root, workspace.root)

  yield* fs.makeDirectory(rootPath, { recursive: true }).pipe(
    Effect.mapError(cause => workspacePlatformError(cause, {
      path: rootPath,
      code: 'workspace_create_failed',
      reason: 'failed to create workspace root',
    })),
  )

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

export const createForIssue = Effect.fn('createForIssue')(
  (
    issueIdentifier: string,
    workspace: WorkspaceConfig,
    hooks: HookConfig,
  ): Effect.Effect<Workspace, WorkspaceError> =>
    createForIssueWithFileSystem(issueIdentifier, workspace, hooks).pipe(
      Effect.provide(NodeServices.layer),
    ),
)

export const runBeforeRun = Effect.fn('runBeforeRun')(
  (
    workspacePath: string,
    hooks: HookConfig,
  ): Effect.Effect<HookRunResult | null, WorkspaceError> => {
    if (hooks.beforeRun === null) {
      return Effect.succeed(null)
    }

    return runHook('before_run', hooks.beforeRun, workspacePath, hooks.timeoutMs)
  },
)

const notifyBestEffortFailure = Effect.fn('WorkspaceManager.notifyBestEffortFailure')((
  onFailure: WorkspaceBestEffortFailureHandler | undefined,
  failure: WorkspaceBestEffortFailure,
): Effect.Effect<void> =>
  onFailure === undefined
    ? Effect.void
    : onFailure(failure).pipe(Effect.as(undefined)))

export const runAfterRunBestEffort = Effect.fn('runAfterRunBestEffort')(
  (
    workspacePath: string,
    hooks: HookConfig,
    onFailure?: WorkspaceBestEffortFailureHandler,
  ): Effect.Effect<HookRunResult | null> => {
    if (hooks.afterRun === null) {
      return Effect.succeed(null)
    }

    return runHook('after_run', hooks.afterRun, workspacePath, hooks.timeoutMs).pipe(
      Effect.catch(error =>
        notifyBestEffortFailure(onFailure, {
          operation: 'after_run',
          workspacePath,
          error,
        }).pipe(Effect.as(null))),
    )
  },
)

const pathExists = Effect.fn('pathExists')(function* (
  path: string,
): Effect.fn.Return<boolean, PlatformError.PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem

  return yield* fs.exists(path)
})

const removeForIssueBestEffortWithFileSystem = Effect.fn('removeForIssueBestEffort.fileSystem')(function* (
  issueIdentifier: string,
  workspace: WorkspaceConfig,
  hooks: HookConfig,
  onFailure?: WorkspaceBestEffortFailureHandler,
): Effect.fn.Return<void, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem
  const candidatePath = workspacePathFor(workspace.root, issueIdentifier)
  const workspacePath = yield* assertContained(workspace.root, candidatePath).pipe(
    Effect.catch(error =>
      notifyBestEffortFailure(onFailure, {
        operation: 'resolve_workspace_path',
        issueIdentifier,
        workspacePath: candidatePath,
        error,
      }).pipe(Effect.as(null))),
  )

  if (workspacePath === null) {
    return
  }

  const exists = yield* pathExists(workspacePath).pipe(
    Effect.catch(cause =>
      notifyBestEffortFailure(onFailure, {
        operation: 'check_workspace_exists',
        issueIdentifier,
        workspacePath,
        error: workspacePlatformError(cause, {
          code: 'workspace_remove_failed',
          path: workspacePath,
          reason: 'failed to inspect workspace directory before removal',
        }),
      }).pipe(Effect.as(false))),
  )

  if (!exists) {
    return
  }

  if (hooks.beforeRemove !== null) {
    yield* runHook('before_remove', hooks.beforeRemove, workspacePath, hooks.timeoutMs).pipe(
      Effect.catch(error =>
        notifyBestEffortFailure(onFailure, {
          operation: 'before_remove',
          issueIdentifier,
          workspacePath,
          error,
        }).pipe(Effect.as(null))),
    )
  }

  yield* fs.remove(workspacePath, { recursive: true, force: true }).pipe(
    Effect.catch(cause =>
      notifyBestEffortFailure(onFailure, {
        operation: 'remove_workspace',
        issueIdentifier,
        workspacePath,
        error: workspacePlatformError(cause, {
          code: 'workspace_remove_failed',
          path: workspacePath,
          reason: 'failed to remove workspace directory',
        }),
      })),
  )
})

export const removeForIssueBestEffort = Effect.fn('removeForIssueBestEffort')(
  (
    issueIdentifier: string,
    workspace: WorkspaceConfig,
    hooks: HookConfig,
    onFailure?: WorkspaceBestEffortFailureHandler,
  ): Effect.Effect<void> =>
    removeForIssueBestEffortWithFileSystem(issueIdentifier, workspace, hooks, onFailure).pipe(
      Effect.provide(NodeServices.layer),
    ),
)

const runHookProcessScoped = Effect.fn('runHookProcess.scoped')(function* (
  hook: WorkspaceHookName,
  script: string,
  cwd: string,
): Effect.fn.Return<
  HookRunResult,
  WorkspaceError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const command = ChildProcess.make('bash', ['-lc', script], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    killSignal: 'SIGTERM',
    forceKillAfter: '1 second',
  })
  const handle = yield* spawner.spawn(command).pipe(
    Effect.mapError(cause => new WorkspaceError({
      code: 'hook_failed',
      path: cwd,
      hook,
      reason: 'workspace hook process failed to start',
      cause,
    })),
  )
  const output = yield* Effect.all({
    stdout: collectBoundedOutput(handle.stdout, hook, cwd),
    stderr: collectBoundedOutput(handle.stderr, hook, cwd),
    exitCode: handle.exitCode.pipe(
      Effect.mapError(cause => new WorkspaceError({
        code: 'hook_failed',
        path: cwd,
        hook,
        reason: 'workspace hook process failed to complete',
        cause,
      })),
    ),
  }, { concurrency: 'unbounded' })

  return {
    hook,
    exitCode: Number(output.exitCode),
    timedOut: false,
    stdout: output.stdout,
    stderr: output.stderr,
  }
})

const runHookWithEffectProcess = Effect.fn('runHookWithEffectProcess')(function* (
  hook: WorkspaceHookName,
  script: string,
  cwd: string,
): Effect.fn.Return<HookRunResult, WorkspaceError, ChildProcessSpawner.ChildProcessSpawner> {
  const result = yield* runHookProcessScoped(hook, script, cwd).pipe(Effect.scoped)

  if (result.exitCode === 0) {
    return result
  }

  return yield* new WorkspaceError({
    code: 'hook_failed',
    path: cwd,
    hook,
    reason: `workspace hook exited with code ${result.exitCode}`,
  })
})

export function runHook(
  hook: WorkspaceHookName,
  script: string,
  cwd: string,
  timeoutMs: number,
): Effect.Effect<HookRunResult, WorkspaceError> {
  return runHookWithEffectProcess(hook, script, cwd).pipe(
    Effect.timeoutOrElse({
      duration: timeoutMs,
      orElse: () => Effect.fail(new WorkspaceError({
        code: 'hook_timeout',
        path: cwd,
        hook,
        reason: `workspace hook timed out after ${timeoutMs}ms`,
      })),
    }),
    Effect.provide(NodeServices.layer),
  )
}

function collectBoundedOutput(
  stream: Stream.Stream<Uint8Array, unknown>,
  hook: WorkspaceHookName,
  path: string,
): Effect.Effect<string, WorkspaceError> {
  return stream.pipe(
    Stream.runFold(
      () => Buffer.alloc(0) as Buffer<ArrayBufferLike>,
      (buffer, chunk) => appendBounded(buffer, Buffer.from(chunk)),
    ),
    Effect.map(buffer => buffer.toString('utf8')),
    Effect.mapError(cause => new WorkspaceError({
      code: 'hook_failed',
      path,
      hook,
      reason: 'workspace hook output could not be read',
      cause,
    })),
  )
}

function appendBounded(buffer: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> {
  const remaining = MAX_HOOK_OUTPUT_BYTES - buffer.byteLength

  if (remaining <= 0) {
    return buffer
  }

  return Buffer.concat([buffer, chunk.subarray(0, remaining)])
}

function recoverMissingWorkspaceDirectory(path: string) {
  return (cause: PlatformError.PlatformError): Effect.Effect<FileSystem.File.Info | null, WorkspaceError> =>
    cause.reason._tag === 'NotFound'
      ? Effect.succeed(null)
      : Effect.fail(workspacePlatformError(cause, {
          code: 'workspace_create_failed',
          path,
          reason: 'failed to inspect workspace directory',
        }))
}

function workspacePlatformError(
  cause: PlatformError.PlatformError,
  options: {
    readonly path: string
    readonly code: 'workspace_create_failed' | 'workspace_remove_failed'
    readonly reason: string
  },
): WorkspaceError {
  return new WorkspaceError({
    code: options.code,
    path: options.path,
    reason: options.reason,
    cause,
  })
}

export const WorkspaceManagerLive = Layer.succeed(WorkspaceManager)({
  createForIssue: Effect.fn('WorkspaceManager.createForIssue')(function* (issueIdentifier: string, workspace: WorkspaceConfig, hooks: HookConfig) {
    return yield* createForIssue(issueIdentifier, workspace, hooks)
  }),
  runBeforeRun: Effect.fn('WorkspaceManager.runBeforeRun')(function* (workspacePath: string, hooks: HookConfig) {
    return yield* runBeforeRun(workspacePath, hooks)
  }),
  runAfterRunBestEffort: Effect.fn('WorkspaceManager.runAfterRunBestEffort')(function* (
    workspacePath: string,
    hooks: HookConfig,
    onFailure?: WorkspaceBestEffortFailureHandler,
  ) {
    return yield* runAfterRunBestEffort(workspacePath, hooks, onFailure)
  }),
  removeForIssueBestEffort: Effect.fn('WorkspaceManager.removeForIssueBestEffort')(function* (
    issueIdentifier: string,
    workspace: WorkspaceConfig,
    hooks: HookConfig,
    onFailure?: WorkspaceBestEffortFailureHandler,
  ) {
    yield* removeForIssueBestEffort(issueIdentifier, workspace, hooks, onFailure)
  }),
  assertContained: Effect.fn('WorkspaceManager.assertContained')(function* (root: string, candidate: string) {
    return yield* assertContained(root, candidate)
  }),
})

function separatorForRelativePath(path: string): string {
  return path.includes('\\') ? '\\' : '/'
}
