# Acceptance Audit

## Objective

Verify that a real Linear example issue is dispatched by `symphony-ts` to the real local
`codex app-server`, that a real Codex turn completes, and that the run leaves auditable evidence.

## Evidence Files

- `real-codex-dispatch-evidence.json`
- `real-codex-workflow.md`

## Prompt-To-Artifact Checklist

| Requirement | Evidence | Status |
| --- | --- | --- |
| Real Linear example issue is used | `real-codex-dispatch-evidence.json` records Linear status `200`, viewer `qwq sayori`, candidate count `2`, and selected issue `SAY-5` / `哈哈` / `Done`. | Pass |
| Dispatch goes through built `symphony-ts` | Evidence log tail contains `symphony_starting` with the temporary workflow path and workspace root. | Pass |
| A per-issue workspace is created | Evidence records `workspaceEntries: ["SAY-5"]` and `completedWorkspace: "SAY-5"`. | Pass |
| Real local `codex app-server` is launched | Workflow command is `printf ... > .real-codex-app-server-launched; exec codex app-server`; workspace evidence contains `.real-codex-app-server-launched` with PID `68794`. | Pass |
| A real Codex turn completes | `after_run` only runs after `AgentRunner` observes Codex run completion and unwinds the attempt; evidence contains `.symphony-after-run` with UTC timestamp `2026-05-14T03:34:22Z`. | Pass |
| No protocol deserialization failure | Evidence has `protocolDeserializationFailed: false`; log tail contains no `Failed to deserialize JSONRPCMessage`. | Pass |
| No poll failure | Evidence has `pollTickFailed: false`. | Pass |
| No user-input stall/failure | Evidence has `userInputRequired: false`. | Pass |
| No raw Linear API key persisted | Artifact scan only found `api_key: $LINEAR_API_KEY` in `real-codex-workflow.md`; no raw token was present. | Pass |

## Residual Risk

- The current runtime does not persist the final assistant text from the app-server turn. The
  completion proof is therefore the `after_run` hook marker, which is downstream of
  `CodexAppServerClient.runTurn` returning successfully after a terminal app-server turn signal.

## Result

Accepted.

