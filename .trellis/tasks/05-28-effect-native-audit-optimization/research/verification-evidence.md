# Verification Evidence

## 2026-05-28 First Pass

- `rtk proxy pnpm effect:source:verify`: passed; verified `repos/effect` at split
  `b559d68845f848a10153395778f035682d399075`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test`: passed, 14 files / 62 tests.
- `rtk proxy pnpm lint`: passed after module order adjustments.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.

## 2026-05-28 Process Bridge Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed after migrating workspace
  hooks to `effect/unstable/process`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test -- src/workspace/manager.test.ts
  src/agent-runner/runner.test.ts`: passed through Vitest's workspace run, 14 files / 63 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/workspace/manager.ts`: passed after the process bridge
  changes were normalized.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.

## 2026-05-28 Codex Process Bridge Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed after moving Codex app-server
  execution to `ChildProcessSpawner`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test -- src/agent-runner/codex.test.ts`: passed
  through Vitest's workspace run, 14 files / 64 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/agent-runner/codex.ts
  apps/cli/src/agent-runner/codex.test.ts`: passed after import/order and Effect void mapping
  normalization.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count is now 14 files / 64 tests.

## 2026-05-28 Schema Boundary Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed after moving Codex JSON-RPC
  line decode/encode, dynamic tool result stringification, prompt complex-value rendering, and
  structured-log quoting to Effect Schema. The prior Schema-over-JSON `tsgo` suggestion is gone.
- `rtk proxy pnpm exec eslint apps/cli/src/agent-runner/codex.ts apps/cli/src/prompt/render.ts
  apps/cli/src/observability/logging.ts`: passed after Schema imports and helpers were added.
- `rtk proxy rg "JSON\\.parse|JSON\\.stringify" apps/cli/src -n`: only test files remain; runtime
  `apps/cli/src` code no longer uses direct JSON parse/stringify.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test -- src/agent-runner/codex.test.ts
  src/prompt/render.test.ts src/observability/logging.test.ts`: passed through Vitest's workspace
  run, 14 files / 64 tests.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  `tsgo --noEmit` reported no Effect warnings or suggestions.

## 2026-05-28 Config Shape Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed after adding Schema-backed raw
  workflow config decoding.
- `rtk proxy pnpm exec eslint apps/cli/src/config/resolve.ts apps/cli/src/domain/errors.ts`: passed
  after the config Schema gate and `ConfigError.cause` addition.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test -- src/config/resolve.test.ts`: passed
  through Vitest's workspace run, 14 files / 66 tests.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count is now 14 files / 66 tests.

## 2026-05-28 Best-Effort Recovery Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed after adding
  `RuntimeLogger` to orchestrator reconciliation/startup cleanup recovery paths.
- `rtk proxy pnpm exec eslint apps/cli/src/orchestrator/runtime.ts
  apps/cli/src/orchestrator/runtime.test.ts`: passed after recovery logging changes.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test -- src/orchestrator/runtime.test.ts`:
  passed through Vitest's workspace run, 14 files / 68 tests.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count is now 14 files / 68 tests.

## 2026-05-28 Test Harness Pass

- `rtk proxy pnpm view @effect/vitest@4.0.0-beta.66 version peerDependencies dependencies --json`:
  confirmed the v4 beta package peers on `effect@^4.0.0-beta.66` and `vitest@^3.0.0 || ^4.0.0`.
- `rtk proxy pnpm install`: passed after adding `@effect/vitest@4.0.0-beta.66` to the workspace
  catalog and trust-policy exception list.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test tests/support/effect.test.ts`: passed, 1
  file / 4 tests, including a native `it.effect` test that advances `TestClock`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  switching test imports to `@effect/vitest`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test`: passed, 14 files / 69 tests.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count is now 14 files / 69 tests.

## 2026-05-28 FileSystem Platform Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  moving workflow reads, `.env` reads, and workspace filesystem side effects to
  `FileSystem.FileSystem`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/config/resolve.test.ts
  src/workspace/manager.test.ts src/workflow/loader.test.ts src/workflow/runtime.test.ts`: passed,
  4 files / 24 tests, including `.env` loading through the Effect FileSystem service.
- `rtk proxy pnpm exec eslint apps/cli/src/config/resolve.test.ts apps/cli/src/workspace/manager.ts
  apps/cli/src/workflow/loader.ts apps/cli/src/config/resolve.ts`: passed after import ordering and
  explicit best-effort cleanup recovery.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count is now 14 files / 70 tests.

