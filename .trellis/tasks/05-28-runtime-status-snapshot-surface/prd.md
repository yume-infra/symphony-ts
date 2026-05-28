# Expose runtime status snapshot surface

## Goal

Expose current daemon state to an operator while Symphony is running: active workers, retries,
token totals, latest rate-limit data, workflow reload status, and last Codex activity.

## Relationship To Run Summaries

Run summaries are post-run receipts. This task is the live status surface. It should use structured
runtime state, not parse human-readable summaries.

## Requirements

- Reuse `OrchestratorState.snapshot` and workflow runtime snapshot concepts where possible.
- Present at minimum:
  - running issue rows with issue identifier, state, workspace path, turn count, session id, last
    Codex event, and seconds running;
  - retry queue rows with due time, attempt, issue identifier, and reason;
  - aggregate token totals;
  - latest Codex rate limit payload or concise derived fields;
  - last workflow reload error if present.
- Choose the smallest useful surface first. A CLI/status command or structured JSON endpoint is
  acceptable; the selected first surface is CLI JSON output. A full dashboard is not required.
- Back CLI JSON with a daemon-written `.symphony/status/current.json` snapshot file so a separate
  CLI process can inspect state without introducing an HTTP server.
- Write `current.json` atomically: encode with `StatusSnapshotSchema`, write a temporary file such
  as `.tmp-<pid>-<seq>`, then rename it into place.
- Decode status JSON through Effect Schema in the CLI. If decode fails, report a typed status read
  error instead of guessing or partially parsing.
- Keep the status surface read-only.

## Constraints

- Do not block the run-summary task.
- Do not introduce a long-running HTTP server unless explicitly selected in design.
- Do not make runtime correctness depend on this surface.

## Acceptance Criteria

- [ ] Operators can inspect live daemon state without attaching a debugger.
- [ ] The first implementation exposes CLI JSON output suitable for scripts and later UI reuse.
- [ ] The daemon writes `.symphony/status/current.json`, and the CLI reads it for `--json` output.
- [ ] Snapshot file writes are atomic and schema-encoded.
- [ ] CLI status reads are schema-decoded and produce typed read/decode errors.
- [ ] Tests cover empty, running, retrying, and reload-error snapshots.
- [ ] Output is stable enough for later dashboard/harness consumption.
- [ ] Documentation explains the difference between live status and post-run summaries.
