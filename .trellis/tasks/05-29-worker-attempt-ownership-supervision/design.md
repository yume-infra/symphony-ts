# Design

## Problem

The run-evidence work exposed a responsibility leak: worker completion finalization currently sits
close to the code that starts and supervises worker fibers. That makes terminal refresh, evidence
writing, workspace cleanup, and retry policy easier to entangle.

The desired shape is closer to the Elixir implementation:

- lifecycle ownership is local and mechanical;
- scheduling state transitions are centralized;
- worker exits are monitored, not interpreted by the supervisor;
- cleanup policy is explicit and fenced.

The TypeScript implementation must intentionally differ from Elixir in one place: workspace cleanup
is evidence-first. When evidence writing fails, the workspace must remain available for inspection.

## Reference Model

### Elixir Semantics

The Elixir implementation uses these boundaries:

- `Task.Supervisor` starts and terminates worker processes.
- `Process.monitor` turns process exit into `:DOWN`.
- The orchestrator `GenServer` stores `running`, `claimed`, and retry state.
- Reconciliation code handles terminal, non-active, and stale conditions.
- Worker-owned cleanup happens in `try/after`.
- Terminal workspace cleanup is orchestrator-owned.
- Retry timers carry `make_ref` tokens so stale timer messages cannot consume newer retry state.

### Effect Semantics

The pinned Effect v4 beta source suggests these equivalents:

- `FiberMap<K, A, E>` for keyed worker fiber ownership.
- `Fiber.await(fiber)` for monitor-style observation that returns full `Exit<A, E>`.
- `FiberMap.remove` or `Fiber.interrupt` for targeted interruption.
- `Scope`, `Effect.acquireRelease`, `Effect.addFinalizer`, and scoped forks for lifecycle cleanup.
- `Cause.hasInterruptsOnly` only after evidence has captured the full `Exit`.

`FiberSet` is not the primary worker table because it has no key. `FiberHandle` is single-slot and is
not suitable for multiple issue workers. Detached fibers are not appropriate for owned attempts.

## Proposed Components

### AttemptOwner

`AttemptOwner` is the immutable fencing token for one worker attempt:

```ts
export interface AttemptOwner {
  readonly issueId: string
  readonly issueIdentifier: string
  readonly attempt: number | null
  readonly attemptId: string
  readonly workspacePath: string
  readonly startedAtMs: number
}
```

All operational events should carry this owner or its key:

- worker exit;
- Codex runtime event;
- workspace best-effort failure;
- evidence write;
- cleanup command;
- retry completion.

The owner is not a second state store. `OrchestratorState` remains the source of truth for whether an
attempt is current.

### WorkerSupervisor

`WorkerSupervisor` is lifecycle-only:

- create or receive an `AttemptOwner`;
- start the worker effect;
- store the worker fiber in a scoped `FiberMap`;
- start a watcher that performs `Fiber.await(workerFiber)`;
- publish or invoke a `WorkerExitObserved(owner, exit)` handler;
- interrupt an attempt by owner key;
- interrupt all children on service scope close.

It must not:

- call run evidence directly as a policy decision;
- schedule retry;
- mark an issue completed;
- remove workspaces;
- inspect tracker issue status.

### Orchestrator State

`OrchestratorState` remains the only scheduling authority:

- `running`;
- `claimed`;
- `retry`;
- `completed`;
- attempt id matching;
- retry math;
- terminal/non-active/stale reconciliation priority.

Runtime orchestration should update state first, then execute commands returned by that state
transition. Examples:

- interrupt worker;
- write evidence;
- cleanup workspace;
- write cleanup hold;
- schedule retry timer.

### AttemptCompletionService

`AttemptCompletionService` handles evidence-first side effects for an observed worker exit:

1. receive `AttemptOwner` and full `Exit<AgentRunResult, WorkerRunError>`;
2. build run-summary/protocol-events from the full exit and collected event buffers;
3. write evidence;
4. if evidence fails, write cleanup hold when cleanup would otherwise be required;
5. only after evidence succeeds, classify the exit for simplified state transition and cleanup
   execution.

This service may call state transition functions, but the transition must be fenced by
`AttemptOwner`. Stale attempts may write evidence for their own workspace, but must not mutate current
issue state or clean up a workspace owned by a newer attempt.

## Reconciliation Priority

Each reconciliation pass should classify a running issue with a single highest-priority action:

1. terminal refresh;
2. non-active refresh;
3. stale timeout;
4. active update/no-op.

Attempts already marked as terminal-closing must be skipped by stale retry logic. This prevents the
bug where terminal interruption takes longer than `stallTimeoutMs` and is then retried as stale.

## Retry Token Fencing

Retry entries should carry a token:

```ts
export interface RetryEntry {
  readonly issueId: string
  readonly attempt: number
  readonly dueAtMs: number
  readonly retryToken: string
  readonly error: RuntimeFailure
}
```

Due retry handling should pop atomically only when the token still matches. A stale timer or stale
snapshot must not consume a newer retry entry.

## Evidence-First Cleanup Divergence

Elixir terminal cleanup is best-effort and not evidence-gated. Symphony TS deliberately keeps a
different product invariant:

- if evidence write succeeds, cleanup may proceed according to orchestrator policy;
- if evidence write fails, preserve the workspace and record a cleanup hold;
- startup cleanup must respect cleanup holds unless a later task defines an explicit operator override.

This divergence should be called out in tests and code comments where the behavior would otherwise
look unlike Elixir.

## Test Matrix

- terminal and stale in the same tick: terminal wins and no retry is scheduled;
- terminal-closing attempt in a later tick: stale scanner still skips it;
- old worker exit after a newer attempt starts: evidence may be written, current state is untouched;
- old Codex late event after newer attempt starts: event is ignored by current buffers;
- mixed failure/interruption cause: evidence receives full `Exit`;
- evidence failure on terminal path: workspace remains, cleanup hold is written, no retry scheduled;
- retry token mismatch: stale due retry is ignored;
- supervisor shutdown: scoped worker fibers are interrupted;
- attach/start failure: worker fiber is interrupted and state is not advanced incorrectly.

## Open Questions

- Whether `WorkerSupervisor` should expose a queue/event sink or call an injected completion handler
  directly.
- Whether operational worker buffers should live inside `WorkerSupervisor` or a small attempt runtime
  service owned by the supervisor.
- Whether startup cleanup hold semantics need an operator command in a later task.