## 2026-05-28 Workflow Watch Stream Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  moving workflow watching from `node:fs.watch` / `Effect.callback` to `FileSystem.watch` /
  `Stream.runForEach`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/workflow/runtime.test.ts
  src/index.test.ts`: passed, 2 files / 4 tests, including a live watch test that updates
  `WORKFLOW.md` and observes the reload through `FileSystem.watch`.
- `rtk proxy pnpm exec eslint apps/cli/src/workflow/runtime.test.ts apps/cli/src/app.ts
  apps/cli/src/domain/errors.ts apps/cli/src/workflow/runtime.ts`: passed after import ordering and
  callback return-shape cleanup.
- `rtk proxy rg "node:fs|fs/promises|existsSync|readFileSync|watch\\(" apps/cli/src -n`: runtime
  source has no direct Node fs imports; remaining direct Node fs usage is in tests/fixtures, and
  runtime watch hits `FileSystem.watch(...)` / service-level `runtime.watch(...)`.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count is now 14 files / 71 tests.

## 2026-05-28 Linear HTTP Client Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  replacing direct global `fetch` with Effect `HttpClient`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/tracker/linear.test.ts
  src/client-tools/linear-graphql.test.ts src/index.test.ts`: passed, 3 files / 11 tests,
  including a fake `HttpClient` assertion for Linear request method, headers, body, status, and JSON
  response decoding.
- `rtk proxy pnpm exec eslint apps/cli/src/tracker/linear.ts apps/cli/src/tracker/linear.test.ts
  apps/cli/src/app.ts`: passed after import ordering and quoted-header normalization.
- `rtk proxy rg "fetch\\(" apps/cli/src -n`: runtime source no longer calls direct `fetch`.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count is now 14 files / 72 tests.

