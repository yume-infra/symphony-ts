# Effect Usage Inventory

## Baseline Evidence

- `pnpm effect:source:verify`: passed on 2026-05-28, confirming `repos/effect` split
  `b559d68845f848a10153395778f035682d399075`.
- `pnpm-lock.yaml`: `effect@4.0.0-beta.66`, `@effect/platform-node@4.0.0-beta.66`,
  `@effect/tsgo@0.7.0`, `@typescript/native-preview@7.0.0-dev.20260513.1`.

## Module Matrix

| Area | Files | Current Pattern | Risk | First Decision |
| --- | --- | --- | --- | --- |
| Node CLI entry | `apps/cli/src/index.ts`, `apps/cli/src/cli/command.ts` | Uses `effect/unstable/cli`, `NodeServices.layer`, and `NodeRuntime.runMain`; `smoke:bin` confirms the built CLI help path. | Low | Keep; smoke gate verified. |
| App runtime loop | `apps/cli/src/app.ts` | `startSymphony` is named with `Effect.fn`; background watcher uses `forkChild` and logs watcher stream failure; poll snapshot time uses `Clock.currentTimeMillis`. | Low | Keep; later evaluate `Layer.launch` shape only if service startup grows more layer-owned resources. |
| Workflow runtime reload/watch | `apps/cli/src/workflow/runtime.ts` | Live layer construction, reload, and watch are named; service uses `Ref`; file loading and watching use `FileSystem.FileSystem`; watcher consumes the watch stream with `Stream.runForEach` and maps failures to `WorkflowWatchError`. | Low | Done for named layer factory/service methods, file loading, and watch stream migration. |
| Orchestrator poll/reconcile/dispatch | `apps/cli/src/orchestrator/runtime.ts` | Poll, reconciliation, retry, dispatch, and worker exit/success flows are named with `Effect.fn`; external tracker best-effort fallbacks log structured warnings before returning `[]`. | Medium | Done for named orchestrator boundaries and recovery logging; pure helpers remain plain functions. |
| Orchestrator state | `apps/cli/src/orchestrator/state.ts` | `Context.Service`, `Layer.effect`, `Ref.modify` / `Ref.update` for atomic updates. | Low | Keep; later consider naming service methods where valuable. |
| Agent runner | `apps/cli/src/agent-runner/runner.ts` | `runAttempt`, service method wrapper, and the Codex turn loop are named with `Effect.fn`; `after_run` remains attached to the turn loop with `Effect.ensuring`. | Low | Done for named outer and inner runner boundaries while preserving after-run finalizer semantics. |
| Codex app-server bridge | `apps/cli/src/agent-runner/codex.ts` | Service runTurn, script turn, protocol turn, protocol loop, process session, protocol IO helpers, dynamic tool execution, request/notification handlers, and emit/failure helpers are named; process execution uses `ChildProcessSpawner` with Queue/Stream stdin/stdout orchestration; JSON-RPC lines are decoded/encoded with Effect Schema; protocol deadlines and emitted event timestamps use `Clock.currentTimeMillis`. | Low | Done for direct spawn removal, protocol Schema boundary, Effect clock reads, and protocol helper/loop boundary naming. |
| Workspace manager | `apps/cli/src/workspace/manager.ts` | Service, main workspace functions, reusable filesystem helpers, hook scoped process transactions, and best-effort failure notification are named; hook subprocesses use `ChildProcessSpawner`; directory create/stat/exists/remove use `FileSystem.FileSystem`; `WorkspaceBestEffortFailureHandler` reports ignored hook, existence-check, and cleanup failures to runtime callers. | Low | Done for hooks, filesystem side effects, scoped process helper naming, helper boundary naming, and logged best-effort failure callbacks; pure path logic remains direct. |
| Linear tracker | `apps/cli/src/tracker/linear.ts`, `apps/cli/src/client-tools/linear-graphql.ts` | Transport and tracker live layer factories are named; transport captures Effect `HttpClient`; GraphQL request JSON uses Schema, request/response use `HttpClientRequest` / `HttpClientResponse`; public fetchers, shared pagination, response validation, connection decoding, missing-project failure, and tool boundary are named; pure shape helpers remain plain functions. | Low | Done for HTTP/platform pass, named live factories, and shared paging/validation boundaries; keep pure normalizers plain. |
| Config/workflow loader/prompt/logging | `apps/cli/src/config/resolve.ts`, `apps/cli/src/workflow/loader.ts`, `apps/cli/src/workflow/yaml.ts`, `apps/cli/src/prompt/render.ts`, `apps/cli/src/observability/logging.ts` | Public/service boundaries are named; raw workflow config sections decode through Schema; workflow and `.env` file reads use named `FileSystem` helpers; config value validation helpers are named; YAML front matter syntax uses the `yaml` package; prompt complex-value rendering and log quoting use Schema JSON encoding. | Low | Done for config shape, JSON encoding, filesystem reads, `.env` boundary naming, config validation helper naming, and YAML parser boundary replacement. |
| Test harness | `apps/cli/tests/support/effect.test.ts`, `apps/cli/tests/support/fakes/workspace.ts`, `*.test.ts` | Test files import from `@effect/vitest`; module-level tests are migrated to Effect-native tests, including tracker, client tools, prompt, workflow, config, agent runner, Codex app-server boundary, orchestrator state/runtime, and workspace manager; the shared `runEffect` Promise bridge has been removed; temporary workspaces use `FileSystem.makeTempDirectoryScoped`. | Low | Done for dependency/import boundary, module migrations, bridge removal, and scoped Effect temp workspace fixtures; future Promise bridges require a documented external harness reason. |

