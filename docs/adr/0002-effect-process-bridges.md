# ADR 0002: Effect Process Bridges

## Status

Accepted.

## Context

Symphony runs two subprocess categories today:

- workspace hooks such as `after_create`, `before_run`, `after_run`, and `before_remove`;
- the Codex app-server JSON-RPC process.

The vendored Effect v4 beta source provides `effect/unstable/process` with `ChildProcess.make` and
`ChildProcessSpawner`. Official examples use it for command output collection, line streaming,
process handles, scoped lifecycle, and process cleanup.

Workspace hooks match this model directly: they are bounded shell commands with stdout/stderr,
exit-code, and timeout handling. Codex app-server is a longer-lived, bidirectional JSON-RPC
protocol where stdout lines trigger state transitions, dynamic tool calls, and stdin responses.

## Decision

Workspace hook execution uses `ChildProcess.make` and `ChildProcessSpawner`, with `Effect.scoped`
for process lifecycle and `Effect.timeoutOrElse` for typed hook timeouts.

The public `runHook` helper preserves its current no-requirement API by providing
`NodeServices.layer` at the helper boundary. This keeps existing unit tests and direct helper users
simple while still using the Effect process implementation internally.

Codex app-server also uses `ChildProcessSpawner`, but through an interactive protocol adapter:

- an outbound `Queue<Uint8Array>` feeds `stdin` via `Stream.fromQueue`;
- stdout lines are streamed into a protocol-event queue;
- stderr diagnostics are retained in a bounded `Ref`;
- stdout, stderr, and exit-code watchers are forked in the process scope;
- the JSON-RPC state machine stays in Effect and handles dynamic tool calls without nested
  `Effect.runPromise` bridges.

## Consequences

- Workspace hook subprocesses now use Effect-managed scoped finalizers instead of manual
  `child.kill` cleanup.
- Hook stdout/stderr collection is bounded by bytes and covered by tests.
- `NodeServices.layer` is used inside `runHook`; if hook execution becomes a high-volume hot path,
  revisit whether `WorkspaceManagerLive` should close over `ChildProcessSpawner` instead.
- Codex process lifecycle, stdout parsing, stdin writes, dynamic tool calls, and timeout failures now
  run through Effect values. Direct Node subprocess APIs should need a new ADR or audit entry.
- The Codex adapter still uses plain JSON parsing/stringifying at the protocol edge. A future schema
  pass can decide whether Effect Schema should validate protocol messages.

## Evidence

- `repos/effect/ai-docs/src/60_child-process/10_working-with-child-processes.ts`
- `repos/effect/packages/effect/src/unstable/process/ChildProcess.ts`
- `repos/effect/packages/effect/src/unstable/process/ChildProcessSpawner.ts`
- `repos/effect/packages/platform-node-shared/src/NodeChildProcessSpawner.ts`
- `apps/cli/src/workspace/manager.ts`
- `apps/cli/src/workspace/manager.test.ts`
- `apps/cli/src/agent-runner/codex.ts`
- `apps/cli/src/agent-runner/codex.test.ts`
