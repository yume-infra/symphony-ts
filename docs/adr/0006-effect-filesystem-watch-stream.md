# ADR 0006: Effect FileSystem Watch Streams

## Status

Accepted.

## Context

`WorkflowRuntime.watch` previously used `node:fs.watch` through
`Effect.callback`, captured an Effect context, and called `Effect.runPromiseWith`
inside the Node callback. That bridge had a finalizer, but it still mixed
callback ownership, nested Effect execution, and untyped watcher errors.

The pinned Effect v4 beta `FileSystem.FileSystem` service exposes `watch` as a
`Stream<WatchEvent, PlatformError>`. The platform implementation owns the Node
watcher through `Stream.callback` and closes it through scoped acquisition.

## Decision

Workflow watching uses `FileSystem.watch(...).pipe(Stream.runForEach(...))`.

`WorkflowRuntimeLive` closes over `FileSystem.FileSystem` at layer construction
time, so `WorkflowRuntime.watch` remains a no-requirement service method. Watch
stream failures are mapped to `WorkflowWatchError`.

The app runtime forks the watcher as a child fiber and logs
`workflow_watch_failed` if the stream fails. Reload validation failures still
produce normal `workflow_reload_rejected` warnings through the existing callback.

The watch callback returns `Effect<unknown>` because watcher consumers ignore the
callback's success value. This avoids forcing callers to discard useful helper
results just to satisfy `Effect<void>`.

## Consequences

- The workflow watcher no longer imports `node:fs` or calls
  `Effect.runPromiseWith` inside an event callback.
- Watcher setup and teardown are delegated to the Effect Stream scope.
- Watch failures are visible to operators through structured runtime logging.
- Test coverage now exercises a real file update through `FileSystem.watch`.

## Evidence

- `repos/effect/packages/effect/src/FileSystem.ts`
- `repos/effect/packages/platform-node-shared/src/NodeFileSystem.ts`
- `repos/effect/packages/effect/src/Stream.ts`
- `apps/cli/src/workflow/runtime.ts`
- `apps/cli/src/workflow/runtime.test.ts`
- `apps/cli/src/app.ts`
