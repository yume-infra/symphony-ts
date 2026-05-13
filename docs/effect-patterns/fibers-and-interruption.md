# Fibers And Interruption

Symphony is a long-running orchestrator. Use fibers for concurrent work, but
make cancellation explicit and scoped.

## Forking Rules

Use bounded concurrency for batch work:

```ts
const refreshAll = (workflows: ReadonlyArray<WorkflowId>) =>
  Effect.forEach(
    workflows,
    (workflowId) => refreshWorkflow(workflowId),
    { concurrency: 4 },
  )
```

Use `Effect.forkScoped` for background work tied to a layer or request scope:

```ts
const startPoller = pollOnce.pipe(
  Effect.repeat(pollSchedule),
  Effect.forkScoped,
)
```

Use `Effect.fork` only when the owner stores the returned fiber and owns its
interruption:

```ts
const withWorker = Effect.gen(function*() {
  const fiber = yield* workerLoop.pipe(Effect.fork)
  yield* Effect.addFinalizer(() => Fiber.interrupt(fiber))
  return fiber
})
```

## Worker Cancellation

Worker loops should have a single shutdown path:

```ts
const workerLoop = Effect.gen(function*() {
  const queue = yield* WorkQueue

  while (true) {
    const item = yield* queue.take
    yield* processItem(item).pipe(
      Effect.timeoutFail({
        duration: "5 minutes",
        onTimeout: () => new WorkerTimeoutError({ itemId: item.id }),
      }),
    )
  }
})
```

The queue, subprocess, and workspace layers must provide finalizers so an
interrupt can stop the loop without leaking external work.

## Interruption Rules

- Prefer interruptible code. Do not wrap large orchestration flows in
  `Effect.uninterruptible`.
- Use `Effect.uninterruptibleMask` only around small critical sections that
  must not be cancelled halfway through.
- Race and timeout APIs interrupt the loser. Make the losing branch safe to
  interrupt.
- Use finalizers for subprocess and workspace cleanup instead of relying on
  best-effort process exit.
- Preserve useful failure information when joining fibers; do not collapse all
  exits into strings.

## References

- Official docs: <https://effect.website/docs/concurrency/fibers/>
- Official docs: <https://effect.website/docs/concurrency/basic-concurrency/>
- Official docs: <https://effect.website/docs/error-management/timing-out/>
- Pinned source: `reference/effect/source/packages/effect/test/Effect/interruption.test.ts`
- Pinned source: `reference/effect/source/packages/effect/src/Fiber.ts`
