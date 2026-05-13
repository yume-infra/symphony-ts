# Project Structure

## Entry Point

`src/index.ts` should stay thin:

- define the CLI command
- parse optional workflow path
- build/provide the application layer
- call `NodeRuntime.runMain`

Do not put orchestration, Linear, workspace, or Codex logic directly in the entrypoint.

## Suggested Runtime Modules

The exact structure may evolve, but implementation should separate these boundaries:

```text
src/
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

## Dependency Direction

Domain modules should not depend on integration modules. Integrations may depend on domain and
platform services. Orchestrator may depend on service interfaces, not concrete implementations.
