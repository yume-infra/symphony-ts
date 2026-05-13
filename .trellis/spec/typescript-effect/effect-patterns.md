# Effect Patterns

## Pattern Docs Gate

Before main runtime implementation, generate or curate project-local pattern docs from the pinned
Effect monorepo reference and current official docs. These docs should be the first place future
agents look after `SPEC.md`; the vendored source is the fallback for API details and examples.

Minimum pattern topics:

- services, tags, contexts, and layers
- scoped resources, acquire/release, and finalizers
- fibers, interruption, and worker cancellation
- schedules for polling, retry, backoff, and timeouts
- refs/queues or equivalent state tools for orchestrator state
- typed errors for config, tracker, workspace, hooks, Codex, and rendering boundaries
- `@effect/cli` entrypoint shape and `NodeRuntime.runMain`
- `@effect/tsgo` diagnostics loop for agents

## Services And Layers

Use Effect services and layers for runtime capabilities:

- workflow loader
- config service
- tracker client
- workspace manager
- agent runner
- orchestrator
- logger/observability

Avoid passing large ad hoc context objects through function parameters. Use the Effect requirements
channel to express dependencies.

## Running Effects

Long-running Node programs should be run with `NodeRuntime.runMain`, not `Effect.runPromise`, so
interruptions and finalizers are handled correctly.

## Generators And Pipelines

- Use `Effect.gen` for orchestration flows with multiple effectful steps.
- Use `.pipe(...)` for concise transformations.
- Avoid tacit / point-free calls where explicit callbacks preserve inference and stack clarity.

Prefer:

```ts
effect.pipe(Effect.map((value) => transform(value)))
```

over:

```ts
effect.pipe(Effect.map(transform))
```

when overloads, optional parameters, or inference could be ambiguous.

## Concurrency

- Use fibers for concurrent worker runs.
- Use `Effect.forEach` with explicit concurrency options for bounded parallelism.
- Use `Schedule` for polling and retry loops.
- Use interruption-aware code for worker cancellation.

## Platform Services

Prefer `@effect/platform` abstractions for filesystem, path, command, terminal, and logging work
where available. Direct Node APIs are acceptable only when the Effect platform surface is missing or
would add inappropriate complexity; document that choice locally.

## Reference Boundary

Vendored Effect source is read-only reference material. Application code must import from normal
package dependencies, not from `repos/effect/` or any generated reference tree.
