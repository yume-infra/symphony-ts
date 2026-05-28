# Schedules And Time

Use `Schedule` for polling, retry, backoff, and recurring reconciliation. Do not
hand-roll `setInterval` or untracked promise retry loops in runtime modules.

## Retry

Transient integration failures should use a bounded retry policy with backoff:

```ts
const retryPolicy = Schedule.exponential("100 millis").pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(5)),
)

const fetchIssue = (id: LinearIssueId) =>
  linearClient.fetchIssue(id).pipe(
    Effect.retry(retryPolicy),
    Effect.timeoutFail({
      duration: "30 seconds",
      onTimeout: () => new TrackerTimeoutError({ issueId: id }),
    }),
  )
```

Use typed timeout errors so callers can decide whether to retry, reconcile, or
surface an operator-visible failure.

## Clock Reads

Runtime code that needs the current wall-clock time should use Effect's `Clock`
service:

```ts
import { Clock, Effect } from "effect"

const emitHeartbeat = Effect.gen(function*() {
  const nowMs = yield* Clock.currentTimeMillis

  return { event: "heartbeat", timestamp: nowMs }
})
```

Do not call `Date.now()` inside Effect runtime modules for protocol deadlines,
poll snapshots, emitted runtime events, retry due times, or stall detection.
Using `Clock.currentTimeMillis` keeps time under the Effect environment, which
lets `@effect/vitest` tests use `TestClock` for deterministic assertions and
keeps live-time requirements explicit through `it.live`.

## Polling

Polling loops should be scoped fibers:

```ts
const pollSchedule = Schedule.spaced("15 seconds")

const pollerLayer = Layer.scopedDiscard(
  pollOnce.pipe(
    Effect.repeat(pollSchedule),
    Effect.forkScoped,
  ),
)
```

Do not start polling from the CLI command handler. Provide a layer that owns the
poller lifecycle.

## Reconciliation

Reconciliation jobs should separate "when to run" from "what to run":

```ts
export const reconciliationSchedule = Schedule.spaced("1 minute")

export const reconcileForever = reconcileOnce.pipe(
  Effect.repeat(reconciliationSchedule),
)
```

This keeps schedules testable. In tests, provide shorter schedules or use Effect
test clock helpers instead of sleeping real time.

## Rules

- Use `Schedule.recurs` or another bound for retries that should terminate.
- Use `Schedule.spaced` for fixed polling intervals.
- Use `Schedule.exponential` plus jitter for external API retry.
- Use `Effect.timeoutFail` for operation-level deadlines with typed errors.
- Use `Clock.currentTimeMillis` for runtime wall-clock reads instead of
  `Date.now()`.
- Keep the schedule definition named and near the integration boundary.

## References

- Official docs: <https://effect.website/docs/scheduling/built-in-schedules/>
- Official docs: <https://effect.website/docs/error-management/retrying/>
- Official docs: <https://effect.website/docs/error-management/timing-out/>
- Pinned source: `repos/effect/packages/effect/src/Schedule.ts`
- Pinned source: `repos/effect/packages/effect/test/Effect.test.ts`
