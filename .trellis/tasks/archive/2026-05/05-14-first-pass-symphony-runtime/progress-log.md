# Progress Log

## 2026-05-14 Checkpoint 0: Environment And Planning

- Created task: `.trellis/tasks/05-14-first-pass-symphony-runtime`.
- Confirmed environment:
  - Node `v25.8.1`
  - pnpm `10.33.2`
  - rtk `0.39.0`
  - `node_modules` present
  - `.env` contains `LINEAR_API_KEY` key without printing the value
- Verified current stub typecheck:

  ```bash
  rtk proxy pnpm --filter symphony-ts typecheck
  ```

  Result: passed.

- Read required authority and relevant detailed Trellis specs.
- Wrote PRD/design/implement/spec checklist.
- Remaining: start Trellis task, load pre-dev guidance, then implement checkpoint 1.
- Blockers: none currently. Real Linear/Codex smoke may require network/app-server availability,
  but deterministic fakes are the normal verification path.

## 2026-05-14 Checkpoint 1: Domain, Workflow, Config, Prompt

- Added domain types and typed error classes.
- Added `WorkflowLoader` service with explicit/default path selection, Markdown/front matter split,
  and a small YAML parser for the documented workflow schema.
- Added `ConfigResolver` service with defaults, `LINEAR_API_KEY` fallback, `$VAR` resolution,
  workspace path expansion, per-state concurrency normalization, and dispatch validation.
- Added strict `PromptRenderer` service with issue/attempt interpolation, simple loops, fallback
  prompt, unknown-variable failure, and unsupported-filter failure.
- Validation:

  ```bash
  rtk proxy pnpm --filter symphony-ts test -- workflow config prompt
  rtk proxy pnpm --filter symphony-ts typecheck
  ```

  Result: both passed.

- Remaining: dynamic reload, workspace/hooks, tracker, Codex boundary, orchestrator, CLI wiring,
  final verification.
- Blockers: none.

## 2026-05-14 Checkpoint 2: Workspace And Hooks

- Added `WorkspaceManager` service with workspace key sanitization, root containment checks,
  deterministic paths, create/reuse behavior, hook execution, hook timeouts, and best-effort
  cleanup semantics.
- Added tests for path containment, `after_create` gating, existing non-directory safety,
  fatal `before_run`, ignored `after_run`, hook timeout, ignored `before_remove`, cleanup, and
  service-layer usage.
- Validation:

  ```bash
  rtk proxy pnpm --filter symphony-ts test -- workspace
  rtk proxy pnpm --filter symphony-ts typecheck
  ```

  Result: both passed.

- Remaining: dynamic reload, tracker, Codex boundary, orchestrator, CLI wiring, final verification.
- Blockers: none.

## 2026-05-14 Checkpoint 3: Linear Tracker And `linear_graphql`

- Added `LinearTransport`, `TrackerClient`, Linear query construction, candidate/terminal/ID refresh
  operations, pagination, normalization, and typed error mapping.
- Added `linear_graphql` client tool with input validation, single-operation enforcement,
  configured auth/endpoint reuse, structured GraphQL error output, and no token exposure.
- Added deterministic fake transport tests for pagination, `slugId`, `[ID!]`, normalization,
  GraphQL errors, non-200 errors, invalid tool input, missing auth, and GraphQL tool success.
- Validation:

  ```bash
  rtk proxy pnpm --filter symphony-ts test -- tracker client-tools
  rtk proxy pnpm --filter symphony-ts typecheck
  ```

  Result: both passed.

- Notes: tsgo emitted non-blocking suggestions for JSON serialization and service dependency
  leakage. The public tracker service dependency will be tightened during integration wiring.
- Remaining: dynamic reload, Codex boundary, orchestrator, CLI wiring, final verification.
- Blockers: none.

## 2026-05-14 Checkpoint 4: Codex App-server Boundary

- Added `CodexAppServerClient` service with safe cwd validation, JSON-line process boundary,
  fake protocol runner, session id extraction, event extraction, token/rate-limit extraction,
  unsupported tool handling, `linear_graphql` routing, turn timeout, and no-stall user-input
  failure behavior.
- Added `AgentRunner` service that creates/reuses workspaces, renders initial prompts, sends
  continuation turns on the same thread, refreshes tracker state between turns, and runs
  `after_run` best effort.
