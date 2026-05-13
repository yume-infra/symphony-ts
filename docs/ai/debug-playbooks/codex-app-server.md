# Codex App Server Debug Playbook

Use this when Codex app-server startup, protocol payloads, dynamic tools, user input, usage, or
rate-limit extraction fails.

## Sources Of Truth

The targeted Codex app-server documentation or generated schema is the protocol source of truth.
`SPEC.md` describes Symphony responsibilities, not the authoritative wire schema.

Use local specs for Symphony-specific requirements:

- `.trellis/spec/external-integrations/codex-app-server.md`
- `.trellis/spec/quality-operations/safety-invariants.md`
- `.trellis/spec/quality-operations/logging-observability.md`
- `SPEC.md` sections 10, 12, 17, and 18 when implementing conformance

## Investigation Order

1. Identify the installed Codex version and targeted app-server command.
2. Inspect current app-server docs or generated schema for the failing payload or event.
3. Verify Symphony launches the app-server from the per-issue workspace path.
4. Verify cwd is also supplied through protocol fields where the targeted protocol supports it.
5. Separate diagnostic stderr handling from protocol stream handling.
6. Check max-line-size and malformed-message behavior for protocol buffering.
7. Verify startup payload fields match the targeted protocol.
8. Verify `thread_id` and `turn_id` extraction and `session_id = "<thread_id>-<turn_id>"`.
9. For continuation turns, verify the same thread is reused and the original full prompt is not
   resent unless the protocol requires it.
10. For dynamic tools, verify only implemented tools are advertised and unsupported calls return a
    structured tool failure instead of stalling.
11. For approvals or user input, verify the runtime follows a documented no-stall policy.
12. Verify usage and rate-limit events are extracted once and reported with stable identifiers.

## Safety Checks

- Coding-agent subprocess cwd must equal the per-issue workspace path.
- Raw secrets must not appear in prompts, tool descriptions, logs, or shell helpers.
- Hook output should be truncated in logs.
- Hook timeouts and app-server timeouts must prevent indefinite hangs.
- Unsupported tool calls must fail structurally.

## Failure Classes To Label

- startup command failure
- protocol schema drift
- malformed protocol message
- unsupported dynamic tool call
- user input or approval stall
- missing thread or turn identity
- duplicate usage or token aggregation
- lost rate-limit payload
- unsafe cwd

## Required Evidence For Updates

When updating this playbook, include:

- installed Codex version or schema source inspected
- failing app-server phase
- exact message class or payload field involved, redacted if needed
- `issue_identifier`, `issue_id`, and `session_id` when available
- assertion, fake protocol fixture, or conformance test added
