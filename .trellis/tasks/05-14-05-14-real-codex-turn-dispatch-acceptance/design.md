# Design

## Scope

Run an end-to-end real integration profile without code edits:

Linear test project -> `symphony-ts` scheduler/runner -> temporary workspace -> real local
`codex app-server` -> one completed Codex turn.

## Safety Shape

- Use a temporary workflow and workspace root outside the repository.
- Set `agent.max_turns: 1`.
- Use a prompt that asks Codex to only return a short final response and not modify files.
- Use `codex.approval_policy: never` and `codex.thread_sandbox: read-only`.
- Use a wrapper command that writes `.real-codex-app-server-launched` in the disposable workspace and
  then `exec codex app-server`; the protocol process is still the real local Codex app-server.
- Use `after_run` to write `.symphony-after-run`, which only runs after the Codex turn effect
  completes and runner cleanup reaches the hook.

## Evidence

The acceptance runner should write an evidence JSON file in this task directory with:

- selected Linear issue identifier/title/state
- temporary workflow path and workspace root basename
- workspace entries
- marker booleans and marker file contents
- process exit mode after controlled shutdown
- log tail
- explicit booleans for protocol deserialization failure, poll failure, and user-input failure

