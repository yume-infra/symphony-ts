# Real Codex turn dispatch acceptance

## Goal

Verify a real Linear example issue dispatches through symphony-ts to the real local codex app-server and completes a minimal Codex turn with auditable evidence.

## Requirements

- Use a real Linear issue from the configured `symphony-test-8e28f62fb2e9` project as the dispatch
  candidate.
- Run the built `symphony-ts` CLI against a temporary workflow and isolated workspace root.
- Use the real local `codex app-server` executable for the worker turn, not the JSON-RPC fake.
- Keep the task minimal and low-risk: instruct Codex not to modify files or run commands unless
  necessary, use a disposable workspace root, and use `max_turns: 1`.
- Capture auditable evidence for:
  - Linear issue selected
  - workflow path and workspace root
  - real Codex command launch
  - worker completion after `turn/completed`
  - absence of protocol deserialization failures and poll failures

## Acceptance Criteria

- [ ] `symphony-ts` starts with the temporary real-integration workflow.
- [ ] A real Linear issue is selected and a per-issue workspace is created.
- [ ] The configured command execs `codex app-server` and writes a launch marker before handing over
      to the real Codex app-server.
- [ ] The `after_run` hook runs, proving `AgentRunner` observed a completed Codex turn and unwound
      the worker attempt.
- [ ] The run output does not contain `Failed to deserialize JSONRPCMessage`, `poll_tick_failed`, or
      `turn_input_required`.
- [ ] Evidence is recorded in the task directory without raw Linear API keys.

## Notes

- This task intentionally performs a real Codex model turn. It may take longer than fake protocol
  acceptance and may consume normal Codex/API quota.
