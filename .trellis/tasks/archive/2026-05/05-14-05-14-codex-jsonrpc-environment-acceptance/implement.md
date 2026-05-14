# Implementation Plan

## Checkpoint 1: Planning And Task Activation

- [x] Discover real Linear/Codex environment status.
- [x] Generate/inspect Codex app-server schema.
- [x] Record PRD/design/implementation plan.
- [x] Start Trellis task.
- [x] Load `trellis-before-dev` before code edits.

## Checkpoint 2: JSON-RPC Fake Boundary

- [x] Update fake app-server script helper to send/receive JSON-RPC messages.
- [x] Update Codex boundary unit tests for initialize/thread/turn flow.
- [x] Cover server requests for dynamic tools and user input.

Validation:

```bash
rtk proxy pnpm --filter symphony-ts test -- agent-runner
```

## Checkpoint 3: Live Process Boundary

- [x] Replace live process `turn_start` message with JSON-RPC `initialize`, `thread/start` or
      `thread/resume`, and `turn/start`.
- [x] Handle JSON-RPC responses, notifications, server requests, malformed messages, stderr, and
      process exits.
- [x] Preserve cwd validation and timeout cleanup.

Validation:

```bash
rtk proxy pnpm --filter symphony-ts test -- agent-runner
rtk proxy pnpm --filter symphony-ts typecheck
```

## Checkpoint 4: Real Environment Acceptance

- [x] Re-run real Linear `.env` read probe.
- [x] Re-run real Codex `initialize` JSON-RPC probe.
- [x] Run controlled `symphony-ts` environment acceptance with a real Linear config and no
      uncontrolled worker mutation.
- [x] Run full repository verification and smoke bin.

Validation:

```bash
rtk proxy pnpm verify
rtk proxy pnpm --filter symphony-ts smoke:bin
```

## Notes

- Current Codex 0.130.0 schema lacks a direct `tools` field in thread/turn start params. Do not
  invent one; support `item/tool/call` and record the schema limitation.
- Avoid printing raw Linear tokens in commands, logs, or task artifacts.