## 2026-05-28 Linear Tracker Harness Migration Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  migrating `apps/cli/src/tracker/linear.test.ts` from `runEffect` to native `it.effect` tests.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/tracker/linear.test.ts`: passed, 1 file
  / 6 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/tracker/linear.test.ts`: passed after the test migrated
  to `@effect/vitest` and local fake layers.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 72 tests.

## 2026-05-28 Prompt Renderer Harness Migration Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  migrating `apps/cli/src/prompt/render.test.ts` from `runEffect` to native `it.effect` tests.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/prompt/render.test.ts`: passed, 1 file
  / 5 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/prompt/render.test.ts`: passed after the renderer tests
  moved success and typed failure assertions into Effect-native test blocks.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 72 tests.

## 2026-05-28 Linear GraphQL Tool Harness Migration Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: initially surfaced a tsgo
  `preferSchemaOverJson` suggestion for `JSON.stringify` in
  `apps/cli/src/client-tools/linear-graphql.test.ts`; after switching the assertion to
  `Schema.UnknownFromJsonString` encoding, it passed with no suggestions.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/client-tools/linear-graphql.test.ts`:
  passed, 1 file / 4 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/client-tools/linear-graphql.test.ts`: passed after the
  client tool tests moved to `it.effect` and fake `LinearTransport` layers.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 72 tests.

## 2026-05-28 Codex Test JSON Assertion Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  moving the Codex dynamic tool assertion from direct `JSON.parse` to
  `Schema.UnknownFromJsonString` decoding.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/agent-runner/codex.test.ts`: passed, 1
  file / 8 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/agent-runner/codex.test.ts`: passed after the Schema
  import and helper were added.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 72 tests.

## 2026-05-28 Workflow Loader Harness Migration Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  migrating `apps/cli/src/workflow/loader.test.ts` from `runEffect` to native `it.effect` tests.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/workflow/loader.test.ts`: passed, 1 file
  / 5 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/workflow/loader.test.ts`: passed after the workflow
  loader test moved temporary workspace lifetime to `Effect.acquireUseRelease` and file setup to
  Effect `FileSystem`.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 72 tests.

## 2026-05-28 Config Resolver Harness Migration Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  migrating `apps/cli/src/config/resolve.test.ts` from `runEffect` to native `it.effect` tests.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/config/resolve.test.ts`: passed, 1 file
  / 8 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/config/resolve.test.ts`: passed after the config resolver
  tests moved config effects, typed failure assertions, and `.env` setup into Effect-native blocks.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 72 tests.

## 2026-05-28 Workflow Runtime Harness Migration Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  migrating workflow runtime reload tests from `runEffect` to native `it.effect` tests.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/workflow/runtime.test.ts`: passed, 1
  file / 3 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/workflow/runtime.test.ts`: passed after the test moved
  file setup to Effect `FileSystem` and kept the real watch path under `it.live`.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 72 tests.

## 2026-05-28 Agent Runner Harness Migration Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  migrating `apps/cli/src/agent-runner/runner.test.ts` from `runEffect` to native `it.effect`
  tests.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/agent-runner/runner.test.ts`: passed, 1
  file / 3 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/agent-runner/runner.test.ts`: passed after the runner
  tests moved workspace setup and assertions to Effect `FileSystem` with fake service layers.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 72 tests.

## 2026-05-28 Orchestrator State Harness Migration Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  migrating the Ref-backed orchestrator state test from `runEffect` to native `it.effect`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/orchestrator/state.test.ts`: passed, 1
  file / 4 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/orchestrator/state.test.ts`: passed after the test
  separated synchronous state-rule assertions from Effect-native Ref-backed assertions.

## 2026-05-28 Workspace Manager Harness Migration Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  migrating `apps/cli/src/workspace/manager.test.ts` from `runEffect` to native `it.effect` /
  `it.live` tests.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/workspace/manager.test.ts`: passed, 1
  file / 9 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/workspace/manager.test.ts`: passed after moving file
  setup/assertions to Effect `FileSystem`.
- The initial `it.effect` migration exposed that real shell hook timeout tests need `it.live`;
  switching hook/process tests to `it.live` made the timeout assertion use live time instead of the
  test clock.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 72 tests.

## 2026-05-28 Orchestrator Runtime Harness Migration Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  migrating `apps/cli/src/orchestrator/runtime.test.ts` from `runEffect` to native `it.effect`
  tests.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/orchestrator/runtime.test.ts`: passed, 1
  file / 11 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/orchestrator/runtime.test.ts`: passed after autofixing
  indentation from the mechanical migration.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 72 tests.

## 2026-05-28 Codex App-Server Harness Migration Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  migrating `apps/cli/src/agent-runner/codex.test.ts` from the `runEffect` bridge to native
  `it.effect` / `it.live` tests.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/agent-runner/codex.test.ts`: passed, 1
  file / 8 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/agent-runner/codex.test.ts`: passed after the test moved
  protocol-script flows to fake Linear layers inside Effect-native test blocks and moved the real
  child-process case to `it.live`.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 72 tests.
- At this point in the migration sequence, `rtk proxy rg "runEffect\\(" apps/cli/src apps/cli/tests -n`
  only reported `apps/cli/tests/support/effect.test.ts`, the bridge helper's own self-tests. The
  follow-up bridge removal pass below eliminates that final reference.

## 2026-05-28 Test Bridge Removal Pass

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  deleting the shared `apps/cli/tests/support/effect.ts` Promise bridge.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test tests/support/effect.test.ts`: passed, 1
  file / 1 test; the remaining support test verifies the native `@effect/vitest` `TestClock`
  environment directly.
- `rtk proxy pnpm exec eslint apps/cli/tests/support/effect.test.ts`: passed.
- `rtk proxy rg "runEffect\\(" apps/cli/src apps/cli/tests -n`: no matches.
- `scripts/effect-source-subtree.mjs`: updated the vendored-import guard to skip tracked files that
  have been deleted in the working tree, so `effect:source:verify` can validate pre-stage cleanup
  passes without attempting to read removed files.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count is now 14 files / 69 tests after removing the bridge self-tests.
- `rtk proxy git diff --check`: passed.

## 2026-05-28 Effect Clock Boundary Pass

- `apps/cli/src/app.ts`: poll snapshot time now uses `Clock.currentTimeMillis` instead of
  `Date.now()`.
- `apps/cli/src/agent-runner/codex.ts`: JSON-RPC response deadlines, `session_started`, and other
  emitted runtime event timestamps now use `Clock.currentTimeMillis`.
- `docs/effect-patterns/schedules-and-time.md`, `.trellis/spec/typescript-effect/effect-patterns.md`,
  `.trellis/tasks/05-28-effect-native-audit-optimization/research/audit-checklist.md`, and
  `docs/adr/0008-effect-clock-boundaries.md`: document the project rule for Effect clock reads.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/agent-runner/codex.test.ts src/index.test.ts`:
  passed, 2 files / 9 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/agent-runner/codex.ts apps/cli/src/app.ts`: passed.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 69 tests.
