# ADR 0005: Effect Platform FileSystem Boundaries

## Status

Accepted.

## Context

After the process bridge pass, runtime source still used direct Node filesystem
APIs for workflow reads, `.env` reads, workspace directory creation, directory
type checks, existence checks, workspace removal, and workflow file watching.

The pinned Effect v4 beta source provides `FileSystem.FileSystem` plus
`@effect/platform-node/NodeServices`. The FileSystem abstraction returns typed
`PlatformError` values, includes `readFileString`, `makeDirectory`, `stat`,
`exists`, `remove`, and `watch`, and composes with layers and streams.

## Decision

Runtime filesystem side effects should use `FileSystem.FileSystem` and map
`PlatformError.PlatformError` into the project's tagged domain errors.

The first migrated boundaries are:

- workflow file reading in `WorkflowLoader`;
- workflow file watching in `WorkflowRuntime`;
- `.env` loading in `ConfigResolver`;
- workspace root creation, workspace directory stat/create, existence checks,
  and best-effort removal in `WorkspaceManager`.

Public helpers that previously returned no-requirement effects keep that shape
by providing `NodeServices.layer` at the helper boundary. This keeps existing
tests and callers stable while replacing direct Node I/O internally.

Pure path manipulation remains on `node:path` because it is deterministic string
logic and does not need runtime services.

## Consequences

- Filesystem failures now preserve platform causes under the corresponding
  domain error.
- The `.env` path is covered by an explicit behavior test and no longer uses
  synchronous `existsSync` / `readFileSync` inside an Effect boundary.
- Workspace directory checks use `FileSystem.stat` and inspect
  `FileSystem.File.Info.type` instead of Node `Stats`.
- Workflow watching uses `FileSystem.watch` and maps stream failures to
  `WorkflowWatchError` for app-level structured logging.
- Some standalone helpers still provide `NodeServices.layer` internally for
  compatibility. A future service-layer pass may close over platform services
  at layer construction time instead.

## Evidence

- `repos/effect/packages/effect/src/FileSystem.ts`
- `repos/effect/packages/platform-node/src/NodeServices.ts`
- `repos/effect/packages/platform-node-shared/src/NodeFileSystem.ts`
- `apps/cli/src/workflow/loader.ts`
- `apps/cli/src/workflow/runtime.ts`
- `apps/cli/src/config/resolve.ts`
- `apps/cli/src/workspace/manager.ts`
