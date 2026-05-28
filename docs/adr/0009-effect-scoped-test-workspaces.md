# ADR 0009: Effect Scoped Test Workspaces

## Status

Accepted.

## Context

After migrating module tests to `@effect/vitest`, several tests still created
temporary workspaces through a Promise helper backed by `node:fs/promises`.
That kept setup outside the Effect platform service model and required
`Effect.promise` bridges inside otherwise Effect-native tests.

The vendored Effect platform source exposes `FileSystem.makeTempDirectoryScoped`,
which creates a temporary directory and registers cleanup with the active Effect
scope. `@effect/vitest` runs Effect tests in a scope, and `it.live` can provide
live runtime behavior while still keeping fixture lifetime in Effect.

## Decision

Test workspace fixtures use `FileSystem.makeTempDirectoryScoped(...)` through
`apps/cli/tests/support/fakes/workspace.ts`.

Tests that need a temporary workspace should use `withFakeWorkspace(...)` and
provide `NodeServices.layer` at the test boundary. Direct `node:fs/promises`
temporary directory setup is not the default pattern.

## Consequences

- Temporary workspace cleanup is tied to Effect scope finalization.
- Effect-native tests no longer need `Effect.promise` wrappers for workspace
  setup or cleanup.
- External Promise-based fixtures remain possible as local exceptions, but must
  document why the Effect `FileSystem` service is not a fit.

## Evidence

- `repos/effect/packages/effect/src/FileSystem.ts`
- `repos/effect/packages/platform-node-shared/src/NodeFileSystem.ts`
- `repos/effect/packages/platform-node-shared/test/NodeFileSystem.test.ts`
- `apps/cli/tests/support/fakes/workspace.ts`