## First Optimization Queue

1. Done: `app.ts`: `startSymphony`.
2. Done: `orchestrator/runtime.ts`: `pollTick`, `reconcileRunning`,
   `startupTerminalWorkspaceCleanup`, retry processing, dispatch, and worker exit/success handlers.
3. Done: `agent-runner/runner.ts`: `runAttempt`, service-method wrapper, and
   `AgentRunner.runCodexTurnLoop`.
4. Done: `workflow/runtime.ts`: service-local `reload` and `watch`.
5. Done for the process bridge, JSON protocol boundary, and protocol helper boundary:
   `agent-runner/codex.ts`: service `runTurn`, script path, protocol state machine, process
   session, protocol IO helpers, dynamic tool execution, request/notification handlers, and
   emit/failure helpers are named; direct Node `spawn` and nested process-side
   `Effect.runPromise` bridges were removed; JSON-RPC line decode/encode uses
   `Schema.fromJsonString`.
6. Done: `tracker/linear.ts` and `client-tools/linear-graphql.ts`: external GraphQL boundaries and
   shared pagination boundary.
7. Done: config, workflow loader, prompt renderer, logging, and main workspace service boundaries.

## Deferred Queue

- Done for workspace hooks: `runHook` uses `ChildProcess.make` / `ChildProcessSpawner`,
  `Effect.scoped`, and `Effect.timeoutOrElse`.
- Done for workspace helper boundaries: `ensureDirectory` and `pathExists` are named `Effect.fn`
  values ordered before the workspace operations that reuse them.
- Done for workspace scoped process boundary: `runHookProcess.scoped` owns the hook subprocess
  acquire/read transaction, and `runHookWithEffectProcess` scopes it with `Effect.scoped`.
- Done for Codex app-server: process execution uses `ChildProcess.make` / `ChildProcessSpawner`,
  outbound `Queue` -> `Stream.fromQueue` stdin, stdout line streaming, scoped exit/stderr watchers,
  and typed request/turn timeouts.
- Continue classifying internal helpers that return effects: promote reusable or diagnostic-worthy
  boundaries to `Effect.fn`, and document intentionally inline local lifetime/state-machine blocks.
