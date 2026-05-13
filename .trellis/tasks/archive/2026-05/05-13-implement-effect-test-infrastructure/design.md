# Design: Effect-first Test Infrastructure

## Objective

Create the first real test-support surface for Symphony-ts now that Vitest is wired into the
monorepo. This task should make future runtime features easy to test with Effect programs and fake
boundaries, without implementing the runtime itself.

## Target Files

```text
apps/cli/
  src/
    index.ts
    index.test.ts
  tests/
    support/
      effect.ts
      fixtures.ts
      fakes/
        codex-app-server.ts
        linear-transport.ts
        scheduler.ts
        workspace.ts
```

The exact names may be adjusted during implementation if local imports or lint rules suggest a
cleaner structure.

## Effect Test Helper

Provide one shared helper for running Effect programs in Vitest. The helper should:

- accept an `Effect.Effect<A, E, R>`
- optionally accept a `Layer` or provisioning callback when needed later
- run through `Effect.runPromise`
- convert failures into normal thrown errors with useful inspected Cause/error detail
- keep direct `Effect.runPromise` calls out of individual test files

The helper is test infrastructure, not application runtime. It can use practical Vitest-friendly
throwing behavior while runtime code remains typed and Effect-native.

## Fake Boundary Shape

Because runtime services are not implemented yet, fake files should not define final production
interfaces. Instead, they should provide narrow reusable test utilities and a place for future
service-specific fakes to grow.

Initial fake boundaries:

- `linear-transport.ts`
  - fake GraphQL response queue / handler utility
  - planned use: Linear client tests
- `codex-app-server.ts`
  - fake protocol message stream / script utility
  - planned use: app-server client tests
- `workspace.ts`
  - temporary directory/workspace path helper
  - planned use: workspace manager and hook tests
- `scheduler.ts`
  - manual clock/scheduler placeholder or test clock conventions
  - planned use: retry, timeout, and stall tests

Keep these helpers small. They should not claim to be real implementations of services that do not
exist yet.

## First Test

Add a focused test for current CLI logic:

- `renderGreeting("Symphony")` returns `Hello, Symphony!`

This proves the Vitest path is real and lets the task remove `passWithNoTests`.

## Compatibility

- Root `pnpm verify` must continue to run build, typecheck, test, lint, and knip.
- `pnpm smoke:bin` must still succeed.
- Current CLI behavior stays unchanged.
- No production runtime modules are added.

## Tradeoffs

- A small scaffold now is better than waiting for runtime modules because it locks in test structure
  before broad implementation.
- Avoid heavy fake abstractions now because service interfaces may change once runtime modules are
  designed.
- Keep helpers close to `apps/cli` for now because the repository has only one real package.