- `rtk proxy rg "Date\\.now\\(" apps/cli/src -g"*.ts" -n`: no matches.
- `rtk proxy rg "Effect\\.runPromise|runFork|unsafeRun" apps/cli/src -n`: no matches.
- `rtk proxy git diff --check`: passed.

## 2026-05-28 Agent Runner Function Boundary Pass

- `apps/cli/src/agent-runner/runner.ts`: promoted the anonymous multi-turn Codex loop inside
  `runAttempt` to `Effect.fn("AgentRunner.runCodexTurnLoop")`.
- The `after_run` hook remains attached with `Effect.ensuring(...)` around the named turn loop, so
  the finalizer behavior stays scoped to the Codex run body.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/agent-runner/runner.test.ts src/workspace/manager.test.ts`:
  passed, 2 files / 12 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/agent-runner/runner.ts apps/cli/src/agent-runner/runner.test.ts apps/cli/src/workspace/manager.test.ts`:
  passed.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 69 tests.
- `rtk proxy git diff --check`: passed.
- `rtk proxy rg "runEffect\\(" apps/cli/src apps/cli/tests -n`: no matches.
- `rtk proxy rg "Date\\.now\\(" apps/cli/src -g"*.ts" -n`: no matches.
- `rtk proxy rg "Effect\\.runPromise|runFork|unsafeRun" apps/cli/src apps/cli/tests -n`: no matches.

## 2026-05-28 Scoped Test Workspace Pass

- `apps/cli/tests/support/fakes/workspace.ts`: replaced the Promise-based
  `node:fs/promises` helper with `FileSystem.makeTempDirectoryScoped(...)` and
  `withFakeWorkspace(...)`.
- `apps/cli/src/config/resolve.test.ts`, `apps/cli/src/workflow/loader.test.ts`,
  `apps/cli/src/workflow/runtime.test.ts`, `apps/cli/src/agent-runner/runner.test.ts`,
  `apps/cli/src/agent-runner/codex.test.ts`, and `apps/cli/src/workspace/manager.test.ts`:
  migrated temporary workspace setup to the scoped helper.
- `docs/effect-patterns/testing-harness.md`, `docs/effect-patterns/platform-services.md`,
  `.trellis/spec/typescript-effect/effect-patterns.md`, and
  `docs/adr/0009-effect-scoped-test-workspaces.md`: document scoped Effect temp workspace fixtures.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/config/resolve.test.ts src/workflow/loader.test.ts src/workflow/runtime.test.ts src/agent-runner/runner.test.ts src/agent-runner/codex.test.ts src/workspace/manager.test.ts`:
  passed, 6 files / 36 tests.
- `rtk proxy pnpm exec eslint apps/cli/tests/support/fakes/workspace.ts apps/cli/src/config/resolve.test.ts apps/cli/src/workflow/loader.test.ts apps/cli/src/workflow/runtime.test.ts apps/cli/src/agent-runner/runner.test.ts apps/cli/src/agent-runner/codex.test.ts apps/cli/src/workspace/manager.test.ts`:
  passed.
- `rtk proxy rg "createFakeWorkspace|Effect\\.promise|mkdtemp|rm\\(" apps/cli/src apps/cli/tests -n`:
  no matches.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 69 tests.
- `rtk proxy git diff --check`: passed.

## 2026-05-28 Orchestrator Function Boundary Pass

- `apps/cli/src/orchestrator/runtime.ts`: promoted exported `reconcileRunning` from
  `export function ... return Effect.gen(...)` to `Effect.fn("reconcileRunning")` and placed it
  before `pollTick`.
- `apps/cli/src/orchestrator/runtime.ts`: promoted `processDueRetries`, `dispatchIssue`,
  `handleWorkerSuccessEffect`, and `handleWorkerExitEffect` from plain `Effect.gen` helpers to
  named `Effect.fn` values ordered before `pollTick`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/orchestrator/runtime.test.ts`: passed, 1
  file / 11 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/orchestrator/runtime.ts apps/cli/src/orchestrator/runtime.test.ts`:
  passed.
- `rtk proxy rg "return Effect\\.gen\\(" apps/cli/src/orchestrator/runtime.ts -n`: no matches.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 69 tests.
- `rtk proxy git diff --check`: passed.
- `rtk proxy rg "runEffect\\(" apps/cli/src apps/cli/tests -n`: no matches.
- `rtk proxy rg "Date\\.now\\(" apps/cli/src -g"*.ts" -n`: no matches.
- `rtk proxy rg "Effect\\.runPromise|runFork|unsafeRun" apps/cli/src apps/cli/tests -n`: no matches.

## 2026-05-28 Linear Pagination Function Boundary Pass

- `apps/cli/src/tracker/linear.ts`: promoted the shared GraphQL pagination loop from
  `function fetchPagedIssues(...) { return Effect.gen(...) }` to `Effect.fn("fetchPagedIssues")`.
- The pure normalization and payload-shape helpers remain plain functions; they do not allocate
  runtime services or represent reusable Effect boundaries.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit` after
  restoring explicit `yield*` result annotations required by the stricter `Effect.fn` loop.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/tracker/linear.test.ts src/client-tools/linear-graphql.test.ts`:
  passed, 2 files / 10 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/tracker/linear.ts apps/cli/src/tracker/linear.test.ts apps/cli/src/client-tools/linear-graphql.test.ts`:
  passed.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 69 tests.
