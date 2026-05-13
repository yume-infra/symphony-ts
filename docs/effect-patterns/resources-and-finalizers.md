# Resources And Finalizers

Any runtime capability that opens a file watcher, subprocess, timer, socket,
temporary directory, queue worker, or log sink must have an Effect-managed
lifecycle.

## Scoped Resources

Use `Effect.acquireRelease` for resources with a clear open/close pair:

```ts
const openWorkspace = (path: string) =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: () => createWorkspace(path),
      catch: (cause) => new WorkspaceOpenError({ path, cause }),
    }),
    (workspace) =>
      Effect.promise(() => workspace.close()).pipe(
        Effect.catchAllCause((cause) =>
          Effect.logWarning("workspace close failed").pipe(
            Effect.annotateLogs({ path, cause: String(cause) }),
          ),
        ),
      ),
    ),
  )
```

Expose long-lived resources through scoped layers:

```ts
export const WorkspaceLive = Layer.scoped(
  Workspace,
  openWorkspace(defaultWorkspacePath),
)
```

`Layer.scoped` means the finalizer runs when the layer scope closes, including
on interruption.

## Finalizers Inside Workflows

Use `Effect.addFinalizer` or `Scope.addFinalizer` when a resource is created
inside a larger scoped effect and needs cleanup even if a later step fails:

```ts
const runWorker = Effect.gen(function*() {
  const process = yield* launchCodexProcess
  yield* Effect.addFinalizer(() => process.interrupt)

  return yield* process.wait
})
```

Use finalizers for cleanup. Do not bury cleanup in `catchAll` branches that only
run on expected failures.

## Scoped Fibers

Use `Effect.forkScoped` for background fibers whose lifetime must match the
current scope:

```ts
const layer = Layer.scopedDiscard(
  pollLinear.pipe(Effect.forever, Effect.forkScoped),
)
```

Detached fibers are only acceptable when the caller receives and owns the
`Fiber` handle and has an explicit cancellation path.

## Resource Rules

- Use `NodeRuntime.runMain` for long-lived programs so process interruption
  closes scopes.
- Every subprocess has a finalizer that interrupts or kills it.
- Every watcher, queue, or socket has a finalizer that shuts it down.
- Release actions should not fail the runtime with noisy cleanup defects unless
  that failure is operationally critical.
- Add stable identifiers to cleanup logs: workflow id, task id, workspace path,
  process id, or integration name.

## References

- Official docs: <https://effect.website/docs/resource-management/introduction/>
- Official docs: <https://effect.website/docs/resource-management/scope/>
- Pinned source: `repos/effect/packages/effect/src/Effect.ts`
- Pinned source: `repos/effect/packages/platform-node-shared/src/NodeSocketServer.ts`
