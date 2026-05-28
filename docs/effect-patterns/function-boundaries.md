# Function Boundaries

Effect syntax passing `tsgo` is not enough for reusable runtime boundaries. The pinned Effect guide
at `repos/effect/ai-docs/src/01_effect/01_basics/02_effect-fn.ts` recommends `Effect.fn("name")`
for functions that return effects, because it gives the function a named span and clearer stack
traces while keeping generator syntax.

## Default Rule

Use `Effect.fn("name")` for exported functions returning an `Effect` and for service methods that
represent a reusable capability boundary:

```ts
export const pollTick = Effect.fn("pollTick")(function*(
  config: ServiceConfig,
): Effect.fn.Return<void, PollTickError, OrchestratorState | TrackerClient> {
  const tracker = yield* TrackerClient
  const state = yield* OrchestratorState
  const issues = yield* tracker.fetchCandidateIssues(config)

  // ...
})
```

Use the service-qualified name for implementations installed into a service layer:

```ts
export const AgentRunnerLive = Layer.succeed(AgentRunner)({
  runAttempt: Effect.fn("AgentRunner.runAttempt")(function*(params: AgentRunParams) {
    return yield* runAttempt(params)
  }),
})
```

Because `Effect.fn` produces a `const` value, the binding must be defined before first use. Put layer
exports after their named implementations when needed. Do not weaken `ts/no-use-before-define` just
to force a naming pass.

## When `Effect.gen` Is Still Fine

Inline `Effect.gen` is acceptable for one-off local effects where naming would add noise:

- a small branch inside `Effect.matchEffect` when it has multiple effectful steps
- a test body
- a local transaction that is not exported or reused
- a callback finalizer body
- a small internal helper where converting to `Effect.fn` would create noisy module reordering

For single-step state updates or acquisition/use glue, prefer explicit callbacks with
`Effect.as(...)` or `Effect.flatMap(...)` over a local generator:

```ts
Effect.matchEffect({
  onSuccess: config =>
    Ref.set(ref, { config, lastReloadError: null }).pipe(
      Effect.as({ applied: true, config, error: null }),
    ),
})
```

If an inline generator becomes large enough to need its own tests or comments, promote it to a named
`Effect.fn` boundary.

For audit work, do not leave production `Effect.gen` matches unexplained. Either promote the
boundary to `Effect.fn` or record why it is a local layer construction, scoped resource transaction,
small branch body, or intentionally deferred state-machine split.

## Error Raising

When returning a typed error from generator code, use `return yield*` so TypeScript understands that
the branch does not continue:

```ts
return yield* new CodexError({
  code: "response_error",
  reason: "Codex app-server emitted malformed JSON",
})
```

## Callback Bridges

`Effect.callback` remains the right bridge for callback-style sources when it returns a finalizer.
Wrap the boundary in `Effect.fn` when the bridge is reusable:

```ts
const runHook = Effect.fn("runHook")((hook: WorkspaceHook) =>
  Effect.callback<HookResult, WorkspaceError>((resume) => {
    const timeout = setTimeout(() => resume(Effect.fail(timeoutError(hook))), hook.timeoutMs)

    return Effect.sync(() => clearTimeout(timeout))
  })
)
```

## References

- `repos/effect/LLMS.md`
- `repos/effect/ai-docs/src/01_effect/01_basics/02_effect-fn.ts`
- `repos/effect/ai-docs/src/01_effect/02_services/01_service.ts`
- `repos/effect/ai-docs/src/01_effect/02_services/20_layer-composition.ts`
