# Spec Conformance Checklist

Status labels:

- `[ ]` not started
- `[~]` in progress
- `[x]` implemented and verified
- `[D]` deferred by explicit optional/recommended/extension scope

## Required Context

- [x] Read `AGENTS.md`.
- [x] Read `SPEC.md`.
- [x] Read `docs/ai/goal-context.md`.
- [x] Read `docs/effect-patterns/index.md`.
- [x] Read `.trellis/spec/symphony/index.md`.
- [x] Read `.trellis/spec/typescript-effect/index.md`.
- [x] Read `.trellis/spec/runtime-orchestration/index.md`.
- [x] Read `.trellis/spec/external-integrations/index.md`.
- [x] Read `.trellis/spec/testing-conformance/index.md`.
- [x] Read `.trellis/spec/quality-operations/index.md`.
- [x] Checked `package.json` and `pnpm-lock.yaml` Effect baseline.
- [x] Treat `repos/effect/` as read-only reference material.

## SPEC 18.1 Required For Conformance

- [x] Workflow path selection supports explicit runtime path and cwd default.
- [x] `WORKFLOW.md` loader with YAML front matter and prompt body split.
- [x] Typed config layer with defaults and `$` resolution.
- [x] Dynamic `WORKFLOW.md` watch/reload/re-apply for config and prompt.
- [x] Polling orchestrator with single-authority mutable state.
- [x] Issue tracker client with candidate fetch, state refresh, and terminal fetch.
- [x] Workspace manager with sanitized per-issue workspaces.
- [x] Workspace lifecycle hooks: `after_create`, `before_run`, `after_run`, `before_remove`.
- [x] Hook timeout config with `hooks.timeout_ms` default `60000`.
- [x] Coding-agent app-server subprocess client with JSON line protocol boundary.
- [x] Codex launch command config with default `codex app-server`.
- [x] Strict prompt rendering with `issue` and `attempt` variables.
- [x] Exponential retry queue with continuation retries after normal exit.
- [x] Configurable retry backoff cap with default `300000`.
- [x] Reconciliation stops runs on terminal and non-active tracker states.
- [x] Workspace cleanup for terminal issues at startup and active transition.
- [x] Structured logs with `issue_id`, `issue_identifier`, and `session_id`.
- [x] Operator-visible observability through structured logs.

## SPEC 17 Core Conformance Tests

- [x] Workflow/config path precedence and missing/invalid errors.
- [x] Dynamic reload and last-known-good behavior.
- [x] Config defaults, validation, `$VAR`, `~`, relative workspace roots.
- [x] Prompt rendering strict variables/filters.
- [x] Workspace path determinism, create/reuse, hooks, timeouts, cleanup safety.
- [x] Agent launch cwd validation.
- [x] Linear candidate fetch query, active states, project slug, pagination.
- [x] Linear blockers, labels, priority, timestamps, state refresh, error mapping.
- [x] Orchestrator sort order, blocker eligibility, claimed/running duplicate prevention.
- [x] Global and per-state concurrency.
- [x] Active/non-active/terminal reconciliation behavior.
- [x] Normal continuation retry and abnormal exponential retry.
- [x] Retry slot exhaustion behavior.
- [x] Stall detection behavior.
- [x] Codex fake protocol startup, IDs, events, read/turn timeout, unsupported tool, user input.
- [x] `linear_graphql` tool extension validation and structured outputs.
- [x] Observability context and token/rate-limit aggregation.
- [x] CLI workflow-path, default path, startup failures, smoke bin.

## First-pass Explicit Deferrals

- [D] HTTP server extension, dashboard, and JSON REST API.
- [D] Human-readable status surface.
- [D] SSH worker extension.
- [D] Persisting retry/session metadata across process restarts.
- [D] First-class orchestrator tracker writes.
- [D] Non-Linear tracker adapters.

## Validation Evidence

- [x] Pre-task environment check: `rtk proxy pnpm --filter symphony-ts typecheck` passed on the stub.
- [x] Iteration typechecks recorded in `progress-log.md`.
- [x] Package tests pass.
- [x] `rtk proxy pnpm verify` passes.
- [x] `rtk proxy pnpm --filter symphony-ts smoke:bin` passes.
