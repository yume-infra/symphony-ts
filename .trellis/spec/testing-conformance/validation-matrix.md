# Validation Matrix

## Current Validation Commands

Run:

```bash
pnpm verify
```

This currently includes:

- build
- `tsgo --noEmit`
- eslint
- knip

Use `pnpm typecheck:tsc` as a fallback check when investigating tsgo/native-preview issues.

After the Vitest environment is added, project validation should include deterministic test runs.
After monorepo migration, this section must be updated with workspace-aware commands.

## Core Conformance Areas

Map tests to `SPEC.md` sections 17 and 18:

- workflow/config parsing
- dynamic reload and last-known-good behavior
- workspace path sanitization and containment
- workspace hooks and timeout semantics
- Linear candidate fetch, pagination, blockers, labels, state refresh
- orchestrator dispatch sorting, claims, concurrency, retries, stalls, reconciliation
- Codex app-server startup, stream handling, timeouts, unsupported tools, user input policy
- prompt rendering with strict variables/filters
- structured logs and metrics aggregation
- CLI workflow path handling and startup failures

## Extension Conformance

Only required when implemented:

- `linear_graphql` client tool (first-pass scope)
- HTTP status surface (deferred)
- humanized event summaries
- persisted retry/session metadata
- first-class tracker writes
- non-Linear tracker adapters

HTTP server, dashboard, JSON REST API, and SSH workers are deferred from first-pass conformance.

## Definition Of Done For Runtime Features

A runtime feature is not done until:

- core contract is documented or referenced
- deterministic tests cover normal and failure paths
- logs include required identifiers where applicable
- `pnpm verify` passes
- any intentional spec deviation is documented
