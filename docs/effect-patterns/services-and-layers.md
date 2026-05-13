# Services And Layers

Use Effect services and layers for runtime capabilities such as workflow
loading, config, tracker clients, workspace management, Codex process control,
orchestration, and observability.

## Default Shape

Prefer explicit service tags and layer values. This keeps dependencies visible
in the `Effect` requirements channel and avoids passing large context objects
through unrelated call chains.

```ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export class WorkflowLoader extends Context.Service<
  WorkflowLoader,
  {
    readonly load: (
      path: string,
    ) => Effect.Effect<WorkflowDefinition, WorkflowLoadError>
  }
>()("symphony/WorkflowLoader") {}

export const WorkflowLoaderLive = Layer.effect(
  WorkflowLoader,
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem

    return {
      load: (path) =>
        fileSystem.readFileString(path).pipe(
          Effect.mapError((cause) => new WorkflowLoadError({ path, cause })),
          Effect.flatMap(parseWorkflow),
        ),
    }
  }),
)
```

Consumers ask for the service at the point of use:

```ts
export const loadInitialWorkflow = (path: string) =>
  Effect.gen(function*() {
    const loader = yield* WorkflowLoader
    return yield* loader.load(path)
  })
```

## Layer Rules

- Export service tags from the module that owns the capability contract.
- Export `Live`, `Test`, and narrow helper layers as values, not as hidden
  constructors inside command handlers.
- Compose dependencies at the application boundary with `Effect.provide` or
  layer composition.
- Keep CLI parsing thin. Runtime dependencies belong in layers.
- Use `Layer.scoped` when a service owns a resource lifecycle.
- Use `Layer.effect` when building the service needs Effect dependencies but no
  finalizer.
- Use `Layer.succeed` for pure implementations and fakes.

## Service Helpers

The active Effect v4 beta source uses `Context.Service` for service keys. Use
plain `Context.Service` plus `Layer` as the project default until a specific
module benefits enough from generated accessors or default dependency wiring to
justify a higher-level helper.

If a higher-level helper is used, verify it with `rtk pnpm typecheck` and keep
the service declaration local and boring:

```ts
class Logger extends Context.Service<Logger, {
  readonly info: (message: string) => Effect.Effect<void>
}>()("symphony/Logger") {}

const LoggerLive = Layer.succeed(Logger)({
    info: (message: string) => Effect.logInfo(message),
})
```

## Testing

Fakes should be layers that satisfy the same service tag:

```ts
export const WorkflowLoaderTest = (definition: WorkflowDefinition) =>
  Layer.succeed(WorkflowLoader)({
    load: () => Effect.succeed(definition),
  })
```

Avoid mocking internals. Tests should provide alternate layers at the boundary
that owns the dependency.

## References

- Official docs: <https://effect.website/docs/requirements-management/services/>
- Official docs: <https://effect.website/docs/requirements-management/layers/>
- Pinned source: `repos/effect/packages/effect/src/Context.ts`
- Pinned source: `repos/effect/packages/effect/src/Layer.ts`
- Pinned source: `repos/effect/packages/effect/test/Layer.test.ts`
