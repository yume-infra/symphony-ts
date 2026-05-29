# Implementation Plan

## Research

- [x] Record an Elixir implementation pass focused on supervisor, monitor, terminal cleanup, and retry
      token behavior.
- [x] Record an external/Effect pass focused on `FiberMap`, `Fiber.await`, scoped interruption, and
      supervision patterns relevant to this design.
- [x] Synthesize both passes into a unified implementation/refactor plan.

## First Fix

- [x] Add focused regression tests for terminal refresh racing stale timeout in the same tick and
      remaining pending past `stallTimeoutMs`.
- [x] Reorder reconciliation so refreshed terminal/non-active state is applied before stale detection
      when tracker refresh succeeds.
- [x] Ensure terminal-removed or terminal-closing attempts cannot be scheduled for stale retry.
- [x] Run targeted orchestrator tests and package typecheck.

## Owner Token

- [x] Add an `AttemptOwner` type for issue id, issue identifier, attempt, attempt id, workspace path,
      and start timestamp.
- [x] Change worker event, exit, evidence, cleanup, and retry transition APIs to carry owner or owner
      key rather than loose `issueId` plus optional `attemptId`.
- [x] Keep currentness checks in `OrchestratorState`; do not introduce a second scheduling registry.
- [x] Ensure snapshots do not expose operational fiber handles or internal owner metadata.

## Lifecycle-Only Supervisor

- [x] Add a `WorkerSupervisor` service around scoped keyed worker fibers.
- [x] Prefer `FiberMap` unless implementation diagnostics show it is unsuitable in the current Effect
      beta.
- [x] Move worker start, watcher, interrupt, and shutdown mechanics behind the supervisor.
- [x] Allow supervisor to retain owner-scoped operational buffers/interruption intent, but not
      scheduling state.
- [x] Keep dispatch eligibility, reconciliation, and retry decisions in orchestrator runtime/state.

## Attempt Completion

- [x] Extract an `AttemptCompletionService` that receives `AttemptOwner`, full `Exit`, interruption
      intent, Codex events, and workspace failures.
- [x] Write run evidence before simplified exit classification.
- [x] Preserve evidence-first cleanup: cleanup only after evidence success; cleanup hold on evidence
      failure.
- [x] Remove finalizer reads from orchestrator state such as `currentWorkerCancellation`; pass intent
      explicitly through owner-scoped completion input.
- [x] Ensure stale attempt completion can write its own evidence but cannot mutate current state or
      clean up a newer workspace.

## Retry Fencing

- [x] Add retry tokens to retry entries.
- [x] Change due retry handling to atomically pop only matching tokens from state.
- [x] Add stale token tests.

## Strict Ownership Hardening

- [x] Move terminal cleanup permission into one-shot, owner-keyed cleanup authorizations held by
      `OrchestratorState`.
- [x] Require stale terminal completions to consume cleanup authorization before evidence can mark
      cleanup as planned or remove a workspace.
- [x] Revoke stale cleanup authorizations when a new owner claims the same issue.
- [x] Keep refreshed/stalled reconciliation inside a single `Ref.modify` state transition so runtime
      reconciliation cannot write back an old full-state snapshot.
- [x] Reschedule consumed due retries when dispatch loses ownership before worker start.
- [x] Provide `WorkerSupervisorLive` and `AttemptCompletionServiceLive` from `AppLive`, not only from
      the CLI process wrapper.

## Verification

- [x] Run targeted unit tests for orchestrator state/runtime, run evidence, cleanup hold, and codex
      process interruption.
- [x] Run `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`.
- [x] Run `rtk proxy pnpm verify` before commit unless a documented external issue blocks it.

## Lead Notes

- Production forked attempts now flow through `WorkerSupervisor`; inline launch remains a test seam.
- Terminal/non-active reconciliation pre-applies scheduling transitions and sends an owner-scoped
  interruption intent. Completion writes evidence afterward and only cleans up when a current owner
  or consumed owner-scoped cleanup authorization authorizes cleanup.
- Retry entries are token-fenced and consumed with a `Ref.modify` token match; a dispatch ownership
  loss reconstitutes the consumed retry instead of dropping it.
