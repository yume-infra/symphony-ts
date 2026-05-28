# ADR 0008: Effect Clock Boundaries

## Status

Accepted.

## Context

The runtime previously used `Date.now()` in long-running Effect programs for
poll snapshots, Codex protocol response deadlines, and emitted Codex runtime
event timestamps. Those calls were syntactically valid, but they bypassed
Effect's `Clock` service and made time behavior less visible to the test
harness.

The pinned Effect v4 beta source and `@effect/vitest` examples use the Effect
clock plus `TestClock` for deterministic time-dependent tests.

## Decision

Runtime wall-clock reads use `Clock.currentTimeMillis`.

This applies to:

- orchestrator poll snapshot time in `startSymphony`;
- Codex JSON-RPC response deadline calculations;
- emitted Codex runtime event timestamps.

Tests that intentionally need live time should use `it.live`; otherwise tests
can use the Effect test environment and `TestClock`.

## Consequences

- Runtime time reads are now part of the Effect environment.
- Future timeout, retry, stall, and event timestamp tests can use virtual time
  without sleeping.
- Direct `Date.now()` in runtime source requires an audit note explaining why
  the Effect clock is not appropriate.

## Evidence

- `repos/effect/ai-docs/src/09_testing/10_effect-tests.ts`
- `repos/effect/packages/effect/test/Stream.test.ts`
- `repos/effect/packages/effect/test/ScopedCache.test.ts`
- `apps/cli/src/app.ts`
- `apps/cli/src/agent-runner/codex.ts`
