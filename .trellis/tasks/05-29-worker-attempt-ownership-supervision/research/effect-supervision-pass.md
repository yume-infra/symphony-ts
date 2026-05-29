# Effect Supervision Research Note

## Sources reviewed

- Task context:
  - `./.trellis/tasks/05-29-worker-attempt-ownership-supervision/prd.md`
  - `./.trellis/tasks/05-29-worker-attempt-ownership-supervision/design.md`
  - `./.trellis/tasks/05-29-worker-attempt-ownership-supervision/research/elixir-ownership-pass.md`
- Local Effect guidance:
  - `docs/effect-patterns/index.md`
  - `.trellis/spec/typescript-effect/index.md`
  - `repos/effect/LLMS.md`
- Pinned Effect source/tests:
  - `repos/effect/packages/effect/src/Fiber.ts`
  - `repos/effect/packages/effect/src/FiberMap.ts`
  - `repos/effect/packages/effect/src/Scope.ts`
  - `repos/effect/packages/effect/src/Effect.ts`
  - `repos/effect/packages/effect/test/FiberMap.test.ts`
  - `repos/effect/packages/effect/test/Effect.test.ts`
- Current runtime references:
  - `apps/cli/src/orchestrator/runtime.ts` (exit handling, supervisor/reconcile current flow)
  - `apps/cli/src/orchestrator/state.ts` (attempt-matching via `attemptId`)

## Official / external references used

- Effect docs: <https://effect.website/docs/concurrency/fibers/>
- Effect docs: <https://effect.website/docs/resource-management/scope/>
- Effect docs: <https://effect.website/docs/resource-management/introduction/>
- Effect v4 API index (local guidance and generated docs):
  - <https://effect-ts.github.io/effect/effect/Fiber.ts.html>
  - <https://effect-ts.github.io/effect/effect/Scope.ts.html>
  - <https://effect-ts.github.io/effect/effect/Effect.ts.html>

## What fits for Elixir-like ownership

- `FiberMap` is the best close match for worker ownership.
  - It is keyed and intended for managing multiple concurrent workers.
  - `FiberMap.make` is scope-backed (`Effect.acquireRelease`): closing the scope interrupts all fibers.
  - `FiberMap.run`/`set` can replace keyed workers; adding with same key interrupts existing worker.
  - `FiberMap.remove`/`clear` provide explicit targeted/ambient cancellation.
  - `run` can return a `Fiber`, and observers can attach to completion.
  - `onlyIfMissing` and `propagateInterruption` are directly useful for ownership safety in races.
- `Fiber.await` is a direct monitor equivalent:
  - Returns full `Exit<A, E>` (not just success/failure scalar), so evidence can persist complete typed/fail causes.
- `Scope`/`Effect.acquireRelease` are the right ownership model:
  - `acquireRelease` guarantees release at scope close and receives `Exit`.
  - `Scope.make / Scope.close / Scope.fork / Scope.use` support structured resource and cancellation lifecycle.
  - `forkScoped`/`forkIn` make worker fibers owned by a scope boundary for deterministic cleanup.
- `Context.Service` and `Layer` continue as the service boundary (project preference), with long-lived runtime boundaries under `NodeRuntime.runMain`.

## What to avoid (bad fit)

- `FiberHandle` is single-slot and is too weak for one issue → potentially multiple historical/overlapping attempts.
- `FiberSet` is unkeyed; good for “bag of children,” bad for per-issue matching and late-event rejection.
- `forkDetach` keeps fibers on global scope and is risky for ownership unless caller fully owns cancellation and fence rules.
- `forkChild` directly inside parent logic for lifetime ownership is easy to misuse; it inherits parent auto-supervision, which is helpful for local structured flows but not sufficient for long-lived worker registries unless wrapped by a dedicated supervisor scope.
- Relying on direct worker completion side effects inside the supervisor (currently present) mixes ownership and policy boundaries and risks stale/future-attempt contamination.

## Recommended boundary architecture

### 1) WorkerSupervisor

Responsible only for fiber lifecycle:
- owns attempt table (`FiberMap` keyed by `issueId`) and scoped lifecycle.
- starts worker fibers and stores handle by owner key.
- sets up `Fiber.await` watcher to emit `(IssueAttemptOwner, Exit)` events/sink.
- supports explicit interrupt:
  - remove/interrupt by key and/or owner.
  - optional “attempt token” check in the supervisor before acting.
- does not classify worker outcome, does not cleanup workspace, does not schedule retries.

### 2) AttemptCompletionService

Responsible for completion policy and evidence-first behavior:
- receives `AttemptOwner + Exit<AgentRunResult, WorkerRunError>` from the supervisor.
- writes evidence first and keeps full `Exit` for evidence and later classification.
- if evidence fails: write cleanup hold and avoid removing workspace.
- converts to `WorkerExitReason` and submits state transition commands to orchestrator/state layer only if owner matches current state.
- applies cleanup intent after evidence decision (terminal path and `Cause` semantics retained).

### 3) Orchestrator / state layer

Single source of scheduling truth remains `OrchestratorState`:
- tracks `running`, `claimed`, `retryAttempts`, `completed`, `cleanup hold` behavior.
- applies transitions only behind `attemptId`/attempt owner guards.
- owns retry tokens and reconciliation policy.

### 4) Reconciliation priority in one deterministic pass

- For each reconciliation tick, handle terminal refresh and non-active transitions before stale checks.
- `terminal > non-active > stale` avoids stale retries racing interrupted terminal-close attempts.
- keep a clear “closing” marker (owner-aware) so late stale cleanup cannot requeue closed attempts.

## Fit for run-evidence contract

- keep `AttemptOwner` as immutable ticket:
  - `issueId`, `attempt`, `attemptId`, `workspacePath`, `startedAtMs`, plus issue identity fields.
- every late event/path (`Codex event`, worker exit, cleanup command, evidence write path) must be fenced by owner.
- evidence-first behavior remains in completion service, not worker supervisor.
- stale events may still write their own attempt evidence, but must not mutate active runtime state.

## Risks / API uncertainties in `effect@4.0.0-beta.66`

- API surface is still volatile in docs/comments across v4 betas; external docs can differ from vendored source in wording/order. Use local pinned source + `@effect/tsgo` for authoritative checks.
- `forkScoped` semantics should be treated as “scoped lifetime” by construction; avoid `forkDetached` unless ownership is explicit elsewhere.
- `Scope`/`acquireRelease` are robust, but cleanup actions that may fail can delay transitions unless failures are handled explicitly.
- `FiberMap` tests show interruption-propagation behavior is configurable (`propagateInterruption`), so defaults can hide failures in observability paths unless explicitly set.
- No built-in equivalent of Erlang `Process.monitor` exists; ownership must be rebuilt with `(owner token + full Exit + explicit cancellation bookkeeping)`.
- Retry token fencing is an application concern (state-level), not provided as a dedicated built-in primitive.

## Open questions

- Should owner fencing happen in the supervisor before `Fiber.await` is processed, or at the completion service boundary, or both?
- Should `retryToken` become durable state in `RetryEntry` and timer registry, or is in-memory tokening sufficient for now?
- Should `interruption-only` terminal-close outcomes be classified differently from non-terminal exit paths when evidence write fails and no terminal cleanup is allowed?
