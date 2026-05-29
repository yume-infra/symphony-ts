# Conversation Synthesis

Date: 2026-05-29

## Current Direction

Adopt Elixir-style ownership boundaries, but keep the TypeScript run-evidence-first cleanup contract.

The supervisor should own worker lifecycle only. It should not write evidence, schedule retry, mark
issues completed, or remove workspaces. Those decisions belong to orchestrator state transitions and
explicit completion commands.

## Decisions So Far

- Use an immutable attempt owner as the fencing token for all events and side effects.
- Keep `OrchestratorState` as the only scheduling state authority.
- Use full Effect `Exit` / `Cause` for evidence before simplified state transition reasons.
- Treat terminal refresh as higher priority than non-active and stale reconciliation.
- Preserve workspaces on evidence write failure.
- Add retry token fencing so old retry messages cannot consume newer retry state.

## Effect Findings

- `FiberMap` is the closest Effect primitive to a keyed supervisor children table.
- `Fiber.await` is the closest primitive to monitor-style exit observation.
- `Scope` and scoped forks provide service shutdown and interruption cleanup.
- `FiberSet` is useful for anonymous child concurrency, not as the primary keyed worker table.
- `FiberHandle` is single-slot and not suitable for multiple issue workers.
- Detached fibers do not fit owned worker attempts.

## Elixir Findings

- `Task.Supervisor` starts and terminates workers but does not decide scheduling policy.
- `Process.monitor` and `:DOWN` route worker exit back to orchestrator state.
- Terminal and non-active reconciliation remove running/claim state in orchestrator logic.
- Worker-owned cleanup lives in `try/after`.
- Retry tokens use reference fencing.

## Current Known Risk

The current TypeScript diff can allow a terminal-canceling attempt to be seen as stale if worker
interruption/evidence finalization takes longer than `stallTimeoutMs`. Stale retry must skip
terminal-closing attempts, and reconciliation should classify each running issue by priority in a
single pass.

## Product Divergence From Elixir

Elixir cleanup is best-effort and not evidence-gated. Symphony TS must preserve the workspace when
evidence writing fails. This is intentional and should be documented in code/tests where it affects
the flow.
