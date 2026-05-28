# Effect Patterns

## Pattern Docs Gate

Before main runtime implementation, generate or curate project-local pattern docs from the pinned
Effect monorepo reference and current official docs. These docs should be the first place future
agents look after `SPEC.md`; the vendored source is the fallback for API details and examples.

The active pattern index is `docs/effect-patterns/index.md`. The only vendored upstream source path
is `repos/effect/`, a read-only subtree of `Effect-TS/effect-smol` for Effect v4 beta.

Minimum pattern topics:

- services, tags, contexts, and layers
- scoped resources, acquire/release, and finalizers
- fibers, interruption, and worker cancellation
- schedules for polling, retry, backoff, and timeouts
- refs/queues or equivalent state tools for orchestrator state
- typed errors for config, tracker, workspace, hooks, Codex, and rendering boundaries
- schema-backed JSON and protocol boundaries
- `effect/unstable/cli` entrypoint shape, `NodeServices.layer`, and `NodeRuntime.runMain`
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

- Use `Effect.fn("name")` for exported functions returning `Effect` and for reusable service-method
  implementations. This follows the pinned upstream guide at
  `repos/effect/ai-docs/src/01_effect/01_basics/02_effect-fn.ts`.
- Use service-qualified names for service method implementations, for example
  `Effect.fn("AgentRunner.runAttempt")`.
- Keep zero-argument service properties as `Effect` values when the service contract expects an
  effect property; call the named helper at construction time instead of changing the public contract
  to a function.
- `Effect.fn` values are `const` bindings, so define them before first use or place the layer export
  after the implementation. Do not disable `ts/no-use-before-define` to force a conversion.
- Small internal helpers may remain plain functions when converting them would require noisy
  reordering. Record the exception in the audit matrix if the helper is exported or integration
  critical.
- Use `Effect.gen` for orchestration flows with multiple effectful steps. For single-step state
  updates or acquisition/use glue, prefer explicit `Effect.flatMap(...)` callbacks and
  `Effect.as(...)` over a local generator.
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

## Time

Runtime wall-clock reads should go through the Effect `Clock` service. Use
`Clock.currentTimeMillis` for protocol deadlines, runtime event timestamps, poll snapshots, retry
due times, and stall detection. Do not call `Date.now()` inside Effect runtime modules unless an
audit entry explains why the Effect clock cannot be used.

Use `Effect.sleep`, `Effect.timeoutFail`, or `Effect.timeoutOrElse` for sleeps and operation
deadlines. Tests should drive virtual time with `TestClock` when possible and use `it.live` only
for cases that intentionally depend on live time.

## Platform Services

Prefer Effect platform abstractions for filesystem, path, command, terminal, and logging work where
available. Direct Node APIs are acceptable only when the Effect platform surface is missing or would
add inappropriate complexity; document that choice locally.

Use `FileSystem.FileSystem` for runtime file reads, directory creation, stat checks, existence
checks, removal, and file watching. Map `PlatformError.PlatformError` into the local tagged domain
error at the boundary and preserve the platform error as `cause`.

Use `FileSystem.watch(...).pipe(Stream.runForEach(...))` for long-running file watchers. The owning
runtime should fork the watcher under a scope and log or otherwise surface stream failures with a
typed error.

Pure path string manipulation may keep using `node:path`; do not make simple normalization or
containment checks effectful just to route through a service.

Use `effect/unstable/process` (`ChildProcess.make`, `ChildProcessSpawner`) for bounded subprocesses
such as workspace hooks. Wrap spawned handles in `Effect.scoped` and typed timeouts instead of
manually managing timers and `child.kill` callbacks.

Interactive subprocess protocols should still use `ChildProcessSpawner` when they can be modeled as
Effect streams and queues. Feed stdin from `Stream.fromQueue`, parse stdout as a scoped stream, store
bounded stderr diagnostics in Effect state, and keep protocol state machines inside Effect rather
than callback listeners with nested `Effect.runPromise` calls.

Direct Node subprocess APIs may be used only with a finalizer, structured typed errors, and an
audit/ADR entry explaining why `ChildProcessSpawner` is not a fit.

## HTTP Boundaries

Use `effect/unstable/http` plus a platform implementation from
`@effect/platform-node/NodeHttpClient` for runtime HTTP clients. Direct global `fetch` is not a
runtime boundary pattern.

Live HTTP-backed services should close over `HttpClient.HttpClient` in a `Layer.effect`, while
application composition provides the concrete Node HTTP layer. Build requests with
`HttpClientRequest`, read responses with `HttpClientResponse`, and map HTTP/decode failures to local
tagged errors with the original error preserved as `cause`.

## Schema Boundaries

Use Effect Schema for runtime JSON boundaries. Known protocol shapes should define schemas and use
`Schema.fromJsonString(...)` with `Schema.decodeUnknownEffect` / `Schema.encodeUnknownEffect`.
Intentionally arbitrary JSON should use `Schema.UnknownFromJsonString`.

Map schema failures to domain errors at the integration boundary and preserve the schema failure as
`cause`. Plain `JSON.parse` / `JSON.stringify` in runtime source requires an audit entry explaining
why Schema is not a fit.

YAML front matter syntax is parsed by the `yaml` package, not by a custom project parser. Effect code
owns the surrounding boundary: FileSystem reads, typed `WorkflowParseError` mapping, and Schema
validation of known config sections after YAML decoding.

## Best-Effort Recovery

Do not silently collapse external failures to `null`, `[]`, or `void`. If a recovery path hides a
tracker, Codex, process, workflow, or workspace failure from the caller, it must either emit a
structured `RuntimeLogger` warning or expose a typed failure callback for the caller that owns the
operational context.

Warnings should include the operation name, stable entity counts or ids, `error_code`, and `reason`.
Avoid logging large payloads or secrets.

Low-level services should not grow logger dependencies just for cleanup. The workspace service uses
`WorkspaceBestEffortFailureHandler`; orchestrator code supplies handlers that log
`workspace_after_run_failed` and `workspace_cleanup_failed`.

## Testing Harness

Use `@effect/vitest` for tests. The dependency must stay pinned to the same v4 beta baseline as
`effect`; do not rely on the npm `latest` tag because the current latest line peers on Effect v3.

Test files should import Vitest APIs from `@effect/vitest`, not directly from `vitest`. Use
`it.effect` for Effect-native tests so the test environment supplies `TestClock` and `TestConsole`
and runs the test in a scope. Use `it.live` only when real runtime services or real time are
required.

Do not add a shared local `runEffect` helper for ordinary tests. A Promise bridge is acceptable only
when an external harness requires a Promise or callback boundary; keep it file-local where possible
and document why `it.effect` / `it.live` cannot own the flow.

Temporary workspace fixtures should use Effect `FileSystem.makeTempDirectoryScoped(...)`, usually
through `apps/cli/tests/support/fakes/workspace.ts`, instead of wrapping `node:fs/promises` with
`Effect.promise`.

## Reference Boundary

Vendored Effect source is read-only reference material. Application code must import from normal
package dependencies, not from `repos/effect/` or any generated reference tree.
