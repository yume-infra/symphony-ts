# Retry And Reconciliation

## Poll Tick Order

Every scheduler tick should:

1. reconcile running issues
2. validate dispatch preconditions
3. fetch candidate issues
4. sort candidates
5. dispatch eligible issues while slots remain
6. emit observability/status updates

## Retry Rules

- Normal worker exit schedules a short continuation retry unless a future documented decision changes
  this mechanism.
- Failure-driven retry uses exponential backoff capped by `agent.max_retry_backoff_ms`.
- A retry entry stores issue ID, identifier, attempt, due time, timer/fiber handle, and error reason.
- Slot exhaustion requeues with an explicit error reason.

## Reconciliation

Reconciliation has two jobs:

- stall detection based on latest Codex event or worker start time
- tracker state refresh for running issues

State refresh behavior:

- terminal state -> terminate worker and clean workspace
- active state -> update running issue snapshot
- neither active nor terminal -> terminate worker without workspace cleanup
- refresh failure -> keep workers running and try again next tick

## Startup Cleanup

On startup, fetch terminal issues and remove corresponding workspaces. If the fetch fails, log a
warning and continue startup.

## Effect Guidance

- Use `Schedule` for retry/backoff policies.
- Use interruption for stopping workers.
- Use typed timeout/stall errors.
- Keep retry and reconciliation decisions observable through structured logs.
