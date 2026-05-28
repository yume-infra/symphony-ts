# Effect Native Completion Audit

Date: 2026-05-28

This audit proves the requested Effect-native review against the current worktree. It treats the
vendored Effect v4 beta source and project-local Trellis specs as authority, then checks every
runtime module and harness asset that can regress the requested practices.

## Requirements

1. Use the vendored Effect source and current package baseline as the practice authority.
2. Audit the existing Effect implementation by module and runtime chain, not only by syntax.
3. Optimize current Effect usage where project code diverged from the preferred Effect-native
   patterns.
4. Add durable ADR, guide, spec, and research assets so future maintenance can preserve the
   patterns.
5. Verify with the project validation loop and targeted source scans.

## Authority Evidence

- `docs/effect-patterns/index.md` records the local source order and active baseline:
  `effect@4.0.0-beta.66`, `@effect/platform-node@4.0.0-beta.66`,
  `@effect/tsgo@0.7.0`, and `repos/effect/` at split
  `b559d68845f848a10153395778f035682d399075`.
- `rtk proxy pnpm verify` runs `pnpm effect:source:verify`; the latest run verified
  `repos/effect` at split `b559d68845f848a10153395778f035682d399075`.
- `docs/effect-patterns/*` references the relevant vendored upstream guides and source:
  `Effect.fn`, services/layers, resources, FileSystem, process, HTTP, Schema, testing, CLI, and
  runtime guidance.

## Module Coverage

`rtk proxy rg --files apps/cli/src | sort` shows the production modules and their colocated tests.
The audit inventory covers every production module group:

- CLI/runtime composition: `index.ts`, `cli/command.ts`, `app.ts`
- workflow/config: `workflow/loader.ts`, `workflow/runtime.ts`, `workflow/yaml.ts`,
  `config/resolve.ts`
- orchestration/state: `orchestrator/runtime.ts`, `orchestrator/state.ts`
- agent/Codex: `agent-runner/runner.ts`, `agent-runner/codex.ts`
- integrations/tools: `tracker/linear.ts`, `client-tools/linear-graphql.ts`
- workspace/logging/prompt/domain: `workspace/manager.ts`, `observability/logging.ts`,
  `prompt/render.ts`, `domain/errors.ts`, `domain/types.ts`

The detailed module matrix lives in `effect-usage-inventory.md`.

## Optimization Evidence

- Entrypoint: `apps/cli/src/index.ts` uses `NodeRuntime.runMain` and `NodeServices.layer`.
- Services: runtime services use `Context.Service` and `Layer`; the lint rule forbids
  `Context.Tag`.
- Function boundaries: reusable runtime boundaries are named with `Effect.fn(...)`.
  `rtk proxy rg "Effect\\.gen\\(" apps/cli/src --glob '!*.test.ts' -n` reports no production
  matches.
- Platform files: runtime file reads, writes, temp workspace fixtures, directory checks, removal,
  and watching use `FileSystem.FileSystem`; pure `node:path` logic remains direct by design.
- Process bridges: workspace hooks and Codex app-server process integration use
  `effect/unstable/process` `ChildProcessSpawner` with scopes, queues, streams, bounded output, and
  typed timeouts.
- HTTP: Linear GraphQL transport uses `effect/unstable/http` and the Node HTTP client layer, not
  direct `fetch`.
- Schema/encoding: runtime JSON protocol and arbitrary JSON string boundaries use Effect Schema.
  Workflow YAML syntax uses the maintained `yaml` package, then config sections decode through
  Effect Schema.
- Time: runtime wall-clock reads use `Clock.currentTimeMillis`; `Date.now()` is absent from runtime
  source.
- Best-effort recovery: external tracker recovery logs structured warnings; workspace `after_run`,
  `before_remove`, existence-check, and cleanup failures report typed callback context that
  orchestrator paths log.
- Harness: tests import from `@effect/vitest`; the shared `runEffect` Promise bridge was removed;
  temporary workspaces use `FileSystem.makeTempDirectoryScoped`.

## Scans

These current scans are part of the completion evidence:

- `rtk proxy rg "Effect\\.gen\\(" apps/cli/src --glob '!*.test.ts' -n`: no matches.
- `rtk proxy rg "runEffect\\(|Date\\.now\\(|Effect\\.promise|Effect\\.runPromise|runFork|unsafeRun|Effect\\.ignore|Effect\\.asVoid|Effect\\.catchAllCause|Effect\\.serviceOption" apps/cli/src apps/cli/tests -n`: no matches.
- `rtk proxy rg "Effect\\.catch\\(\\(\\) => Effect\\.(sync\\(\\(\\) => undefined\\)|succeed\\(null\\)|void|unit\\)\\)|JSON\\.(parse|stringify)|fetch\\(|node:fs|fs/promises|child_process|Effect\\.runPromise|Effect\\.promise" apps/cli/src --glob '!*.test.ts' -n`: no matches.
- `rtk proxy git diff --check`: passed.
- `rtk proxy pnpm verify`: passed source verify, build, typecheck, test, lint, and knip. The
  latest full test run passed 14 files / 72 tests.

## Accepted Remaining Boundaries

The remaining production sync boundaries are intentional and documented by pattern docs:

- `Effect.try` wraps synchronous parser/template/protocol adapter boundaries so thrown local typed
  errors become typed Effect failures.
- `Effect.sync` wraps console writes in the runtime logger.
- `process.env`, `process.cwd()`, `node:os`, `node:path`, and `node:buffer` remain only for
  environment snapshots or pure platform-neutral value manipulation; runtime side effects use
  Effect services.
- Test files may use local `Effect.gen` inside `it.effect` / `it.live` blocks. That is harness
  code, not production runtime implementation.

## Documentation Assets

The worktree now contains durable assets for future agents:

- ADRs: `docs/adr/0001` through `docs/adr/0011` cover function boundaries, process bridges,
  Schema JSON, Effect Vitest, platform filesystem, watch streams, HTTP, clock boundaries, scoped
  test workspaces, YAML, and workspace best-effort failure reporting.
- Guides: `docs/effect-patterns/` includes source reference, services/layers, resources, fibers,
  schedules/time, state, function boundaries, HTTP, platform services, process bridges, Schema,
  testing harness, typed errors, CLI/runtime, and tsgo diagnostics.
- Trellis specs: `.trellis/spec/typescript-effect/` and runtime-orchestration specs record the
  stable project rules.
- Research evidence: `audit-checklist.md`, `effect-usage-inventory.md`, `verification-evidence.md`,
  and this completion audit preserve the review trail.

## Result

All explicit requirements are satisfied by current-state evidence. No reviewed runtime module has a
known remaining Effect-native practice gap, and the harness/documentation assets required to keep
future code Effect-native are present and verified.
