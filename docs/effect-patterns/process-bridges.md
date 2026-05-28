# Process Bridges

Use Effect's process modules for subprocess boundaries when the command shape fits the API. The
vendored reference is `repos/effect/ai-docs/src/60_child-process/10_working-with-child-processes.ts`
and the implementation is under `repos/effect/packages/effect/src/unstable/process/`.

## One-Shot Commands

For commands that run once and return output, prefer `ChildProcess.make` with
`ChildProcessSpawner`:

```ts
import * as NodeServices from "@effect/platform-node/NodeServices"
import { Effect, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

const runCommand = Effect.gen(function*() {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(ChildProcess.make("bash", ["-lc", "echo ok"], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe"
  }))

  const output = yield* handle.stdout.pipe(Stream.decodeText(), Stream.mkString)
  const exitCode = yield* handle.exitCode

  return { output, exitCode }
}).pipe(
  Effect.scoped,
  Effect.provide(NodeServices.layer)
)
```

Use this shape for workspace hooks and other bounded shell commands. It gives the process a scoped
finalizer, exposes stdout/stderr as streams, and keeps process startup failures in the Effect error
channel.

## Timeouts

Wrap the scoped process effect with `Effect.timeoutOrElse` when a domain timeout should fail with a
typed error. The timeout interrupts the scoped effect, so the child process finalizer can terminate
the subprocess.

## Interactive Protocols

Interactive protocols that require repeated stdin writes in response to stdout messages need a
dedicated adapter. Prefer this shape:

- create an outbound `Queue<Uint8Array>` and pass `Stream.fromQueue(queue)` as the command `stdin`;
- stream `stdout` through `Stream.decodeText()` / `Stream.splitLines` and enqueue parsed protocol
  messages for the state machine;
- collect diagnostic `stderr` in a bounded `Ref`;
- fork stdout, stderr, and exit-code watchers with `Effect.forkScoped`;
- wrap request/turn deadlines with typed `Effect.timeoutOrElse` failures;
- run the whole process interaction inside `Effect.scoped`, with `NodeServices.layer` provided at
  the integration boundary.

The Codex app-server JSON-RPC bridge uses this queue/stream session adapter. This keeps protocol
state, dynamic tool calls, and event emission inside one Effect program instead of mixing callback
listeners with nested `Effect.runPromise` calls.

Keep direct Node process code only when all of these are true:

- the bridge has a returned finalizer or scoped owner that kills the subprocess;
- all timers are cleared on success, failure, and interruption;
- stdout/stderr listeners cannot leave unhandled promise rejections;
- the reason for not using `ChildProcessSpawner` is recorded in the audit matrix or an ADR.

## References

- `repos/effect/ai-docs/src/60_child-process/10_working-with-child-processes.ts`
- `repos/effect/packages/effect/src/unstable/process/ChildProcess.ts`
- `repos/effect/packages/effect/src/unstable/process/ChildProcessSpawner.ts`
- `repos/effect/packages/platform-node-shared/src/NodeChildProcessSpawner.ts`
- `apps/cli/src/agent-runner/codex.ts`
