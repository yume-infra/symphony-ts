# ADR 0011: Workspace Best-Effort Failure Reporting

## Status

Accepted.

## Context

Workspace hooks and cleanup have mixed semantics:

- `before_run` and `after_create` failures are fatal for the current operation.
- `after_run`, `before_remove`, and workspace removal are best-effort cleanup paths.

The first Effect audit rule was that best-effort recovery should not silently return `null`, `[]`,
or `void` for operator-visible failures. At the same time, the low-level workspace service should
not depend directly on `RuntimeLogger`; that would create an avoidable dependency from workspace
resource management back into the orchestration/observability layer.

## Decision

Keep workspace cleanup best-effort, but report failures through a typed callback:
`WorkspaceBestEffortFailureHandler`.

`WorkspaceManager` invokes the callback for:

- `after_run` hook failures;
- `before_remove` hook failures;
- workspace path resolution failures during best-effort cleanup;
- workspace directory removal failures.

The orchestrator owns issue/runtime context and wires those callbacks to `RuntimeLogger` warnings:
`workspace_after_run_failed` and `workspace_cleanup_failed`.

## Consequences

- Low-level workspace code remains logger-free and reusable in tests.
- Operator-visible cleanup failures are no longer hidden by default in orchestrator paths.
- New best-effort workspace paths must either use the failure callback or document why no caller
  context exists.

## References

- `apps/cli/src/workspace/manager.ts`
- `apps/cli/src/agent-runner/runner.ts`
- `apps/cli/src/orchestrator/runtime.ts`
- `docs/effect-patterns/typed-errors.md`
