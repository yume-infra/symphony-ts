# Effect Native Review Checklist

## Upstream References

- `repos/effect/LLMS.md`
- `repos/effect/ai-docs/src/01_effect/01_basics/02_effect-fn.ts`
- `repos/effect/ai-docs/src/01_effect/02_services/01_service.ts`
- `repos/effect/ai-docs/src/01_effect/02_services/20_layer-composition.ts`
- `repos/effect/ai-docs/src/01_effect/04_resources/10_acquire-release.ts`
- `repos/effect/ai-docs/src/01_effect/04_resources/20_layer-side-effects.ts`
- `repos/effect/ai-docs/src/02_stream/30_encoding.ts`
- `repos/effect/ai-docs/src/60_child-process/10_working-with-child-processes.ts`
- `repos/effect/ai-docs/src/09_testing/10_effect-tests.ts`
- `repos/effect/packages/effect/src/Schema.ts`

## Checklist

- Exported functions returning `Effect` should use `Effect.fn("name")` when they perform effectful
  work or represent a reusable boundary.
- Service methods implemented inside layers should be named with `Effect.fn("Service.method")` when
  they are not trivial constants.
- Multi-step runtime flows should use generator syntax, preferably through `Effect.fn`, with explicit
  `return yield*` when raising typed errors.
- Long-running background work should be tied to a scope with `forkScoped`, `forkChild`, a returned
  callback finalizer, or an explicit owner fiber.
- Callback or event emitter bridges must return finalizers and must not leave timer, watcher, child
  process, or promise rejections unmanaged.
- Expected external failures should be mapped to tagged errors at the boundary. Programmer defects
  should not be hidden by broad catch-all recovery.
- Best-effort recovery from external failures should emit structured warnings before returning
  fallback `null`, `[]`, or `void` values. Low-level services that do not own logger context should
  expose a typed failure callback for the caller to log.
- State updates under concurrency should use `Ref.modify` / `Ref.update` instead of get-then-set when
  the update must be atomic.
- Process, filesystem, and terminal integration should prefer Effect platform services when the
  abstraction fits; otherwise the local reason for direct Node APIs should be documented.
- Runtime filesystem side effects should use `FileSystem.FileSystem` and map `PlatformError` to a
  tagged project error. Pure `node:path` string logic may remain direct.
- Runtime HTTP clients should use `effect/unstable/http` and a Node client layer, not direct global
  `fetch`. HTTP/decode failures should map to tagged project errors.
- Runtime JSON parse/stringify boundaries should prefer Effect Schema. Use `Schema.fromJsonString`
  for known JSON strings and `Schema.UnknownFromJsonString` for intentionally arbitrary JSON values.
- Runtime wall-clock reads should use `Clock.currentTimeMillis` instead of `Date.now()` so deadlines,
  emitted events, retries, and stall checks stay test-clock compatible.
- Tests should import from `@effect/vitest`. Effect-native tests should prefer `it.effect`,
  `it.live`, and `layer`; shared `runEffect`-style Promise bridges are not part of the default
  harness and require a documented external API reason.
- Temporary filesystem fixtures should use scoped Effect `FileSystem` helpers rather than
  `Effect.promise` wrappers around `node:fs/promises`.
