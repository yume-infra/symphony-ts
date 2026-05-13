# Orchestrator State

## Ownership

The orchestrator is the single authority that mutates scheduling state. Workers and integrations
should report events/results back to the orchestrator instead of mutating shared state directly.

## Required State

Track at minimum:

- effective poll interval
- global concurrency limit
- running issues
- claimed issue IDs
- retry entries
- completed bookkeeping
- aggregate Codex token/runtime totals
- latest Codex rate-limit snapshot

## Dispatch Invariants

- Reconcile before dispatch on every tick.
- Never dispatch an issue already in `running`.
- Never dispatch an issue already in `claimed`.
- Enforce global concurrency.
- Enforce per-state concurrency when configured.
- Do not dispatch `Todo` issues with non-terminal blockers.

## Worker Contract

Workers should:

1. create or reuse the issue workspace
2. build the prompt
3. start the coding-agent session
4. forward events to the orchestrator
5. exit with structured success, failure, timeout, stall, or cancellation information

Normal worker exit does not prove the issue is done. The orchestrator should re-check eligibility
through continuation retry or an equivalent documented mechanism.

## Effect Guidance

- Prefer `Ref` or scoped state managed by a service over module-level mutable variables.
- Use fibers for concurrent workers.
- Use interruption and finalizers for cancellation.
- Use schedules for polling/retries rather than ad hoc timer chains where possible.
