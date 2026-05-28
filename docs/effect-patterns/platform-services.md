# Platform Services

Use Effect platform services for runtime I/O boundaries. In this project that
means `FileSystem.FileSystem`, `ChildProcessSpawner`, and the Node service layers
from `@effect/platform-node`.

Pure path string manipulation may stay on `node:path` when it does not perform
I/O and keeping it pure makes validation easier. File reads, writes, directory
creation, stat checks, removes, process execution, and watches should use Effect
services unless an audit entry explains why the platform abstraction is not a
fit.

## FileSystem

Prefer `FileSystem.FileSystem` over `node:fs` / `node:fs/promises` in runtime
source.

```ts
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Effect, FileSystem } from "effect"

const readConfigFile = (path: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readFileString(path)
  }).pipe(Effect.provide(NodeServices.layer))
```

At domain boundaries, map `PlatformError.PlatformError` into the local tagged
error type. Preserve the platform error as `cause`.

Use `FileSystem.exists` for best-effort existence checks. Use `FileSystem.stat`
when the code must distinguish a file from a directory or surface permission and
bad-resource errors.

Use `FileSystem.watch(...).pipe(Stream.runForEach(...))` for runtime file
watchers. Map stream failures into typed domain errors and let the owning
runtime log or restart the watcher rather than hiding stream failure inside a
callback.

## Node Layers

The CLI entrypoint provides `NodeServices.layer` once at the top-level runtime.
Small standalone exported helpers may also provide `NodeServices.layer` at their
boundary to preserve their current no-requirement API. That is a compatibility
choice, not a reason for new service methods to hide dependencies by default.

For new services, prefer one of these shapes:

- close over `FileSystem.FileSystem` / `ChildProcessSpawner` when constructing
  the live layer, so service methods keep a clean no-requirement contract;
- leave the service layer requiring platform services and provide
  `NodeServices.layer` at the application composition boundary.

## Test Fixtures

Filesystem-backed test fixtures should also prefer `FileSystem.FileSystem`.
Use `FileSystem.makeTempDirectoryScoped(...)` for temporary directories so
cleanup is attached to the test scope. The shared fake workspace helper at
`apps/cli/tests/support/fakes/workspace.ts` is the default shape for tests that
need a temporary workspace root.

## Current Exceptions

- `node:path` remains in config, workflow, and workspace path normalization
  because those helpers are pure string logic.
- Test fixtures may use direct Node filesystem APIs only when an external
  fixture API requires a Promise or callback boundary and the exception is kept
  local to that test.
- Workspace best-effort cleanup should report local cleanup failures through a
  caller-provided failure callback. The low-level workspace service stays free
  of `RuntimeLogger`; the orchestrator wires the callback to structured
  warnings with issue/workspace context.

## Source Evidence

- `repos/effect/packages/effect/src/FileSystem.ts`
- `repos/effect/packages/platform-node/src/NodeServices.ts`
- `repos/effect/packages/platform-node/src/NodeFileSystem.ts`
- `repos/effect/packages/platform-node-shared/src/NodeFileSystem.ts`
- `repos/effect/packages/effect/src/Stream.ts`
