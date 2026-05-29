# Unified Implementation Plan

Date: 2026-05-29

## Summary

Use Elixir's responsibility boundary as the architectural model and Effect's `FiberMap` / `Fiber.await`
as the implementation substrate, while preserving Symphony TS's evidence-first cleanup invariant.

The unified design is:

- `WorkerSupervisor` owns worker fibers and interruption only.
- `OrchestratorState` owns scheduling state and transition decisions only.
- `AttemptCompletionService` owns evidence-first completion side effects.
- `AttemptOwner` is the fencing token passed through every event and side effect.

Do not make cleanup-hold a scheduling primitive. Cleanup-hold is durable operator evidence that a
workspace was intentionally preserved after evidence failure. Scheduling suppression should come from
state transitions and owner fencing.

## Core Semantics

### 1. Attempt owner is the cross-boundary token

Introduce an immutable owner for each worker attempt:

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

Every operational path carries this owner:

- Codex runtime event;
- workspace best-effort failure;
- worker exit;
- interruption request;
- evidence write;
- cleanup command;
- retry state transition.

The owner is a fence, not a second state store. Currentness is still decided by `OrchestratorState`.

### 2. WorkerSupervisor is lifecycle-only

Create a lifecycle service around a scoped keyed fiber table:

```ts
interface WorkerSupervisorShape {
  readonly start: (input: StartWorkerInput) => Effect.Effect<AttemptOwner, PollTickError>
  readonly interrupt: (owner: AttemptOwner, intent: WorkerInterruptionIntent) => Effect.Effect<void>
  readonly shutdownAll: Effect.Effect<void>
}
```

Implementation direction:

- use `FiberMap<attemptId, AgentRunResult, WorkerRunError>` or a key derived from
  `issueId + attemptId`;
- start worker effects under the supervisor scope;
- attach a watcher with `Fiber.await(workerFiber)`;
- emit `WorkerExitObserved { owner, exit, intent, buffers }`;
- remove/interrupt by owner key on reconciliation commands;
- never schedule retry, mark completion, write evidence, or cleanup a workspace.

The supervisor may keep operational metadata such as buffers and interruption intent for a specific
owner. That metadata is not scheduling state.

### 3. OrchestratorState remains the scheduling authority

State owns:

- `running`;
- `claimed`;
- `retryAttempts`;
- `completed`;
- attempt-id matching;
- retry token matching;
- terminal/non-active/stale transition policy.

State should not expose raw `Fiber` handles in public snapshots. As the supervisor lands, remove raw
worker fibers from `RuntimeRunningIssue` and keep only owner/attempt metadata needed for state
transitions.

### 4. AttemptCompletionService is evidence-first

Completion receives:

```ts
interface AttemptCompletionInput {
  readonly owner: AttemptOwner
  readonly workerExit: Exit.Exit<AgentRunResult, WorkerRunError>
  readonly interruptionIntent: WorkerInterruptionIntent | null
  readonly codexEvents: ReadonlyArray<CodexRuntimeEvent>
  readonly workspaceFailures: ReadonlyArray<WorkspaceBestEffortFailure>
}
```

Completion sequence:

1. build evidence input from owner, exit, events, failures, and cleanup plan;
2. write evidence with the full `Exit`;
3. if evidence fails and cleanup was intended, write cleanup-hold and do not remove workspace;
4. if evidence succeeds and cleanup was intended, run cleanup;
5. classify the exit into simplified state transition reasons only after evidence has seen full
   `Exit`;
6. apply state transition only if the owner is still current or if the transition was already
   pre-applied by reconciliation.

Stale attempts may write their own evidence, but must not mutate current state or clean up a newer
workspace.

## Reconciliation Model

Use a deterministic priority model for each tick:

1. refresh running issue states from tracker;
2. apply terminal/non-active transitions for refreshed issues;
3. run stale detection on the remaining running issues;
4. execute interruption commands produced by the state transitions.

If tracker refresh fails, stale detection can still run as a fallback on the existing state, but it
must skip attempts already removed or marked closing by a higher-priority transition.

### Terminal

