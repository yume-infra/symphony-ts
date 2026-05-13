# State Tools

Use Effect state primitives for orchestrator state and worker coordination. Do
not store mutable module globals for runtime state.

## Ref

Use `Ref` for atomic in-memory state:

```ts
const makeOrchestratorState = Ref.make<OrchestratorSnapshot>({
  workflows: new Map(),
  workers: new Map(),
})

const markWorkerStarted = (workerId: WorkerId) =>
  OrchestratorState.pipe(
    Effect.flatMap((state) =>
      Ref.update(state, (snapshot) => ({
        ...snapshot,
        workers: new Map(snapshot.workers).set(workerId, "running"),
      })),
    ),
  )
```

Use `Ref.update` and `Ref.modify` instead of get-then-set pairs when concurrent
fibers can touch the same value.

## SynchronizedRef

Use `SynchronizedRef` when the state update itself needs to run an Effect, such
as reading metadata or writing a durable checkpoint while holding the update
logic together.

```ts
const state = yield* SynchronizedRef.make(initialState)

yield* SynchronizedRef.updateEffect(state, (current) =>
  validateTransition(current, event).pipe(
    Effect.map((next) => next.snapshot),
  ),
)
```

## Queue

Use `Queue` for worker handoff and back-pressure:

```ts
const queue = yield* Queue.bounded<WorkItem>(64)

const producer = discoverWork.pipe(
  Effect.flatMap((items) =>
    Effect.forEach(items, (item) => Queue.offer(queue, item)),
  ),
)

const consumer = Queue.take(queue).pipe(
  Effect.flatMap(processWorkItem),
  Effect.forever,
)
```

Prefer bounded queues for runtime paths that can receive untrusted or external
input. Unbounded queues require a comment explaining why back-pressure is not
needed.

## State Rules

- Keep persistent source of truth separate from in-memory coordination state.
- Put state services behind tags and layers.
- Use immutable snapshots for externally visible orchestrator state.
- Include stable ids in state transition logs.
- Do not expose raw mutable refs across module boundaries unless the module is
  explicitly a state service.

## References

- Official docs: <https://effect.website/docs/state-management/ref/>
- Official docs: <https://effect.website/docs/state-management/synchronizedref/>
- Official docs: <https://effect.website/docs/concurrency/queue/>
- Pinned source: `repos/effect/packages/effect/src/Ref.ts`
- Pinned source: `repos/effect/packages/effect/src/SynchronizedRef.ts`
- Pinned source: `repos/effect/packages/effect/src/Queue.ts`
