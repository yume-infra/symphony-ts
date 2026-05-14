# Design

## Scope

Replace the live Codex app-server transport in `apps/cli/src/agent-runner/codex.ts` with the
installed Codex 0.130.0 JSON-RPC protocol while preserving the public `CodexAppServerClient` service
shape and deterministic fake coverage.

## Protocol Shape

Observed generated-schema contract:

- stdin/stdout are line-delimited JSON-RPC messages.
- client requests include `{ id, method, params }`.
- server responses include `{ id, result }` or `{ id, error }`.
- server notifications include `{ method, params }`.
- server requests include `{ id, method, params }` and require a client response.

Startup sequence:

1. Send `initialize` with `clientInfo` and `experimentalApi: true`.
2. If `params.threadId` is null, send `thread/start` with cwd, approval/sandbox pass-through, and
   issue-identifying service metadata.
3. If `params.threadId` is not null, send `thread/resume`.
4. Send `turn/start` with the returned/resumed `threadId`, cwd, prompt text, approval policy, and
   sandbox policy.
5. Process notifications and server requests until `turn/completed` for the active turn.

## Event Mapping

- `thread/start` or `thread/resume` result -> `session_started` once a turn id is known.
- `turn/started` and `turn/start` response establish `turnId`.
- `thread/tokenUsage/updated` maps to token usage totals.
- `account/rateLimits/updated` maps to rate-limit payload.
- `turn/completed` with `turn.status == "completed"` returns success.
- `turn/completed` with `failed` / `interrupted` returns `turn_failed` / `turn_cancelled`.
- `error` notification for the active turn fails the run.

## Dynamic Tools

The current generated `ThreadStartParams` / `TurnStartParams` do not expose a direct dynamic tool
advertisement field. The client still supports the server request method `item/tool/call`:

- `tool == "linear_graphql"` executes through the existing `executeLinearGraphQLTool`.
- unsupported tools return `{ success: false, contentItems: [...] }` instead of stalling.

If a future Codex schema adds an explicit dynamic-tool advertisement field, add it where the schema
defines it and update this task's evidence.

## No-Stall Policy

First-pass environment acceptance keeps the existing posture:

- user input requests fail the Codex turn with `turn_input_required`
- command/file-change/permission approval requests are rejected structurally
- unsupported server requests fail structurally rather than hanging

## Compatibility

The fake script helper will model JSON-RPC messages so unit tests exercise the same framing as the
live process. Public orchestrator/agent runner APIs stay stable.

