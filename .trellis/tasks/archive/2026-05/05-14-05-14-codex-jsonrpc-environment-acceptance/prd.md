# Real Codex app-server environment acceptance

## Goal

Fix and verify the Symphony Codex app-server boundary against the real local codex app-server JSON-RPC protocol discovered during environment acceptance.

## Confirmed Facts

- `codex --version` reports `codex-cli 0.130.0`.
- `codex app-server --help` succeeds and exposes the app-server command.
- `codex app-server generate-json-schema --out <dir>` succeeds.
- A real `initialize` JSON-RPC probe succeeds and returns `userAgent`, `codexHome`, and platform data.
- The current Symphony live client sends `{ "type": "turn_start", ... }`, and real `codex app-server`
  rejects it with `Failed to deserialize JSONRPCMessage`.
- The generated Codex app-server schema for this installed version uses line-delimited JSON-RPC
  with methods including `initialize`, `thread/start`, `thread/resume`, and `turn/start`.
- The generated `ThreadStartParams` / `TurnStartParams` do not expose a direct `tools` field in this
  Codex version; dynamic tool requests are represented as server requests with method
  `item/tool/call`.

## Requirements

- Replace the live Codex app-server process boundary with the installed Codex JSON-RPC protocol.
- Send valid `initialize` client identity/capabilities before thread/turn requests.
- Start a new thread with `thread/start` when no thread id is provided; resume with `thread/resume`
  when a thread id is provided.
- Start turns with `turn/start`, including the rendered prompt as text input and the per-issue cwd.
- Extract `threadId`, `turn.id`, token usage, rate-limit payloads, and terminal turn status from
  JSON-RPC responses/notifications.
- Keep subprocess stdout protocol handling separate from stderr diagnostics.
- Keep cwd validation before launching the subprocess.
- Handle server requests without stalling:
  - `item/tool/call` routes `linear_graphql` and returns structured success/failure output.
  - unsupported dynamic tools return protocol-shaped failure output.
  - user input / approval requests fail or auto-resolve according to the documented first-pass
    no-stall policy.
- Preserve deterministic fake tests for the Codex boundary.
- Add real environment acceptance evidence that exercises the actual local `codex app-server`
  protocol without triggering uncontrolled repository mutation.

## Acceptance Criteria

- [ ] Unit tests cover JSON-RPC initialization, thread start, turn start, turn completion, token/rate
      extraction, unsupported dynamic tool response, `linear_graphql` response, and user-input
      no-stall behavior.
- [ ] `rtk proxy pnpm --filter symphony-ts test -- agent-runner` passes.
- [ ] `rtk proxy pnpm --filter symphony-ts typecheck` passes.
- [ ] `rtk proxy pnpm verify` passes.
- [ ] `rtk proxy pnpm --filter symphony-ts smoke:bin` passes.
- [ ] Real Linear `.env` probe remains green.
- [ ] Real local Codex app-server JSON-RPC probe remains green.
- [ ] Real controlled `symphony-ts` environment acceptance starts with real Linear config and does
      not report protocol deserialization failures.

## Notes

- The task is a real-integration follow-up to the first-pass runtime commit, not a broad runtime
  rewrite.
- Do not change `.trellis/spec/` unless explicitly requested; record task-specific decisions here.
