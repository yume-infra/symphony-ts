# ADR 0001: Named Effect Function Boundaries

## Status

Accepted.

## Context

The project already passes `eslint`, `tsgo`, and the Effect LSP for most current code. That proves
syntax and basic typing, but it does not prove that reusable Effect boundaries follow the upstream
v4 beta style. The vendored Effect guide says to prefer `Effect.fn("name")` for functions that
return effects and to avoid reusable functions that merely return `Effect.gen`.

The runtime has several long-lived orchestration and integration boundaries: polling, reconciliation,
agent attempts, workflow reloads, and Codex app-server turns. These boundaries are exactly where
named spans and clearer stack traces matter.

## Decision

Reusable runtime functions that return `Effect` use `Effect.fn("name")` by default. Service methods
installed into layers use service-qualified names, such as `AgentRunner.runAttempt` or
`WorkflowRuntime.watch`.

Inline `Effect.gen` remains acceptable for local branches and one-off test effects. Callback bridges
may still use `Effect.callback`, but reusable bridges are wrapped by `Effect.fn` and must return a
finalizer when they own timers, watchers, subprocesses, or event listeners.

## Consequences

- Future runtime audits can distinguish syntax-correct Effect from project-native Effect.
- Stack traces and tracing spans get stable names for key orchestration flows.
- More exported functions become `const` values. If a layer needs a function before its declaration,
  use a small named service-method wrapper or move the layer below the implementation.
- Zero-argument service effects are still exposed as `Effect` values when the service contract
  expects a property, not a callable function.

## Evidence

- `repos/effect/LLMS.md`
- `repos/effect/ai-docs/src/01_effect/01_basics/02_effect-fn.ts`
- `repos/effect/ai-docs/src/01_effect/02_services/20_layer-composition.ts`
- First applied modules: `apps/cli/src/app.ts`, `apps/cli/src/orchestrator/runtime.ts`,
  `apps/cli/src/agent-runner/runner.ts`, `apps/cli/src/workflow/runtime.ts`,
  `apps/cli/src/agent-runner/codex.ts`
