# Services And Layers

Use Effect services and layers for runtime capabilities such as workflow
loading, config, tracker clients, workspace management, Codex process control,
orchestration, and observability.

## Default Shape

Prefer explicit service tags and layer values. This keeps dependencies visible
in the `Effect` requirements channel and avoids passing large context objects
through unrelated call chains.

```ts
import { Context, Effect, Layer } from "effect"

export class WorkflowLoader extends Context.Tag("symphony/WorkflowLoader")<
  WorkflowLoader,
  {
    readonly load: (
      path: string,
    ) => Effect.Effect<WorkflowDefinition, WorkflowLoadError>
  }
>() {}

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

## `Effect.Service`

The pinned Effect source includes `Effect.Service` as an experimental helper
that builds a tag and layer together. Its source docs mark it experimental. Use
plain `Context.Tag` plus `Layer` as the project default until a specific module
benefits enough from generated accessors or default dependency wiring to justify
`Effect.Service`.

If `Effect.Service` is used, verify it with `rtk pnpm typecheck` and keep the
service declaration local and boring:

```ts
class Logger extends Effect.Service<Logger>()("symphony/Logger", {
  accessors: true,
  sync: () => ({
    info: (message: string) => Effect.logInfo(message),
  }),
}) {}
```

## Testing

Fakes should be layers that satisfy the same service tag:

```ts
export const WorkflowLoaderTest = (definition: WorkflowDefinition) =>
  Layer.succeed(WorkflowLoader, {
    load: () => Effect.succeed(definition),
  })
```

Avoid mocking internals. Tests should provide alternate layers at the boundary
that owns the dependency.

## References

- Official docs: <https://effect.website/docs/requirements-management/services/>
- Official docs: <https://effect.website/docs/requirements-management/layers/>
- Pinned source: `reference/effect/source/packages/effect/src/Context.ts`
- Pinned source: `reference/effect/source/packages/effect/src/Layer.ts`
- Pinned source: `reference/effect/source/packages/effect/test/Effect/service.test.ts`
