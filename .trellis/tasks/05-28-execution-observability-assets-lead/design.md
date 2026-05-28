# Execution observability and orchestration assets lead design

## Boundaries

This lead task does not implement runtime features directly. It coordinates child tasks and keeps
their interfaces compatible:

- `agent-run-summary-artifacts` defines the per-run evidence asset shape.
- `terminal-draining-semantics` resolves the worker lifecycle decision around terminal tracker
  observations.
- `runtime-status-snapshot-surface` exposes live state after summary artifacts define post-run
  language.
- `real-integration-harness-assets` packages the real-run workflow once summaries and semantics are
  stable.

## Dependency Rules

- The run-summary task can start immediately.
- Terminal-draining can proceed in parallel as a design/ADR task, but code changes should wait until
  the decision is reviewed.
- Status surface should not define its own transcript format; it links to run summaries for
  completed work.
- Harness work should reuse run-summary output and terminal semantics instead of creating another
  evidence convention.

## Product Shape

The desired operator story is:

1. While Symphony runs, use status output to see active and retrying work.
2. When an issue run completes, open a run summary to see what the agent actually did.
3. For deep debugging, inspect Symphony's captured protocol/runtime evidence.
4. For real acceptance, use a standard harness template that collects the same summary artifacts.

## Risks

- Duplicating evidence formats across summary, status, and harness.
- Treating humanized summaries as runtime logic.
- Accidentally committing raw protocol/session logs with secrets or excessive machine-local context.
- Changing terminal cleanup behavior before the policy is explicit.