- `rtk proxy git diff --check`: passed.
- `rtk proxy rg "runEffect\\(|Date\\.now\\(|Effect\\.runPromise|runFork|unsafeRun" apps/cli/src apps/cli/tests -n`:
  no matches.
- `rtk proxy rg "return Effect\\.gen\\(function\\*|export function .*Effect" apps/cli/src -g"*.ts" -n`:
  remaining matches are internal helpers in `agent-runner/codex.ts`, `workspace/manager.ts`, and
  `config/resolve.ts`; there are no exported function-returning-Effect matches.

## 2026-05-28 Workspace Helper Boundary Pass

- `apps/cli/src/workspace/manager.ts`: promoted `ensureDirectory` and `pathExists` to named
  `Effect.fn` values and ordered them before the workspace operations that reuse them.
- The scoped hook process transaction remains inline because it is a local resource lifetime block
  inside the already named `runHookWithEffectProcess` boundary.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/workspace/manager.test.ts`: passed, 1
  file / 9 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/workspace/manager.ts apps/cli/src/workspace/manager.test.ts`:
  passed.
- `rtk proxy rg "function (ensureDirectory|pathExists)|return Effect\\.gen\\(" apps/cli/src/workspace/manager.ts -n`:
  no matches.

## 2026-05-28 Config Dotenv Boundary Pass

- `apps/cli/src/config/resolve.ts`: promoted `readDotEnv` to `Effect.fn("readDotEnv")` and ordered
  it before `loadEnvironment`, keeping `NodeServices.layer` at the public environment-loading
  boundary.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/config/resolve.test.ts`: passed, 1 file
  / 8 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/config/resolve.ts apps/cli/src/config/resolve.test.ts`:
  passed.
- `rtk proxy rg "function readDotEnv|return Effect\\.gen\\(" apps/cli/src/config/resolve.ts -n`:
  no matches.

## 2026-05-28 Remaining Inline Generator Classification Pass

- `.trellis/tasks/05-28-effect-native-audit-optimization/research/effect-usage-inventory.md`:
  records the remaining production inline `Effect.gen` matches by category: layer construction,
  local scoped process transactions, and Codex protocol state-machine blocks.
- `docs/effect-patterns/function-boundaries.md`: adds the maintenance rule that production
  `Effect.gen` audit matches must be promoted or explicitly classified.
- `rtk proxy rg "Effect\\.gen\\(" apps/cli/src --glob '!*.test.ts' -n`: remaining matches are
  classified in the audit inventory.
- `rtk proxy rg "runEffect\\(|Date\\.now\\(|Effect\\.promise|Effect\\.runPromise|runFork|unsafeRun" apps/cli/src apps/cli/tests -n`:
  no matches.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 69 tests.
- `rtk proxy git diff --check`: passed.

## 2026-05-28 Codex Protocol Helper Function Boundary Pass

- `apps/cli/src/agent-runner/codex.ts`: promoted protocol helper boundaries to named `Effect.fn`
  values, including workspace validation, response timeout/read/encode/enqueue helpers, emit and
  failure helpers, dynamic tool execution, and request/notification handlers.
