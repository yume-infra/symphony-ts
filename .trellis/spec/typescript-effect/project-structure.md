# Project Structure

## Monorepo Prerequisite

Main runtime implementation should assume Symphony-ts has already been migrated to the monorepo
shape selected from the user's setup reference. Do not design long-lived runtime paths around the
current single-package layout.

Until the migration is complete, keep spec guidance package-agnostic and preserve the public
`symphony-ts [workflow-path]` command shape.

## Entry Point

The package entrypoint should stay thin:

- define the CLI command
- parse optional workflow path
- build/provide the application layer
- call `NodeRuntime.runMain`

Do not put orchestration, Linear, workspace, or Codex logic directly in the entrypoint.

## Suggested Runtime Modules

The exact monorepo paths will be decided during migration, but implementation should separate these
boundaries:

```text
<runtime-package>/src/
  cli/
  config/
  workflow/
  tracker/
  workspace/
  agent-runner/
  orchestrator/
  observability/
  domain/
  platform/
```

## Boundary Rules

- `domain/` holds shared data types, tagged errors, and identifiers.
- `workflow/` parses `WORKFLOW.md` and prompt templates.
- `config/` turns raw workflow config into typed effective config.
- `tracker/` owns Linear transport and normalization.
- `workspace/` owns filesystem workspace lifecycle.
- `agent-runner/` owns Codex app-server protocol integration.
- `orchestrator/` owns scheduling state and worker coordination.
- `observability/` owns structured logging, metrics, and optional status snapshots.

## Migration Expectations

- Move existing package/tooling into the target monorepo layout without changing runtime behavior.
- Update package scripts, validation commands, and Trellis package discovery after migration.
- Keep future `/goal` instructions aligned to monorepo paths.
- Do not start broad runtime work until package boundaries are stable.

## Dependency Direction

Domain modules should not depend on integration modules. Integrations may depend on domain and
platform services. Orchestrator may depend on service interfaces, not concrete implementations.