Terminal refresh should apply the scheduling transition immediately:

- remove running;
- release claim;
- mark completed if that remains the local convention;
- emit `InterruptAttempt(owner, { cause: "terminal_refresh", cleanup: true })`.

The worker may still be alive operationally until interruption finalizers complete, but it is no
longer a scheduling candidate. When the watcher later observes exit, completion writes evidence and
then either removes the workspace or writes cleanup-hold.

This avoids keeping terminal-closing attempts in `running`, which is what makes stale retry races
possible.

### Non-active

Non-active refresh should remove running/release claim and interrupt the worker without scheduling
retry. Since non-active is not the terminal cleanup path, completion may write evidence for the
stale attempt but must not remove the workspace unless a later policy explicitly requests it.

### Stale

Stale detection applies only to attempts still running after terminal/non-active reconciliation:

- remove running;
- keep or set claim according to retry policy;
- schedule retry with a fresh retry token;
- interrupt the owner with `{ cause: "stalled", cleanup: false }`.

## Retry Token Fencing

Extend retry entries with a token:

```ts
export interface RetryEntry {
  readonly issueId: string
  readonly identifier: string
  readonly attempt: number
  readonly dueAtMs: number
  readonly retryToken: string
  readonly error: string | null
}
```

Generate a new token whenever scheduling retry. Due retry processing should use a `Ref.modify`
operation that atomically pops only if `issueId`, `retryToken`, and `dueAtMs <= nowMs` still match.

This mirrors Elixir's `make_ref` / `send_after` / `pop if token matches` pattern. The token does not
need to be durable unless a later task adds durable retry timers across process restart.

## Implementation Phases

### Phase 1: hotfix current race

- Add tests for terminal refresh racing stale timeout in the same tick and across the next tick.
- Reorder reconciliation to terminal/non-active before stale where refreshed tracker state is known.
- Ensure terminal-closing or terminal-removed attempts cannot be retried as stale.

### Phase 2: owner token and state API

- Add `AttemptOwner`.
- Change worker-related state APIs to accept owner or owner key instead of loose `issueId` plus
  optional `attemptId`.
- Keep `runningAttemptMatches` semantics, but make the fence explicit in names and tests.

### Phase 3: lifecycle-only supervisor

- Add `WorkerSupervisor` backed by `FiberMap`.
- Move worker start, attach, watcher, interrupt, and shutdown mechanics out of `runtime.ts`.
- Keep dispatch eligibility, reconciliation, and retry decisions in runtime/state.

### Phase 4: completion extraction

- Add `AttemptCompletionService`.
- Move evidence write, cleanup plan/result, cleanup-hold, and exit classification out of dispatch
  closure.
- Remove finalizer reads from orchestrator state such as `currentWorkerCancellation`; pass
  interruption intent through the owner-scoped lifecycle/completion path.

### Phase 5: retry token fencing

- Add `retryToken` to retry entries.
- Replace snapshot-then-release retry consumption with atomic token-matching pop.
- Add stale token tests.

## Tests

- terminal + stale same tick: terminal wins, no retry;
- terminal interruption still pending after `stallTimeoutMs`: no retry;
- terminal evidence failure: cleanup-hold written, workspace preserved, no retry;
- non-active interruption: no retry unless policy says otherwise;
- stale retry: retry token created and owner interrupted;
- stale retry token mismatch: old due retry ignored;
- old worker exit after newer attempt starts: evidence allowed, state unchanged;
- old Codex event after newer attempt starts: current state unchanged;
- supervisor scope close: worker fibers interrupted;
- worker start/attach failure: worker fiber interrupted and state not advanced;
- mixed cause failure/interruption: evidence receives full `Exit`.

## Resolved Design Questions

- Fencing should happen both at event ingress and at completion transition. Ingress filtering keeps
  live state clean; completion fencing protects against late exits and races.
- Retry tokens can be in-memory for this task. Durable retry recovery is out of scope.
- Cleanup-hold is not enough as a scheduling marker. Use state transitions/owner fencing for
  scheduling and cleanup-hold for workspace preservation evidence.