- Done for Codex protocol helper boundaries: `validateWorkspaceCwdEffect`, `responseTimeout`,
  `readProtocolMessage`, `encodeProtocolMessage`, `enqueueProcessLine`, `emit`,
  `maybeEmitSessionStarted`, `failOnJsonRpcError`, `emitProtocolEvent`,
  `executeDynamicToolCall`, `handleProtocolServerRequest`, and `handleProtocolNotification` are
  named with `Effect.fn`.
- Done for Codex protocol loop boundary: the closure-heavy JSON-RPC while-loop is a nested
  `Effect.fn("runCodexProtocolTurn.loop")`, preserving local protocol state while keeping the span
  named.
- Done for Codex JSON-RPC protocol parsing/stringifying: inbound and outbound protocol lines use
  Effect Schema; arbitrary dynamic tool result JSON uses `Schema.UnknownFromJsonString`.
- Done for direct JSON parse/stringify removal from runtime source and low-risk test assertions:
  prompt rendering, structured logging, Linear tool redaction assertions, and Codex dynamic tool
  assertions use `Schema.UnknownFromJsonString`; remaining direct JSON calls are fixture source
  strings that simulate external JavaScript processes.
- Done for raw workflow config shape: `resolveServiceConfig` decodes known config sections through
  Effect Schema before defaults, environment expansion, path resolution, and dispatch validation.
- Done for `.env` file boundary naming: `readDotEnv` is a named `Effect.fn` over
  `FileSystem.FileSystem` before `loadEnvironment` provides `NodeServices.layer`.
- Done for config validation helper boundaries: `validateConfigValues` and `invalidConfig` are
  named `Effect.fn` values ordered before `resolveServiceConfig`.
- Done for Linear payload validation boundaries: `requireOkGraphQLResponse`, `issueConnection`, and
  `missingProjectSlug` are named `Effect.fn` values ordered before the pagination/fetch functions.
- Done for live layer factory boundaries: `WorkflowRuntime.make`, `LinearTransport.make`, and
  `LinearTrackerClient.make` are named `Effect.fn` values; their `Layer.effect(...)` exports now
  delegate to those factories.
- Done for orchestrator external tracker recovery: running reconciliation and startup terminal
  cleanup log structured warnings before returning empty issue lists.
- Done for orchestrator internal boundaries: retry processing, dispatch, worker success, and worker
  exit handlers are named `Effect.fn` values ordered before `pollTick` to satisfy
  `no-use-before-define`.
- Done for Effect clock pass: `startSymphony` poll snapshots and Codex protocol deadline/event
  timestamps use `Clock.currentTimeMillis`; runtime source no longer calls `Date.now()`.
- Workspace cleanup and after-run hook best-effort paths use `WorkspaceBestEffortFailureHandler` so
  the low-level workspace service remains logger-free while orchestrator callers emit structured
  `RuntimeLogger` warnings with issue/workspace context.
- Done for test harness baseline: `@effect/vitest@4.0.0-beta.66` is catalog-pinned and test files
  import from it.
- Done for test bridge removal: the former shared `runEffect` Promise bridge was deleted after
  module-level migrations completed; remaining harness coverage verifies `@effect/vitest`
  `TestClock` behavior directly.
- Done for test workspace fixtures: `apps/cli/tests/support/fakes/workspace.ts` now uses
  `FileSystem.makeTempDirectoryScoped`, and workspace/config/workflow/agent/Codex tests use
  `withFakeWorkspace(...)` instead of `Effect.promise` wrappers around `node:fs/promises`.
- Done for first module-level test migration: `apps/cli/src/tracker/linear.test.ts` now uses
  `it.effect` with fake `LinearTransport` / `HttpClient` layers instead of the `runEffect` bridge.
