import type { ConfigError, WorkflowLoadError, WorkflowParseError } from '../domain/errors.js'
import type { ServiceConfig } from '../domain/types.js'
import { watch } from 'node:fs'
import { Context, Effect, Layer, Ref } from 'effect'
import { ConfigResolver } from '../config/resolve.js'
import { WorkflowLoader } from './loader.js'

export type WorkflowRuntimeError = ConfigError | WorkflowLoadError | WorkflowParseError

interface WorkflowReloadResult {
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
    onReload?: (result: WorkflowReloadResult) => Effect.Effect<void>,
  ) => Effect.Effect<void>
}

export class WorkflowRuntime extends Context.Service<WorkflowRuntime, WorkflowRuntimeShape>()(
  'symphony/WorkflowRuntime',
) {}

export function WorkflowRuntimeLive(workflowPath: string | undefined): Layer.Layer<
  WorkflowRuntime,
  WorkflowRuntimeError,
  WorkflowLoader | ConfigResolver
> {
  return Layer.effect(WorkflowRuntime)(
    Effect.gen(function* () {
      const loader = yield* WorkflowLoader
      const resolver = yield* ConfigResolver
      const initialWorkflow = yield* loader.load(workflowPath)
      const initialConfig = yield* resolver.resolve(initialWorkflow)
      yield* resolver.validateDispatch(initialConfig)
      const ref = yield* Ref.make<WorkflowRuntimeSnapshot>({
        config: initialConfig,
        lastReloadError: null,
      })

      const reload = Effect.gen(function* () {
        const current = yield* Ref.get(ref)
        const result = yield* loader.load(current.config.workflowPath).pipe(
          Effect.flatMap(workflow => resolver.resolve(workflow)),
          Effect.flatMap(config =>
            resolver.validateDispatch(config).pipe(
              Effect.as(config),
            ),
          ),
          Effect.matchEffect({
            onFailure: error => Effect.gen(function* () {
              const reason = describeWorkflowRuntimeError(error)
              yield* Ref.update(ref, snapshot => ({
                ...snapshot,
                lastReloadError: reason,
              }))

              return {
                applied: false,
                config: current.config,
                error: reason,
              } satisfies WorkflowReloadResult
            }),
            onSuccess: config => Effect.gen(function* () {
              yield* Ref.set(ref, {
                config,
                lastReloadError: null,
              })

              return {
                applied: true,
                config,
                error: null,
              } satisfies WorkflowReloadResult
            }),
          }),
        )

        return result
      })

      return {
        getSnapshot: Ref.get(ref),
        getConfig: Ref.get(ref).pipe(Effect.map(snapshot => snapshot.config)),
        reload,
        watch: onReload =>
          Effect.callback<void>((resume) => {
            const watcher = watch(initialConfig.workflowPath, () => {
              Effect.runPromise(reload.pipe(
                Effect.flatMap(result => onReload?.(result) ?? Effect.void),
              )).catch(() => undefined)
            })

            resume(Effect.never)

            return Effect.sync(() => {
              watcher.close()
            })
          }),
      }
    }),
  )
}

function describeWorkflowRuntimeError(error: WorkflowRuntimeError): string {
  if ('code' in error && 'reason' in error) {
    return `${error.code}: ${error.reason}`
  }

  return String(error)
}
