# ADR 0004: Effect Vitest Harness

## Status

Accepted.

## Context

The test suite used plain Vitest plus a custom `runEffect` helper. That helper
kept Effect failures readable by running through `Effect.exit`, but it did not
give tests the official Effect test environment or a standard path to
`TestClock`, `TestConsole`, property tests, and shared test layers.

The vendored Effect v4 beta docs and source provide `@effect/vitest`.
`@effect/vitest@4.0.0-beta.66` is published and peers on `effect@^4.0.0-beta.66`,
matching this repository's active baseline. The default npm `latest` tag still
points at `0.29.0`, which peers on Effect v3, so the dependency must be pinned
through the workspace catalog.

## Decision

The project uses `@effect/vitest@4.0.0-beta.66` as the default test import for
Effect-aware tests.

Test files import `describe`, `expect`, and `it` from `@effect/vitest` instead
of `vitest`. Effect-native tests should prefer `it.effect(...)`,
`it.live(...)`, and `layer(...)` from `@effect/vitest`.

The original migration allowed a temporary shared `runEffect` bridge while
module tests moved off plain Promise wrappers. That bridge has now been removed;
new Promise bridges should be file-local exceptions for external harness APIs
that cannot be expressed as `it.effect` or `it.live`.

The workspace trust-policy allowlist includes `@effect/vitest@4.0.0-beta.66`,
matching the existing Effect v4 beta package exceptions.

## Consequences

- New tests can use `TestClock` without sleeping in real time.
- Effect failures stay typed in the Effect channel and can be asserted with
  `Effect.flip(...)` or `Effect.exit(...)`.
- The catalog prevents accidental installation of the v3-peered `latest`
  package.
- Shared Promise wrappers are not part of the default harness surface.

## Evidence

- `repos/effect/ai-docs/src/09_testing/10_effect-tests.ts`
- `repos/effect/packages/vitest/package.json`
- `repos/effect/packages/vitest/src/index.ts`
- `repos/effect/packages/vitest/src/internal/internal.ts`
- `apps/cli/tests/support/effect.test.ts`