- The remaining Codex production inline `Effect.gen(...)` matches are intentionally classified:
  the protocol `while` state machine in `runCodexProtocolTurn`, and the scoped process-session
  acquisition block in `runCodexProcessTurnWithTransport`. The later inline simplification pass
  removes the scoped acquisition generator.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/agent-runner/codex.test.ts src/client-tools/linear-graphql.test.ts`:
  passed, 2 files / 12 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/agent-runner/codex.ts apps/cli/src/agent-runner/codex.test.ts apps/cli/src/client-tools/linear-graphql.test.ts`:
  passed.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 69 tests.
- `rtk proxy git diff --check`: passed.
- `rtk proxy rg "runEffect\\(|Date\\.now\\(|Effect\\.promise|Effect\\.runPromise|runFork|unsafeRun" apps/cli/src apps/cli/tests -n`:
  no matches.
- `rtk proxy rg "Effect\\.gen\\(" apps/cli/src --glob '!*.test.ts' -n`: remaining matches are
  classified in the audit inventory.

## 2026-05-28 Linear And Config Effect Helper Boundary Pass

- `apps/cli/src/tracker/linear.ts`: promoted `requireOkGraphQLResponse`, `issueConnection`, and
  `missingProjectSlug` to named `Effect.fn` values before the pagination/fetch functions that reuse
  them.
- `apps/cli/src/config/resolve.ts`: promoted `validateConfigValues` and `invalidConfig` to named
  `Effect.fn` values before `resolveServiceConfig`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/config/resolve.test.ts src/tracker/linear.test.ts src/client-tools/linear-graphql.test.ts`:
  passed, 3 files / 18 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/config/resolve.ts apps/cli/src/config/resolve.test.ts apps/cli/src/tracker/linear.ts apps/cli/src/tracker/linear.test.ts apps/cli/src/client-tools/linear-graphql.test.ts`:
  passed.
- `rtk proxy rg "function [A-Za-z0-9_]+\\([^\\)]*\\): Effect\\.Effect|return Effect\\.gen\\(" apps/cli/src --glob '!*.test.ts' -n`:
  no plain function-returning-Effect matches remain; output is limited to classified inline
  generator locations.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 69 tests.
