# Runtime Orchestration Guidelines

> Internal service runtime conventions for workflow loading, orchestration, workspaces, retries, and
> reconciliation.

## Scope

Read this layer before implementing the long-running service, scheduler loop, worker lifecycle,
workspace manager, or runtime state handling.

## Pre-Development Checklist

- [ ] Read `symphony/spec-interpretation.md`.
- [ ] Identify which `SPEC.md` sections drive this change.
- [ ] Keep orchestrator state mutations under one authority.
- [ ] Model long-running behavior with Effect fibers, schedules, scopes, and interruptions.
- [ ] Check safety invariants before launching any external process.

## Quality Check

- [ ] Runtime state cannot dispatch the same issue twice.
- [ ] Worker exits always report a structured result to the orchestrator.
- [ ] Workspace paths are normalized and contained under workspace root.
- [ ] Dynamic reload failures keep the last known good config.
- [ ] Shutdown interrupts fibers and releases resources.

## Guides

| Guide | Purpose |
| --- | --- |
| [Workflow Config](./workflow-config.md) | Workflow file loading, config, validation, reload. |
| [Orchestrator State](./orchestrator-state.md) | Scheduler state and transitions. |
| [Workspace Management](./workspace-management.md) | Workspace paths, hooks, lifecycle, safety. |
| [Retry And Reconciliation](./retry-and-reconciliation.md) | Backoff, stalls, state refresh, cleanup. |
