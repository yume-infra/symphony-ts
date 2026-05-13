# Codex App Server

## Protocol Source Of Truth

Use the targeted Codex app-server documentation or generated schema as the protocol source of truth.
Do not hardcode protocol shapes from memory or from stale examples.

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

## Session Handling

- Extract thread ID and turn ID from protocol responses.
- Compose `session_id = "<thread_id>-<turn_id>"`.
- Reuse the same thread for continuation turns inside one worker run.
- Do not resend the original full prompt for continuation turns already in the same thread.

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