- Done for adjacent GraphQL tool test migration: `apps/cli/src/client-tools/linear-graphql.test.ts`
  now uses `it.effect`, fake `LinearTransport` layers, and Schema JSON encoding for token-redaction
  shape assertions.
- Done for pure Effect renderer test migration: `apps/cli/src/prompt/render.test.ts` now uses
  `it.effect` and `Effect.flip` directly for success and typed-failure assertions.
- Done for workflow loader test migration: `apps/cli/src/workflow/loader.test.ts` now uses
  `it.effect`, scoped `withFakeWorkspace(...)`, and Effect `FileSystem` setup for service-level file
  loading coverage.
- Done for workflow runtime test migration: `apps/cli/src/workflow/runtime.test.ts` now uses
  `it.effect` for reload tests, keeps `it.live` for real watch timing, and uses scoped
  `withFakeWorkspace(...)` plus Effect `FileSystem` setup instead of direct Node writes.
- Done for config resolver test migration: `apps/cli/src/config/resolve.test.ts` now uses
  `it.effect`; the `.env` coverage uses scoped `withFakeWorkspace(...)` and Effect `FileSystem`
  setup.
- Done for agent runner test migration: `apps/cli/src/agent-runner/runner.test.ts` now uses
  `it.effect`, fake Codex/tracker layers, the shared scoped fake workspace helper, and Effect
  `FileSystem` assertions around workspace side effects.
- Done for agent runner function-boundary pass: the multi-turn Codex loop is now a named
  `Effect.fn("AgentRunner.runCodexTurnLoop")`, and `runAttempt` still wraps that loop in
  `Effect.ensuring(...)` so `after_run` remains a finalizer for successful and failing turns.
- Done for Codex app-server test migration: `apps/cli/src/agent-runner/codex.test.ts` now uses
  `it.effect` for protocol-script flows with fake Linear layers, `it.live` for the real
  child-process bridge, and scoped `withFakeWorkspace(...)` for temporary workspace cleanup.
- Done for orchestrator state test migration: `apps/cli/src/orchestrator/state.test.ts` keeps pure
  state-rule tests synchronous and runs Ref-backed service behavior under `it.effect`.
- Done for workspace manager test migration: `apps/cli/src/workspace/manager.test.ts` now uses
  `it.effect` for filesystem-only behavior, `it.live` for real shell hook/process timeout behavior,
  and scoped `withFakeWorkspace(...)` plus Effect `FileSystem` for setup/assertions.
- Done for orchestrator runtime test migration: `apps/cli/src/orchestrator/runtime.test.ts` now uses
  `it.effect` with fake layers for poll/reconcile/startup cleanup flows.
- Done for filesystem/watch pass: workflow file reads, workflow watch stream, `.env` reads, and
  workspace root/directory create/stat/exists/remove now use `FileSystem.FileSystem`.
- Done for Linear HTTP platform pass: runtime direct `fetch` is removed; `LinearTransportLive` uses
  Effect `HttpClient` and `AppLive` provides `NodeHttpClient.layerFetch`.
- Done for YAML front matter parser boundary: `apps/cli/src/workflow/yaml.ts` uses the `yaml`
  package for syntax parsing, maps parser diagnostics into `WorkflowParseError`, rejects non-map
  roots, and leaves known config section validation to Effect Schema.

## Remaining Inline `Effect.gen` Classification

- Done for anonymous production generator cleanup: `rtk proxy rg "Effect\\.gen\\(" apps/cli/src --glob '!*.test.ts' -n`
  reports no remaining production matches.
- Done for Linear pagination function-boundary pass: the shared GraphQL pagination loop now uses
  `Effect.fn("fetchPagedIssues")`; pure normalization helpers remain direct functions.
- Done for plain function-returning-Effect cleanup: `rtk proxy rg "function [A-Za-z0-9_]+\\([^\\)]*\\): Effect\\.Effect" apps/cli/src --glob '!*.test.ts' -n`
  reports no remaining production matches.