- Added deterministic tests for session/event extraction, unsafe cwd rejection, user-input failure,
  unsupported tools, `linear_graphql` routing, workspace/prompt/cwd composition, continuation turns,
  and service-layer usage.
- Validation:

  ```bash
  rtk proxy pnpm --filter symphony-ts test -- agent-runner
  rtk proxy pnpm --filter symphony-ts typecheck
  ```

  Result: both passed.

- Notes: read-timeout coverage is still pending in the Codex checklist item; process read timeout
  will be finalized with orchestration/host lifecycle.
- Remaining: dynamic reload, orchestrator, CLI wiring, final verification.
- Blockers: none.

## 2026-05-14 Checkpoint 5: Orchestrator Runtime

- Added `OrchestratorState` with deterministic sorting, eligibility, duplicate prevention, blocker
  handling, global/per-state concurrency, retries, event accounting, reconciliation, and snapshots.
- Added runtime polling, active-session reconciliation, stalled-run detection, startup terminal
  workspace cleanup, and inline/forked dispatch support.
- Added orchestrator tests for sort order, concurrency limits, blocker eligibility, retry
  exhaustion/backoff, continuation retries, terminal/non-active reconciliation, stall detection,
  workspace cleanup, and service-layer usage.
- Validation:

  ```bash
  rtk proxy pnpm --filter symphony-ts test -- orchestrator workflow
  rtk proxy pnpm --filter symphony-ts typecheck
  ```

  Result: both passed.

- Remaining: CLI/logging/integration wiring, final verification.
- Blockers: none.

## 2026-05-14 Checkpoint 6: CLI, Logging, Integration Wiring

- Replaced the greeting stub with a thin `symphony-ts [workflow-path]` Effect CLI command.
- Composed live application services for workflow runtime, config, logging, orchestrator state,
  workspace management, prompt rendering, Linear tracking, Codex app-server execution, and agent
  runner dispatch.
- Added startup terminal cleanup, workflow watcher fiber startup, polling loop, dynamic poll
  interval usage, startup/error structured logs, and secret redaction helpers.
- Moved command definition out of the Node entrypoint so tests can import it without running
  `NodeRuntime.runMain`.
- Added logging and CLI smoke coverage.
- Validation:

  ```bash
  rtk proxy pnpm --filter symphony-ts test
  rtk proxy pnpm --filter symphony-ts typecheck
  rtk proxy pnpm --filter symphony-ts smoke:bin
  ```

  Result: all passed.

- Remaining: full `rtk proxy pnpm verify`, final spec-conformance audit, and any fixes discovered
  by the full gate.
- Blockers: none.

## 2026-05-14 Checkpoint 7: Final Verification And Audit

- Fixed final lint/knip findings from the full gate:
  - normalized imports and test titles with ESLint
  - moved test fixtures before first use
  - used explicit `node:buffer` / `node:process` imports
  - replaced the prompt interpolation regex with a linear expression
  - reduced internal-only exports and removed the unused `OrchestratorError`
- Final validation:

  ```bash
  rtk proxy pnpm verify
  rtk proxy pnpm --filter symphony-ts smoke:bin
  ```

  Result: both passed. `verify` ran build, typecheck, tests, lint, and knip; tests reported 14
  files and 59 tests passing. `smoke:bin` built the CLI and confirmed help output for
  `symphony-ts [flags] [<workflow-path>]`.

- Audit result:
  - Required first-pass SPEC 18.1 runtime items are implemented and mapped in
    `spec-conformance-checklist.md`.
  - Explicitly deferred work remains limited to optional/extension scope listed in the checklist:
    HTTP/dashboard API, human-readable status surface, SSH workers, restart-persistent retry/session
    metadata, first-class tracker writes, and non-Linear tracker adapters.
  - No stale greeting stub references remain in `apps/cli/src` or `apps/cli/package.json`.
  - Typecheck still emits non-blocking Effect suggestions for JSON serialization, tracker service
    requirement leakage, and `Effect.runPromise` inside the workflow watcher. They do not fail
    `verify` and are recorded here as future hardening candidates.
  - No `.trellis/spec/` files were updated because project instructions say not to rewrite Trellis
    specs yet unless explicitly asked; durable first-pass decisions/deviations are recorded in this
    task artifact instead.

- Remaining: none for the stated first-pass executable goal.
- Blockers: none.
