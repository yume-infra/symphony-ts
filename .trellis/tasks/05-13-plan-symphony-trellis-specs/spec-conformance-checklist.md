# SPEC.md Conformance Checklist

Purpose: keep Symphony-ts implementation progress aligned with `SPEC.md` during the first strict
conformance pass.

## Checkbox Semantics

- Decision checkboxes show scope choices already made for the first pass.
- Implementation checkboxes stay unchecked until code, tests, and verification exist.
- If an item is intentionally deferred, keep it checked only in the "Deferred" section and do not
  mark any implementation item complete.

## Scope Decisions

- [x] First pass targets strict conformance, not a narrowed MVP subset.
- [x] Effect source/reference capture and project-local Effect pattern docs happen before runtime
      implementation.
- [x] Effect reference capture uses the full upstream Effect monorepo, pinned to a matching
      commit/tag.
- [x] Symphony-ts monorepo migration happens before main runtime implementation.
- [x] Main runtime implementation planning may assume the repository is already a monorepo.
- [x] Vitest is the first-pass test runner.
- [x] Vitest/Effect test infrastructure exists before `/goal` runtime implementation handoff.
- [x] `/goal` preflight AI infrastructure prioritizes worktree/bootstrap, seed debug playbooks, and
      goal context/spec loading.
- [x] Full commit/push/land skills are deferred until core runtime and CI conventions stabilize.
- [x] Debug playbooks start as seed artifacts and become living artifacts during implementation.
- [x] Section 18.1 `REQUIRED for Conformance` is fully in scope.
- [x] Core-path `SHOULD` / `RECOMMENDED` clauses are in scope when they support required behavior.
- [x] Safety posture and documentation clauses are in scope.
- [x] Internal runtime snapshot contract is in scope.
- [x] `linear_graphql` client-side tool extension is in scope.
- [x] Human-readable status surface is deferred to a second pass.
- [x] HTTP server, dashboard, and JSON REST API extension are deferred to a second pass.
- [x] Section 18.2 future extension TODOs are deferred.
- [x] Appendix A SSH worker extension is out of scope for the first pass.

## Section 18.1 Required Conformance

- [ ] Workflow path selection supports explicit runtime path and cwd default.
- [ ] `WORKFLOW.md` loader supports YAML front matter plus prompt body split.
- [ ] Typed config layer supports defaults and `$` resolution.
- [ ] Dynamic `WORKFLOW.md` watch/reload/re-apply works for config and prompt.
- [ ] Polling orchestrator has single-authority mutable state.
- [ ] Issue tracker client supports candidate fetch, state refresh, and terminal fetch.
- [ ] Workspace manager creates sanitized per-issue workspaces.
- [ ] Workspace lifecycle hooks exist: `after_create`, `before_run`, `after_run`,
      `before_remove`.
- [ ] Hook timeout config exists: `hooks.timeout_ms`, default `60000`.
- [ ] Coding-agent app-server subprocess client supports JSON line protocol.
- [ ] Codex launch command config exists: `codex.command`, default `codex app-server`.
- [ ] Prompt rendering is strict and supports `issue` and `attempt` variables.
- [ ] Exponential retry queue exists with continuation retries after normal exit.
- [ ] Retry backoff cap is configurable via `agent.max_retry_backoff_ms`, default 5 minutes.
- [ ] Reconciliation stops runs on terminal or non-active tracker states.
- [ ] Workspace cleanup handles terminal issues at startup sweep and active transition.
- [ ] Structured logs include `issue_id`, `issue_identifier`, and `session_id`.
- [ ] Operator-visible observability exists through structured logs.

## Effect Reference Prerequisite

- [ ] Pin the exact local dependency versions that guide the reference capture.
- [ ] Vendor the full upstream Effect monorepo as readable source/reference material.
- [ ] Record the Effect monorepo commit/tag and package-version alignment.
- [ ] Treat vendored/reference source as read-only.
- [ ] Document that application code imports only normal package dependencies.
- [ ] Capture service/layer patterns for this project.
- [ ] Capture scoped resource/finalizer patterns for this project.
- [ ] Capture fiber/schedule/interruption patterns for long-running orchestration.
- [ ] Capture typed error patterns for config, tracker, workspace, hooks, and Codex boundaries.
- [ ] Capture `@effect/cli` and `NodeRuntime.runMain` entrypoint patterns.
- [ ] Capture `@effect/tsgo` diagnostics workflow for agents.
- [ ] Link the generated pattern docs from the relevant Trellis spec indexes.

## Monorepo Migration Prerequisite

- [ ] Receive and inspect the user's monorepo setup reference before migration design.
- [ ] Define the target monorepo package layout before runtime implementation begins.
- [ ] Move existing package/tooling into the monorepo layout without changing runtime behavior.
- [ ] Preserve the public `symphony-ts [workflow-path]` command shape.
- [ ] Update package scripts and validation commands for the monorepo.
- [ ] Update Trellis spec/package discovery assumptions after migration.
- [ ] Verify future runtime implementation docs assume monorepo paths, not the current single-package
      layout.

## AI Infrastructure Prerequisite

- [ ] Document worktree/bootstrap rules for agent runs.
- [ ] Document dependency install and validation commands for the monorepo.
- [ ] Document cwd/package-target safety rules for agent launch and implementation.
- [ ] Document `/goal` context-loading rules.
- [ ] Ensure `/goal` context loads `SPEC.md`.
- [ ] Ensure `/goal` context loads this conformance checklist.
- [ ] Ensure `/goal` context loads Effect pattern docs.
- [ ] Ensure `/goal` context loads monorepo package specs.
- [ ] Ensure `/goal` context loads testing/conformance docs.
- [ ] Create seed debug playbook for Effect and `@effect/tsgo` diagnostics.
- [ ] Create seed debug playbook for Codex app-server protocol/schema drift.
- [ ] Create seed debug playbook for Linear fake and real integration paths.
- [ ] Create seed debug playbook for orchestrator concurrency, retry, reconciliation, and stalls.
- [ ] Define the rule for updating playbooks with symptoms, root cause, failed fixes, correct
      investigation order, tests, and spec/checklist updates.
