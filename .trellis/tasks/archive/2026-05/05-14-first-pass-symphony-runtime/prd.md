# First-pass Symphony runtime implementation

## Goal

Implement a first-pass, spec-conformant TypeScript/Effect Symphony orchestration service in
`apps/cli` that replaces the greeting stub while preserving the public command shape:

```bash
symphony-ts [workflow-path]
```

The CLI must remain thin. Runtime behavior belongs in Effect services/modules that load
`WORKFLOW.md`, resolve typed config, poll Linear-compatible tracker issues, coordinate workspaces
and Codex app-server worker attempts, maintain orchestrator state, retry/reconcile failures, render
prompts, emit structured logs, and support deterministic conformance tests.

## Requirements

- Use `SPEC.md` as the first-pass conformance baseline, especially sections 5-18.
- Follow the Trellis spec layers:
  - `symphony/` for product boundaries and allowed deferrals.
  - `typescript-effect/` for Effect v4 beta, services/layers, typed errors, CLI, and tsgo.
  - `runtime-orchestration/` for workflow/config, state, workspaces, retry, and reconciliation.
  - `external-integrations/` for Linear, Codex app-server, prompt rendering, and `linear_graphql`.
  - `testing-conformance/` for deterministic fakes and validation coverage.
  - `quality-operations/` for logs, safety, verification, and AI infrastructure.
- Use installed dependency imports only. Never import from `repos/effect/`.
- Use Effect v4 beta APIs and patterns:
  - `effect/unstable/cli/Command`
  - `effect/unstable/cli/Flag` where flags are used
  - `effect/unstable/cli/Argument` for the optional workflow path if supported by tsgo
  - `@effect/platform-node/NodeRuntime`
  - `@effect/platform-node/NodeServices`
  - `NodeRuntime.runMain`
  - `Context.Service`
- Implement workflow loading:
  - explicit workflow path wins; otherwise use `./WORKFLOW.md`
  - optional YAML front matter split from trimmed Markdown prompt body
  - unknown top-level keys ignored
  - typed load/parse errors for missing file, parse errors, and non-map front matter
- Implement typed config:
  - defaults from `SPEC.md` section 6.4
  - `$VAR` resolution only where allowed
  - canonical Linear env key `LINEAR_API_KEY`
  - `~` and relative workspace path expansion
  - startup and per-tick dispatch validation
- Implement dynamic reload:
  - detect workflow file changes
  - re-read and re-apply future config/prompt behavior
  - keep last known good config and log invalid reloads without crashing
- Implement orchestrator runtime:
  - single-authority in-memory state
  - poll tick order: reconcile, validate, fetch candidates, sort, dispatch, observe
  - global and per-state concurrency
  - claimed/running checks to prevent duplicate dispatch
  - blocker eligibility for `Todo`
  - retry queue with continuation retry and capped exponential backoff
  - stall detection and active-run reconciliation
  - internal snapshot contract for tests/debugging, not an HTTP/status UI
- Implement workspace management:
  - deterministic sanitized workspace keys
  - normalized root containment checks
  - create/reuse workspaces
  - hooks `after_create`, `before_run`, `after_run`, `before_remove`
  - hook timeouts and failure semantics
  - startup and terminal-transition cleanup
- Implement Linear-compatible tracker boundary:
  - candidate fetch by active states and project slug
  - terminal fetch by states
  - issue state refresh by GraphQL IDs
  - pagination
  - normalization of labels, blockers, priority, and timestamps
  - typed error categories
- Implement Codex app-server boundary:
  - launch configured command through `bash -lc <command>` from the per-issue workspace
  - JSON-line protocol client boundary with deterministic fake support
  - extract thread/turn IDs into `session_id`
  - stream structured events to orchestrator
  - enforce read/turn timeouts and no-stall user-input policy
  - support unsupported-tool structural failures
  - document approval/sandbox/user-input posture
- Implement prompt rendering:
  - strict variable/filter semantics for `issue` and `attempt`
  - empty prompt body may fall back to minimal default prompt
  - render failures fail the run attempt
- Implement `linear_graphql` client-side tool extension:
  - validates one GraphQL operation per call
  - uses configured Linear endpoint/auth
  - returns structured success/failure output
  - never exposes raw tokens
- Implement observability:
  - operator-visible structured logs
  - issue logs include `issue_id` and `issue_identifier`
  - session lifecycle logs include `session_id`
  - redaction for secrets
  - token/runtime/rate-limit aggregation in orchestrator snapshot
- Implement deterministic tests with fakes for core conformance areas in `SPEC.md` section 17.
- Keep optional UI/dashboard, HTTP API, and SSH worker extension out of first-pass scope.
- Preserve and update task artifacts:
  - `prd.md`
  - `design.md`
  - `implement.md`
  - `spec-conformance-checklist.md`
  - `progress-log.md`

## Acceptance Criteria

- [ ] Task planning artifacts exist and map scope to `SPEC.md` sections 17 and 18.
- [ ] The task is started in Trellis before application code edits.
- [ ] `apps/cli/src/index.ts` remains a thin CLI entrypoint for `symphony-ts [workflow-path]`.
- [ ] Runtime modules are separated by domain/workflow/config/tracker/workspace/agent-runner/
      orchestrator/observability/client-tool boundaries.
- [ ] Deterministic tests cover workflow/config parsing, reload behavior, workspace safety/hooks,
      Linear tracker normalization/errors, orchestrator dispatch/retry/reconciliation, Codex fake
      protocol behavior, prompt rendering, observability, and CLI startup/path behavior.
- [ ] Required first-pass conformance items are checked off in `spec-conformance-checklist.md`, or
      explicitly marked as deferred only when `SPEC.md` labels them optional/recommended/extension
      and Trellis specs allow deferral.
- [ ] `rtk proxy pnpm --filter symphony-ts typecheck` passes while iterating on Effect-heavy code.
- [ ] Final verification runs `rtk proxy pnpm verify` and passes.
- [ ] Durable implementation decisions and any intentional `SPEC.md` deviations are recorded in
      the task artifacts, and `.trellis/spec/` is not modified unless explicitly required later.
- [ ] Final response summarizes changed modules, validation results, deferred optional items, and
      the exact stopping condition reached.

## Notes

- Environment preflight already confirmed:
  - `node v25.8.1`
  - `pnpm 10.33.2`
  - `rtk 0.39.0`
  - `node_modules` present
  - `LINEAR_API_KEY` key exists in `.env` without printing the value
  - `rtk proxy pnpm --filter symphony-ts typecheck` passes on the current stub
- The user confirmed the path is correct and that Linear App/Codex Linear plugin integration exists.
  Use the API key, Linear plugin, or computer-use only as needed; deterministic fakes remain the
  normal test path.