- `rtk proxy git diff --check`: passed.
- `rtk proxy rg "runEffect\\(|Date\\.now\\(|Effect\\.promise|Effect\\.runPromise|runFork|unsafeRun|new Promise|node:fs/promises|fetch\\(" apps/cli/src apps/cli/tests -n`:
  no matches.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts smoke:bin`: passed; built `dist/index.js` and
  printed the expected `symphony-ts [flags] [<workflow-path>]` help path.

## 2026-05-28 Inline Generator Simplification Pass

- `apps/cli/src/workflow/runtime.ts`: replaced the reload failure/success branch generators with
  `Ref.update` / `Ref.set` plus `Effect.as(...)`, leaving only the layer-construction generator in
  that module.
- `apps/cli/src/agent-runner/codex.ts`: replaced the scoped process-session acquisition generator
  with `makeCodexProcessSession(...).pipe(Effect.flatMap(...), Effect.scoped, ...)`.
- `docs/effect-patterns/function-boundaries.md` and
  `.trellis/spec/typescript-effect/effect-patterns.md`: document the rule that single-step state
  updates or acquisition/use glue should prefer explicit callbacks with `Effect.as(...)` /
  `Effect.flatMap(...)` over a local generator.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/workflow/runtime.test.ts src/agent-runner/codex.test.ts`:
  passed, 2 files / 11 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/workflow/runtime.ts apps/cli/src/workflow/runtime.test.ts apps/cli/src/agent-runner/codex.ts apps/cli/src/agent-runner/codex.test.ts`:
  passed.
- `rtk proxy rg "Effect\\.gen\\(" apps/cli/src --glob '!*.test.ts' -n`: remaining production
  matches are 5 classified sites: workflow layer construction, two Linear layer constructions,
  Codex protocol while-loop, and workspace hook scoped process transaction.
- `rtk proxy rg "runEffect\\(|Date\\.now\\(|Effect\\.promise|Effect\\.runPromise|runFork|unsafeRun" apps/cli/src apps/cli/tests -n`:
  no matches.
- `rtk proxy git diff --check`: passed.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 69 tests.

## 2026-05-28 Live Layer Factory Boundary Pass

- `apps/cli/src/workflow/runtime.ts`: promoted `Layer.effect(WorkflowRuntime)` construction to
  `Effect.fn("WorkflowRuntime.make")`.
- `apps/cli/src/tracker/linear.ts`: promoted `LinearTransportLive` and `LinearTrackerClientLive`
  layer construction to `Effect.fn("LinearTransport.make")` and
  `Effect.fn("LinearTrackerClient.make")`.
- `docs/effect-patterns/services-and-layers.md`: documents the named factory pattern for non-trivial
  `Layer.effect` construction.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/workflow/runtime.test.ts src/tracker/linear.test.ts src/client-tools/linear-graphql.test.ts`:
  passed, 3 files / 13 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/workflow/runtime.ts apps/cli/src/workflow/runtime.test.ts apps/cli/src/tracker/linear.ts apps/cli/src/tracker/linear.test.ts apps/cli/src/client-tools/linear-graphql.test.ts`:
  passed.
- `rtk proxy rg "Effect\\.gen\\(" apps/cli/src --glob '!*.test.ts' -n`: remaining production
  matches are 2 classified sites: Codex protocol while-loop and workspace hook scoped process
  transaction.
- `rtk proxy rg "function [A-Za-z0-9_]+\\([^\\)]*\\): Effect\\.Effect" apps/cli/src --glob '!*.test.ts' -n`:
  no matches.
- `rtk proxy rg "runEffect\\(|Date\\.now\\(|Effect\\.promise|Effect\\.runPromise|runFork|unsafeRun|new Promise|node:fs/promises|fetch\\(" apps/cli/src apps/cli/tests -n`:
  no matches.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 69 tests.
- `rtk proxy git diff --check`: passed.

## 2026-05-28 Workspace Scoped Process Boundary Pass

- `apps/cli/src/workspace/manager.ts`: promoted the hook subprocess acquire/read transaction to
  `Effect.fn("runHookProcess.scoped")`, with `runHookWithEffectProcess` applying `Effect.scoped`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/workspace/manager.test.ts`: passed, 1
  file / 9 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/workspace/manager.ts apps/cli/src/workspace/manager.test.ts`:
  passed.
- `rtk proxy rg "Effect\\.gen\\(" apps/cli/src --glob '!*.test.ts' -n`: only reports the Codex
  protocol while-loop.

## 2026-05-28 Codex Protocol Loop Boundary Pass

- `apps/cli/src/agent-runner/codex.ts`: promoted the closure-heavy JSON-RPC protocol while-loop
  inside `runCodexProtocolTurn` to nested `Effect.fn("runCodexProtocolTurn.loop")`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/agent-runner/codex.test.ts`: passed, 1
  file / 8 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/agent-runner/codex.ts apps/cli/src/agent-runner/codex.test.ts`:
  passed.
- `rtk proxy rg "Effect\\.gen\\(" apps/cli/src --glob '!*.test.ts' -n`: no matches.
- `rtk proxy rg "function [A-Za-z0-9_]+\\([^\\)]*\\): Effect\\.Effect" apps/cli/src --glob '!*.test.ts' -n`:
  no matches.
- `rtk proxy rg "runEffect\\(|Date\\.now\\(|Effect\\.promise|Effect\\.runPromise|runFork|unsafeRun|new Promise|node:fs/promises|fetch\\(" apps/cli/src apps/cli/tests -n`:
  no matches.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count remains 14 files / 69 tests.
- `rtk proxy git diff --check`: passed.

## 2026-05-28 YAML Front Matter Parser Boundary Pass

- `apps/cli/src/workflow/yaml.ts`: replaced the hand-written YAML subset parser with the `yaml`
  package, preserving typed `WorkflowParseError` mapping and non-map root rejection.
- `apps/cli/src/workflow/loader.test.ts`: added duplicate-key parser diagnostics coverage and
  updated block scalar expectations to YAML's standard clipped newline behavior.
- `docs/adr/0010-yaml-front-matter-boundary.md`, `docs/effect-patterns/schema-boundaries.md`,
  `.trellis/spec/runtime-orchestration/workflow-config.md`, and
  `.trellis/spec/typescript-effect/effect-patterns.md`: document the maintained parser boundary and
  the division between YAML syntax parsing and Effect Schema config validation.
- `rtk proxy pnpm install`: passed after adding `yaml` as a direct CLI runtime dependency. Pnpm
  emitted existing bin-link/build-script warnings but exited successfully and updated the lockfile
  importer.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/workflow/loader.test.ts`: passed, 1
  file / 6 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/workflow/yaml.ts apps/cli/src/workflow/loader.ts apps/cli/src/workflow/loader.test.ts`:
  passed.

## 2026-05-28 Workspace Best-Effort Failure Reporting Pass

- `apps/cli/src/workspace/manager.ts`: best-effort `after_run`, `before_remove`, workspace path
  resolution, and remove-directory failures are reported through `WorkspaceBestEffortFailureHandler`
  instead of being silently collapsed.
- `apps/cli/src/agent-runner/runner.ts` and `apps/cli/src/orchestrator/runtime.ts`: orchestrator
  paths wire the failure handler to structured `RuntimeLogger` warnings for
  `workspace_after_run_failed` and `workspace_cleanup_failed`.
- `docs/adr/0011-workspace-best-effort-failure-reporting.md`,
  `docs/effect-patterns/typed-errors.md`, `docs/effect-patterns/platform-services.md`,
  `.trellis/spec/runtime-orchestration/workspace-management.md`, and
  `.trellis/spec/typescript-effect/effect-patterns.md`: document callback-based best-effort
  failure reporting as the Effect-native boundary.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`: passed with `tsgo --noEmit`.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/workspace/manager.test.ts src/agent-runner/runner.test.ts src/orchestrator/runtime.test.ts`:
  passed, 3 files / 25 tests.
- `rtk proxy pnpm exec eslint apps/cli/src/workspace/manager.ts apps/cli/src/workspace/manager.test.ts apps/cli/src/agent-runner/runner.ts apps/cli/src/agent-runner/runner.test.ts apps/cli/src/orchestrator/runtime.ts apps/cli/src/orchestrator/runtime.test.ts`:
  passed.
- `rtk proxy pnpm verify`: passed full gate: source verify, build, typecheck, test, lint, knip.
  Test count is now 14 files / 72 tests.
- `rtk proxy git diff --check`: passed.
- `rtk proxy rg "Effect\\.gen\\(" apps/cli/src --glob '!*.test.ts' -n`: no matches.
- `rtk proxy rg "runEffect\\(|Date\\.now\\(|Effect\\.promise|Effect\\.runPromise|runFork|unsafeRun|Effect\\.ignore|Effect\\.asVoid|Effect\\.catchAllCause|Effect\\.serviceOption" apps/cli/src apps/cli/tests -n`:
  no matches.
- `rtk proxy rg "Effect\\.catch\\(\\(\\) => Effect\\.(sync\\(\\(\\) => undefined\\)|succeed\\(null\\)|void|unit\\)\\)|JSON\\.(parse|stringify)|fetch\\(|node:fs|fs/promises|child_process|Effect\\.runPromise|Effect\\.promise" apps/cli/src --glob '!*.test.ts' -n`:
  no matches.
- Final audit follow-up found one remaining silent `pathExists` fallback; `apps/cli/src/workspace/manager.ts`
  now propagates `FileSystem.exists` failures to the best-effort callback as
  `check_workspace_exists` before continuing cleanup.
- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts test src/workspace/manager.test.ts src/orchestrator/runtime.test.ts`:
  passed, 2 files / 22 tests after the existence-check reporting change.

