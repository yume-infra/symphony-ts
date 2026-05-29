# Worker attempt ownership and supervision semantics

## Goal

Define and implement worker attempt ownership semantics that match the useful parts of the Elixir
Symphony runtime while preserving the TypeScript run-evidence product contract.

The runtime should separate lifecycle ownership from scheduling decisions:

- worker supervision owns fibers and interruption;
- the orchestrator/reducer owns running, claimed, retry, terminal, and cleanup decisions;
- attempt completion owns evidence-first side effects while preserving full `Exit` / `Cause`.

## Requirements

- Preserve the run-evidence contract introduced by the run summary task:
  - every worker attempt writes per-run evidence when possible;
  - evidence receives the full Effect `Exit` before lossy classification;
  - evidence write failure preserves the workspace and records a cleanup hold instead of removing
    the workspace.
- Re-establish Elixir-style ownership boundaries:
  - supervisor-equivalent code starts, tracks, interrupts, and shuts down worker fibers only;
  - supervisor-equivalent code must not decide retry, terminal cleanup, or issue completion;
  - worker completion must be observed as an event and routed through the orchestrator state machine.
- Use Effect-native primitives from installed dependencies:
  - prefer `FiberMap` for keyed worker ownership;
  - use `Fiber.await` to observe full worker `Exit`;
  - use `Scope`, `Effect.acquireRelease`, and scoped forks for lifecycle cleanup;
  - do not import from the vendored `repos/effect/` source tree.
- Introduce an explicit attempt ownership token:
  - every worker attempt has an immutable owner carrying issue identity, attempt number, attempt id,
    workspace path, and start timestamp;
  - all late events, worker exits, evidence writes, and cleanup commands must be fenced by the owner.
- Keep `OrchestratorState` as the only scheduling state authority:
  - no second registry may own `running`, `claimed`, `retry`, or `completed` state;
  - operational fiber handles may live in a supervisor/service, not in durable snapshots.
- Fix reconciliation priority:
  - terminal refresh wins over non-active and stale reconciliation;
  - non-active wins over stale reconciliation;
  - attempts already closing due to terminal refresh must not be retried by the stale scanner.
- Add retry token fencing comparable to the Elixir `make_ref` / `send_after` / `pop if token`
  pattern so old retry timers cannot consume a newer retry entry.
- Preserve scoped resource cleanup inside `AgentRunner` and Codex process/session code.
- Keep this task limited to worker ownership and attempt completion semantics. Do not implement status
  CLI, symphony kill, harness templates, or broad operator UX in this task.

## Acceptance Criteria

- [ ] A design document maps the relevant Elixir mechanisms to Effect/TypeScript primitives and
      explicitly names the intentional divergence around evidence-first cleanup.
- [ ] Worker supervision is lifecycle-only and does not directly write evidence, decide retry, or
      remove workspaces.
- [ ] Worker exits are observed through full `Exit` / `Cause`, and run evidence is written before
      classification to simplified state transition reasons.
- [ ] Terminal/non-active/stale reconciliation is ordered and tested so terminal attempts cannot be
      retried by stale reconciliation while they are being interrupted or completed.
- [ ] Retry processing has token fencing and tests for stale retry messages.
- [ ] Stale worker exits and late Codex events are fenced by attempt owner/attempt id and cannot mutate
      current state or clean up the wrong workspace.
- [ ] Evidence failure leaves the workspace in place, writes a cleanup hold when possible, and does not
      schedule retry for terminal cleanup attempts.
- [ ] Relevant unit tests cover redaction/schema retention regressions from the existing evidence task
      plus the new ownership, reconciliation priority, retry token, and stale event cases.
- [ ] Package typecheck passes through `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`.
- [ ] Full `rtk proxy pnpm verify` passes unless an external dependency failure is documented.

## Notes

- This task follows the discussion from the run-evidence implementation review on 2026-05-29.
- The current desired product behavior is a hybrid: Elixir-style ownership boundaries with
  TypeScript run-evidence-first cleanup safety.
