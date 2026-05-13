# Orchestrator Runtime Debug Playbook

Use this when dispatch, concurrency, retry, reconciliation, cancellation, workspace cleanup, or stall
detection fails.

## Sources Of Truth

Use local specs first:

- `.trellis/spec/runtime-orchestration/orchestrator-state.md`
- `.trellis/spec/runtime-orchestration/retry-reconciliation.md`
- `.trellis/spec/runtime-orchestration/workspace-management.md`
- `.trellis/spec/quality-operations/logging-observability.md`
- `.trellis/spec/quality-operations/safety-invariants.md`
- `SPEC.md` sections 17 and 18 for first-pass conformance tests

## Runtime Flow

Most orchestration failures cross multiple boundaries:

```text
WORKFLOW.md -> typed config -> orchestrator -> worker -> workspace -> agent runner -> logs
Linear -> normalized issue -> orchestrator -> prompt -> Codex app-server
```

Map the exact boundary before changing code.

## Investigation Order

1. Identify the affected `issue_identifier` and `issue_id`.
2. If a Codex session exists, identify `session_id`.
3. Determine whether the failure happened before dispatch, during worker setup, inside the
   app-server session, during retry scheduling, or during reconciliation.
4. Verify the orchestrator is the only authority mutating scheduling state.
5. Verify each scheduler tick reconciles running issues before fetching and dispatching candidates.
6. Check `running`, `claimed`, retry queue, completed bookkeeping, and concurrency counters.
7. Verify the same issue is never dispatched while already running or claimed.
8. Verify global and per-state concurrency limits are applied before dispatch.
9. Verify blockers prevent dispatch for non-terminal blocked issues.
10. Verify worker exits report structured success, failure, timeout, stall, or cancellation.
11. Remember that normal worker exit does not prove the issue is complete; verify continuation retry
    or the documented equivalent.
12. For failure-driven retries, verify exponential backoff is capped by
    `agent.max_retry_backoff_ms`.
13. For stalls, check latest Codex event time and worker start time.
14. For reconciliation, verify terminal state stops the worker and cleans workspace, active state
    updates the running snapshot, and non-active/non-terminal state stops the worker without cleanup.
15. Verify workspace paths are normalized, contained under workspace root, and never cleaned outside
    that root.

## Logs And Snapshot Checks

Issue-related logs should include:

- `issue_id`
- `issue_identifier`

Coding-agent lifecycle logs should include:

- `session_id`

Runtime snapshots should derive from orchestrator state and metrics only. A status surface must not
be required for correctness.

## Test Strategy

Prefer deterministic tests with:

- fake clock or controllable scheduler
- fake Linear transport
- fake Codex app-server stream
- fake filesystem or isolated workspace root
- narrow fixtures for retry, stall, and reconciliation cases

Avoid real sleeps in deterministic retry or stall tests.

## Required Evidence For Updates

When updating this playbook, include:

- affected issue and session identifiers, if available
- scheduler phase where the issue occurred
- state before and after the failed transition
- retry or cancellation ownership
- test added for the boundary or invariant