- [ ] Defer complete commit/push/land skills until core runtime and CI conventions exist.

## Core SHOULD / RECOMMENDED Tracking

- [ ] `WORKFLOW.md` self-contained workflow/config/hook/tracker convention is documented.
- [ ] Unknown front matter keys are ignored for forward compatibility.
- [ ] Extension keys document schema, defaults, validation, and reload behavior.
- [ ] Reload applies polling interval, hook timeout, concurrency, and retry backoff changes.
- [ ] Codex config values are pass-through to the targeted app-server schema.
- [ ] Workflow read/parse failures do not silently fall back to a default prompt.
- [ ] Runtime defensively revalidates/reloads before critical operations.
- [ ] Active issues continue on the same live thread/workspace up to `agent.max_turns`.
- [ ] First turn uses full rendered prompt; continuation turns use continuation guidance.
- [ ] Reused workspaces are not destructively reset on population failure unless documented.
- [ ] Codex subprocess line buffering has a safe max line size policy.
- [ ] App-server subprocess remains alive across in-worker continuation turns.
- [ ] App-server events include stable event, timestamp, pid/usage/payload fields when available.
- [ ] Supported dynamic tools follow their extension contract.
- [ ] Unsupported dynamic tool calls return protocol-level failure without stalling.
- [ ] Codex errors map to normalized categories.
- [ ] Candidate issue normalization produces all section 4.1.1 fields.
- [ ] Tracker errors map to normalized categories.
- [ ] Prompt template receives `attempt` for first, continuation, and retry semantics.
- [ ] Log sink failures do not crash orchestration when another warning path is available.
- [ ] Runtime/token accounting is computed as a live aggregate at snapshot/render time.
- [ ] Hook output is truncated in logs.
- [ ] Conformance tests cover the behaviors defined by the spec.

## Internal Snapshot Extension

- [ ] Expose an internal synchronous runtime snapshot API or service boundary.
- [ ] Snapshot returns running session rows.
- [ ] Running rows include `turn_count`.
- [ ] Snapshot returns retry queue rows.
- [ ] Snapshot returns aggregate Codex token totals.
- [ ] Snapshot returns aggregate runtime seconds.
- [ ] Snapshot returns latest rate-limit payload when available.
- [ ] Snapshot timeout/unavailable cases are represented explicitly.
- [ ] Snapshot data comes from orchestrator state/metrics only.

## `linear_graphql` Tool Extension

- [ ] Tool is available only when `tracker.kind == "linear"` and auth is configured.
- [ ] Tool accepts a non-empty single GraphQL operation.
- [ ] Tool accepts optional JSON object variables.
- [ ] Tool reuses configured Linear endpoint and auth.
- [ ] Tool never exposes raw tokens to the coding agent.
- [ ] Top-level GraphQL errors return `success=false` while preserving response body.
- [ ] Invalid input, missing auth, and transport failures return structured failures.
- [ ] Tool is advertised during app-server session startup.
- [ ] Unsupported tool names fail through the targeted protocol without stalling.

## Safety And Operational Posture

- [ ] Document intended trust boundary.
- [ ] Document approval, sandbox, and operator-confirmation posture.
- [ ] Enforce workspace root containment.
- [ ] Enforce per-issue workspace cwd for coding-agent launch.
- [ ] Enforce sanitized workspace directory names.
- [ ] Support `$VAR` indirection for secrets.
- [ ] Do not log API tokens or secret env values.
- [ ] Validate secret presence without printing secret values.
- [ ] Enforce hook timeouts.
- [ ] Truncate hook output in logs.
- [ ] Document harness hardening expectations and risks.
- [ ] Document recommended deployment hardening separately from program-enforced guarantees.

## Testing And Validation

- [ ] Add Vitest to the workspace test environment.
- [ ] Add Effect-first test helpers for running programs and provisioning layers.
- [ ] Add fake service patterns for Linear, Codex app-server, filesystem/workspace boundaries, and
      time/scheduling.
- [ ] Add monorepo-aware test scripts.
- [ ] Add test documentation to the relevant Trellis specs before runtime implementation starts.
- [ ] Core conformance tests cover workflow/config parsing.
- [ ] Core conformance tests cover workspace manager and safety.
- [ ] Core conformance tests cover issue tracker client behavior.
- [ ] Core conformance tests cover orchestrator dispatch, reconciliation, and retry.
- [ ] Core conformance tests cover Codex app-server client behavior with fakes.
- [ ] Core conformance tests cover observability/logging behavior.
- [ ] Core conformance tests cover CLI and host lifecycle.
- [ ] Real integration profile is documented as recommended production validation.
- [ ] Real integration tests skip explicitly when credentials/network are unavailable.
- [ ] If real integration profile is explicitly enabled, failures fail the job.

## Deferred First-Pass Exclusions

- [x] Human-readable status surface is not required for first pass.
- [x] Dashboard `/` is not required for first pass.
- [x] HTTP JSON REST API is not required for first pass.
- [x] HTTP `--port` / `server.port` extension is not required for first pass.
- [x] Retry/session metadata persistence across process restarts is not required for first pass.
- [x] Workflow-configurable observability settings are not required for first pass.
- [x] First-class orchestrator tracker writes are not required for first pass.
- [x] Pluggable tracker adapters beyond Linear are not required for first pass.
- [x] SSH worker extension is not required for first pass.
