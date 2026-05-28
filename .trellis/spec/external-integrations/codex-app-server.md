# Codex App Server

## Protocol Source Of Truth

Use the targeted Codex app-server documentation or generated schema as the protocol source of truth.
Do not hardcode protocol shapes from memory or from stale examples.

Before implementing or changing protocol payloads, generate or inspect the targeted app-server
schema for the installed Codex version. `SPEC.md` describes Symphony responsibilities, not the
authoritative Codex wire schema.

Symphony-specific rules still control:

- workspace cwd selection
- prompt construction
- continuation behavior
- event extraction
- observability
- no-stall policy

## Launch Contract

- Launch `codex.command` with `bash -lc <command>` unless a future project decision changes the
  shell contract.
- Launch from the per-issue workspace path only.
- Supply cwd through protocol fields wherever the targeted protocol accepts it.
- Include issue-identifying metadata when supported.
- Treat Codex config values such as approval and sandbox settings as pass-through values for the
  targeted schema unless a local validator is explicitly added.
- Sanitize runtime-only secrets, including `LINEAR_API_KEY`, from the app-server child-process
  environment. Coding agents should use advertised client-side tools, not raw tracker credentials.
- Use a safe max-line-size policy for protocol buffering.

## Session Handling

- Extract thread ID and turn ID from protocol responses.
- Compose `session_id = "<thread_id>-<turn_id>"`.
- Reuse the same thread for continuation turns inside one worker run.
- Do not resend the original full prompt for continuation turns already in the same thread.
- Keep the app-server subprocess alive across continuation turns inside one worker run when the
  targeted protocol permits it.

## User Input And Approvals

Approval, sandbox, and user-input policy are implementation-defined. The implementation must
document its chosen posture.

No run may stall indefinitely waiting for user input or approval. The runtime must either satisfy,
surface, auto-resolve, or fail according to the documented policy.

## Event Extraction

Extract and emit structured runtime events for:

- session startup
- turn completion
- turn failure/cancellation
- input required
- approval handling
- unsupported tools
- token usage
- rate limits
- malformed/unexpected messages

Keep diagnostic stderr handling separate from protocol stream handling when using stdio transports.

## Dynamic Tool Handling

- Advertise implemented client-side tools during session startup using the targeted protocol.
- For the current Codex schema, advertise `linear_graphql` in `thread/start.dynamicTools`; do not
  assume an existing thread can be retrofitted by prompt text alone.
- Handle supported dynamic tools according to their extension contract.
- Return a targeted-protocol tool failure for unsupported tool names.
- Do not let unsupported tool calls stall the session.

## Seed Debug Playbook

Before `/goal` implementation, create a seed debug playbook for Codex app-server work. It should
start from official docs or generated schema, then record how to inspect protocol drift, startup
payload failures, tool-call failures, usage/rate-limit extraction, and no-stall behavior.
