# Testing Harness

Use `@effect/vitest` for Effect-aware tests. The project pins
`@effect/vitest@4.0.0-beta.66` to the same v4 beta baseline as `effect` and
`@effect/platform-node`.

The upstream package exposes Vitest's normal `describe`, `it`, `expect`, and
`assert` APIs and extends `it` with Effect-native helpers. Import tests from
`@effect/vitest` instead of `vitest` so a file can mix ordinary Vitest tests with
Effect-native tests.

```ts
import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"

describe("worker timeout", () => {
  it.effect("advances virtual time", () =>
    Effect.gen(function*() {
      const fiber = yield* Effect.forkChild(
        Effect.sleep("1 minute").pipe(Effect.as("done" as const))
      )

      yield* TestClock.adjust("1 minute")

      const value = yield* Fiber.join(fiber)
      expect(value).toBe("done")
    }))
})
```

## Defaults

- Use `it.effect` for new tests whose setup, action, and assertions can live in
  an `Effect`. It provides the Effect test environment, including `TestClock`
  and `TestConsole`, and runs the test effect in a scope.
- Use `it.live` when the test must use live runtime services or real time.
- Use `layer(...)` or `it.layer(...)` for shared fake services instead of
  manually rebuilding the same layer in each assertion-heavy test.
- Keep `Effect.exit` inside `it.effect` when the test needs to assert a typed
  failure rather than throw a test exception.

## Promise Bridges

Do not add a shared local `runEffect` wrapper for ordinary tests. Module tests
should run under `it.effect` or `it.live`, with setup, action, and assertions in
the same test Effect.

Avoid direct `Effect.runPromise` calls in test files. Introduce a Promise bridge
only when an external test API requires a Promise or callback boundary; keep the
bridge file-local where possible and document why `it.effect` / `it.live` cannot
own the flow.

When asserting typed failures, stay inside the test Effect and use
`Effect.flip(...)`, `Effect.exit(...)`, or explicit error channel assertions
instead of converting the failure into an untyped thrown exception.

## Scoped Test Workspaces

Temporary filesystem fixtures should use Effect platform services. Prefer
`apps/cli/tests/support/fakes/workspace.ts` and its `withFakeWorkspace(...)`
helper, which uses `FileSystem.makeTempDirectoryScoped(...)` so cleanup is tied
to the test scope.

Do not create test workspaces with `node:fs/promises` plus
`Effect.promise(...)`. If a test must use a third-party Promise fixture, keep
that bridge local to the test and record why the Effect `FileSystem` service is
not a fit.

## Migrating Existing Tests

When a test already asserts mostly Effect behavior, move the whole setup, action,
and assertion flow into `it.effect` instead of wrapping one operation with
an external Promise bridge.

- Build local fake service layers inside the `Effect.gen` block when each test
  needs its own request log or response queue.
- Provide fake layers with `Effect.provide(...)` at the tested boundary, keeping
  assertions next to the yielded result.
- Use `Effect.flip(...)` or `Effect.exit(...)` inside the test effect when the
  assertion is about a typed failure.
- Keep ordinary `it(...)` only for pure synchronous normalization or formatting
  tests that do not run an Effect program.

Current module-level migration examples:

- `apps/cli/src/tracker/linear.test.ts`: service tests run under `it.effect`,
  use a fake `LinearTransport` layer for GraphQL pagination and error cases,
  and use a fake `HttpClient` service to assert the live transport request
  shape without the custom Promise bridge.
- `apps/cli/src/client-tools/linear-graphql.test.ts`: client-tool tests run
  under `it.effect`, provide a fake `LinearTransport` layer at the tool
  boundary, and use Schema JSON encoding for JSON-shaped assertions that must
  stay aligned with runtime JSON boundary practice.
- `apps/cli/src/prompt/render.test.ts`: pure renderer tests run under
  `it.effect`, yielding successful render results directly and using
  `Effect.flip(...)` inside the test effect for typed failure assertions.
- `apps/cli/src/workflow/loader.test.ts`: workflow parsing and FileSystem-backed
  loading tests run under `it.effect`; temporary workspace cleanup uses the
  scoped `withFakeWorkspace(...)` helper and file setup uses the Effect
  `FileSystem` service with `NodeServices.layer`.
- `apps/cli/src/workflow/runtime.test.ts`: reload and watch tests use Effect
  `FileSystem` setup; reload tests run under `it.effect`, and the live watch
  test keeps `it.live` for real filesystem watch timing.
- `apps/cli/src/config/resolve.test.ts`: config schema, environment expansion,
  dispatch validation, and `.env` loading tests run under `it.effect`; the
  `.env` case uses `withFakeWorkspace(...)` plus the Effect `FileSystem`
  service for setup.
- `apps/cli/src/agent-runner/runner.test.ts`: runner tests run under
  `it.effect`, provide fake Codex/tracker layers at the runner boundary, and
  use Effect `FileSystem` for workspace setup and after-run assertions.
- `apps/cli/src/agent-runner/codex.test.ts`: protocol-script tests run under
  `it.effect` with fake Linear layers; the live child-process bridge test uses
  `it.live` plus scoped `withFakeWorkspace(...)` for temporary workspace
  lifetime.
- `apps/cli/src/orchestrator/state.test.ts`: pure state rules stay ordinary
  synchronous tests, while Ref-backed service behavior runs under `it.effect`
  without the Promise bridge.
- `apps/cli/src/workspace/manager.test.ts`: filesystem-only behavior uses
  `it.effect`; tests that execute real shell hooks use `it.live` so Effect
  timeouts run on live time instead of the test clock.
- `apps/cli/src/orchestrator/runtime.test.ts`: fake-layer orchestration flows
  run under `it.effect`, with dependencies provided at the specific program
  boundary being exercised.

## Source Evidence

- `repos/effect/ai-docs/src/09_testing/10_effect-tests.ts`
- `repos/effect/packages/vitest/src/index.ts`
- `repos/effect/packages/vitest/src/internal/internal.ts`
