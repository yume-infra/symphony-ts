# Workspace Management

## Path Model

- Workspace root is the normalized absolute `workspace.root`.
- Per-issue workspace path is `<workspace.root>/<workspace_key>`.
- `workspace_key` is derived from `issue.identifier` by replacing any character outside
  `[A-Za-z0-9._-]` with `_`.

## Safety Invariants

These are non-negotiable:

- workspace path must be inside workspace root
- coding-agent subprocess cwd must equal the per-issue workspace path
- hooks run with the workspace path as cwd
- external commands must not run from repository root unless they are explicitly local validation
  commands outside the agent runner

## Lifecycle

- Reuse existing workspace directories for the same issue.
- Mark `created_now` only when the directory was created during the current call.
- Run `after_create` only when `created_now` is true.
- Do not auto-delete successful workspaces.
- Cleanup terminal workspaces during startup sweep and terminal active-run transitions.

## Hooks

Supported hooks:

- `after_create`
- `before_run`
- `after_run`
- `before_remove`

Failure semantics:

- `after_create` failure aborts workspace creation.
- `before_run` failure aborts the current attempt.
- `after_run` failure is reported through a best-effort failure handler and ignored.
- `before_remove` failure is reported through a best-effort failure handler and ignored; cleanup
  continues.
- Workspace remove failure is reported through the same handler and ignored by the low-level
  workspace service. Orchestrator callers should wire the handler to structured runtime logs.

## Effect Guidance

- Use `@effect/platform` `FileSystem`, `Path`, and `Command` services where available.
- Model hook failures with typed errors.
- Use `Scope` or finalizers for subprocess/resource cleanup.
- Normalize paths before comparing containment.
