# Fakes And Integration

## Test Doubles

Use fakes for deterministic tests:

- fake workflow files/config providers
- fake Linear GraphQL transport
- fake Codex app-server process/protocol stream
- fake filesystem/workspace root where practical
- fake clock/scheduler for retry and stall behavior

Effect services/layers should make these fakes easy to provide.

## Vitest And Effect Helpers

Before runtime implementation, add test helpers that:

- run Effect programs through a single Vitest helper
- provide common test layers explicitly
- expose fake clocks or controllable scheduling for time-dependent behavior
- fail tests with typed error/cause details that point to the violated contract

Do not scatter raw `Effect.runPromise` calls and ad hoc layer setup across test files.

## Real Integration Profile

Real integration tests are recommended before production use but should not silently run in normal
CI without credentials.

Real tests may require:

- `LINEAR_API_KEY`
- isolated Linear project or test issue identifiers
- a real Codex app-server binary
- isolated workspace root

When skipped due to missing credentials or environment, report as skipped. Do not treat an unrun real
integration test as passed.

If a real integration profile is explicitly enabled, failures should fail that job.

## Time-Dependent Tests

Prefer Effect test clocks or controllable scheduler abstractions for polling, retry, timeout, and
stall tests. Avoid real sleeps in deterministic tests.

## Fixtures

Keep protocol payload fixtures narrow and named by behavior. Avoid giant raw payload dumps unless a
bug requires exact reproduction.
