import type { PlatformError } from 'effect'
import type { ConfigError, WorkflowLoadError, WorkflowParseError } from '../domain/errors.js'
import type { ServiceConfig } from '../domain/types.js'
import { Context, Effect, FileSystem, Layer, Ref, Stream } from 'effect'
import { ConfigResolver } from '../config/resolve.js'
import { WorkflowWatchError } from '../domain/errors.js'
import { WorkflowLoader } from './loader.js'

export type WorkflowRuntimeError = ConfigError | WorkflowLoadError | WorkflowParseError

export interface WorkflowReloadResult {
  readonly applied: boolean
  readonly config: ServiceConfig
  readonly error: string | null
}

interface WorkflowRuntimeSnapshot {
  readonly config: ServiceConfig
  readonly lastReloadError: string | null
}

export interface WorkflowRuntimeShape {
  readonly getSnapshot: Effect.Effect<WorkflowRuntimeSnapshot>
  readonly getConfig: Effect.Effect<ServiceConfig>
  readonly reload: Effect.Effect<WorkflowReloadResult>
  readonly watch: (
    onReload?: (result: WorkflowReloadResult) => Effect.Effect<unknown>,
  ) => Effect.Effect<void, WorkflowWatchError>
}

export class WorkflowRuntime extends Context.Service<WorkflowRuntime, WorkflowRuntimeShape>()(
  'symphony/WorkflowRuntime',
) {}

const makeWorkflowRuntime = Effect.fn('WorkflowRuntime.make')(function* (
  workflowPath: string | undefined,
): Effect.fn.Return<WorkflowRuntimeShape, WorkflowRuntimeError, WorkflowLoader | ConfigResolver | FileSystem.FileSystem> {
  const loader = yield* WorkflowLoader
  const resolver = yield* ConfigResolver
  const fs = yield* FileSystem.FileSystem
  const initialWorkflow = yield* loader.load(workflowPath)
  const initialConfig = yield* resolver.resolve(initialWorkflow)
  yield* resolver.validateDispatch(initialConfig)
  const ref = yield* Ref.make<WorkflowRuntimeSnapshot>({
    config: initialConfig,
    lastReloadError: null,
  })

  const reloadWorkflow = Effect.fn('WorkflowRuntime.reload')(function* () {
    const current = yield* Ref.get(ref)
    const result = yield* loader.load(current.config.workflowPath).pipe(
      Effect.flatMap(workflow => resolver.resolve(workflow)),
      Effect.flatMap(config =>
        resolver.validateDispatch(config).pipe(
          Effect.as(config),
        ),
      ),
      Effect.matchEffect({
        onFailure: (error) => {
          const reason = describeWorkflowRuntimeError(error)
          const result = {
            applied: false,
            config: current.config,
            error: reason,
          } satisfies WorkflowReloadResult

          return Ref.update(ref, snapshot => ({
            ...snapshot,
            lastReloadError: reason,
          })).pipe(Effect.as(result))
        },
        onSuccess: (config) => {
          const result = {
            applied: true,
            config,
            error: null,
          } satisfies WorkflowReloadResult

          return Ref.set(ref, {
            config,
            lastReloadError: null,
          }).pipe(Effect.as(result))
        },
      }),
    )

    return result
  })
  const watchWorkflow = Effect.fn('WorkflowRuntime.watch')(function* (
    onReload?: (result: WorkflowReloadResult) => Effect.Effect<unknown>,
  ) {
    return yield* fs.watch(initialConfig.workflowPath).pipe(
      Stream.runForEach(() =>
        reloadWorkflow().pipe(
          Effect.flatMap(result => onReload?.(result) ?? Effect.void),
        )),
      Effect.mapError(cause => workflowWatchError(initialConfig.workflowPath, cause)),
    )
  })

  return {
    getSnapshot: Ref.get(ref),
    getConfig: Ref.get(ref).pipe(Effect.map(snapshot => snapshot.config)),
    reload: reloadWorkflow(),
    watch: watchWorkflow,
  }
})

export function WorkflowRuntimeLive(workflowPath: string | undefined): Layer.Layer<
  WorkflowRuntime,
  WorkflowRuntimeError,
  WorkflowLoader | ConfigResolver | FileSystem.FileSystem
> {
  return Layer.effect(WorkflowRuntime)(makeWorkflowRuntime(workflowPath))
}

function workflowWatchError(path: string, cause: PlatformError.PlatformError): WorkflowWatchError {
  return new WorkflowWatchError({
    code: 'workflow_watch_error',
    path,
    reason: 'workflow file watch failed',
    cause,
  })
}

function describeWorkflowRuntimeError(error: WorkflowRuntimeError): string {
  if ('code' in error && 'reason' in error) {
    return `${error.code}: ${error.reason}`
  }

  return String(error)
}