## Remaining Audit Follow-Up

- `completion-audit.md` now provides the final cross-module proof for the requested objective:
  authority sources, module coverage, optimization evidence, current scans, accepted remaining
  sync boundaries, documentation assets, and completion result.
- No known reviewed Effect-native evidence gaps remain in the runtime modules audited in this task.
- `rtk proxy pnpm verify`: passed full gate after the final workspace existence-check reporting
  follow-up: source verify, build, typecheck, test, lint, knip. Test count is now 14 files / 72
  tests.
- `rtk proxy git diff --check`: passed.
- `rtk proxy rg "Effect\\.gen\\(" apps/cli/src --glob '!*.test.ts' -n`: no matches.
- `rtk proxy rg "function [A-Za-z0-9_]+\\([^\\)]*\\): Effect\\.Effect" apps/cli/src --glob '!*.test.ts' -n`:
  no matches.
- `rtk proxy rg "Effect\\.catch\\(\\(\\) => Effect\\.(sync|succeed|void|unit)|runEffect\\(|Date\\.now\\(|Effect\\.promise|Effect\\.runPromise|runFork|unsafeRun|Effect\\.ignore|Effect\\.asVoid|Effect\\.catchAllCause|Effect\\.serviceOption|JSON\\.(parse|stringify)|fetch\\(|node:fs|fs/promises|child_process" apps/cli/src --glob '!*.test.ts' -n`:
  no matches.
