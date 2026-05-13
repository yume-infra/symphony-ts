# Implementation Plan

## Checkpoint 0: Planning And Activation

- [x] Create Trellis task.
- [x] Read required project authority and relevant specs.
- [x] Write `prd.md`.
- [x] Write `design.md`.
- [x] Write `implement.md`.
- [x] Write `spec-conformance-checklist.md`.
- [x] Start Trellis task with `task.py start`.
- [x] Load `trellis-before-dev` before application code edits.

Validation:

```bash
rtk proxy pnpm --filter symphony-ts typecheck
```

## Checkpoint 1: Domain, Workflow, Config, Prompt

- [x] Add domain types and typed errors.
- [x] Add workflow path selection and parser.
- [x] Add typed config defaults, `$VAR`, path expansion, and validation.
- [x] Add strict prompt renderer.
- [x] Add config/workflow tests.
- [x] Add prompt tests.

Validation:

```bash
rtk proxy pnpm --filter symphony-ts test -- workflow config prompt
rtk proxy pnpm --filter symphony-ts typecheck
```

## Checkpoint 2: Workspace And Hooks

- [x] Add workspace key sanitization and containment.
- [x] Add create/reuse/remove lifecycle.
- [x] Add hook runner with timeout and failure semantics.
- [x] Add workspace tests.

Validation:

```bash
rtk proxy pnpm --filter symphony-ts test -- workspace
rtk proxy pnpm --filter symphony-ts typecheck
```

## Checkpoint 3: Linear Tracker And `linear_graphql`

- [x] Add Linear transport service and fake.
- [x] Add candidate, terminal-state, and ID-refresh query operations.
- [x] Add pagination and normalization.
- [x] Add tracker error mapping.
- [x] Add `linear_graphql` tool validation/execution.
- [x] Add tracker and tool tests.

Validation:

```bash
rtk proxy pnpm --filter symphony-ts test -- tracker client-tools
rtk proxy pnpm --filter symphony-ts typecheck
```

## Checkpoint 4: Codex App-server Boundary

- [x] Add app-server client service.
- [x] Add fake protocol runner.
- [x] Add live process launch boundary with safe cwd validation.
- [x] Add event extraction, timeout, unsupported tool, and user-input failure behavior.
- [x] Add agent runner composition with workspace/prompt/hooks.
- [x] Add agent-runner tests.

Validation:

```bash
rtk proxy pnpm --filter symphony-ts test -- agent-runner
rtk proxy pnpm --filter symphony-ts typecheck
```

## Checkpoint 5: Orchestrator Runtime

- [x] Add orchestrator state service and snapshot.
- [x] Add poll tick sequence.
- [x] Add eligibility/sorting/concurrency.
- [x] Add retry queue with continuation and capped exponential backoff.
- [x] Add reconciliation and stall detection.
- [x] Add startup terminal workspace cleanup.
- [x] Add orchestrator tests.

Validation:

```bash
rtk proxy pnpm --filter symphony-ts test -- orchestrator
rtk proxy pnpm --filter symphony-ts typecheck
```

## Checkpoint 6: CLI, Logging, Integration Wiring

- [x] Replace greeting CLI stub with `symphony-ts [workflow-path]`.
- [x] Compose live application layer.
- [x] Add startup/shutdown behavior.
- [x] Add structured log helper/redaction.
- [x] Add CLI tests and smoke bin coverage.

Validation:

```bash
rtk proxy pnpm --filter symphony-ts test
rtk proxy pnpm --filter symphony-ts smoke:bin
rtk proxy pnpm --filter symphony-ts typecheck
```

## Checkpoint 7: Final Verification And Audit

- [x] Update `spec-conformance-checklist.md`.
- [x] Update `progress-log.md`.
- [x] Record any durable decisions/deviations in task artifacts.
- [x] Run full verification.
- [x] Audit objective against artifacts and real command output.

Validation:

```bash
rtk proxy pnpm verify
```

## Risky Files And Rollback Points

- `apps/cli/src/index.ts`: public entrypoint; keep changes thin and covered by smoke tests.
- `apps/cli/package.json`: avoid new dependencies unless unavoidable and approved.
- `apps/cli/tsconfig.json`: do not weaken Effect diagnostics.
- Workspace cleanup code: must enforce root containment before deletion.
- Live Codex/Linear clients: deterministic fake tests are mandatory before relying on real smoke.

## Progress Log Protocol

After each checkpoint, append a concise entry to `progress-log.md` with:

- checkpoint name
- what changed
- validation command and result
- remaining work
- blocker, if any
