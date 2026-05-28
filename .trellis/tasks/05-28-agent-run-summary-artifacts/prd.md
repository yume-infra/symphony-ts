# Generate agent run summary artifacts

## Goal

Generate durable post-run artifacts that show what a dispatched Codex agent actually did, without
requiring an operator to inspect raw app-server protocol JSONL or reconstruct a run from scattered
hook files.

## Problem

Real SAY-8 validation proved the runtime can dispatch Codex, expose `linear_graphql`, mutate Linear,
write an acceptance marker, run hooks, and clean the workspace. The resulting evidence is still too
fragmented:

- Codex app-server protocol/runtime events;
- workflow-local hook markers;
- structured runtime logs;
- a hand-written evidence summary;
- Linear state visible out-of-band.

Operators need a first-class run artifact that answers: what prompt was sent, what tools were
called, what files changed, what final answer was produced, and what protocol/runtime evidence
Symphony captured.

## Requirements

- Produce a human-readable `run-summary.md` for each completed worker attempt.
- Produce a machine-readable `run-summary.json` with stable fields for tests and future status UI.
- Write both files into the per-run evidence area, not into project docs or hook-local scratch files.
- Introduce a `RunEvidenceService.writeAttempt(...)` boundary that writes the attempt evidence as a
  typed Effect operation, returning `RunEvidenceResult` or failing with `RunEvidenceError`.
- Capture the worker result through `Effect.exit(worker)` at the orchestration boundary before
  reducing it into retry/state bookkeeping. The evidence writer must receive enough `Exit` / `Cause`
  data to distinguish success, typed failure, defect, and interruption.
- Extract summary data from app-server protocol/runtime events instead of relying on ad hoc
  shell parsing in workflow hooks.
- Define schema-backed JSON boundaries for run assets:
  - `RunSummarySchema`;
  - `RunEvidenceEventSchema`;
  - explicit redaction before any unknown protocol diagnostic field is persisted.
- Expand `CodexRuntimeEvent` into a safe, schema-backed union sufficient for summary generation,
  for example protocol notification/request/response, tool call, session started, and turn
  completed events. Summary JSON uses safe structured fields; full raw protocol payloads remain
  local-only diagnostics.
- Do not search local `~/.codex/sessions` as a fallback in the first implementation. If the
  app-server protocol/runtime data does not provide a raw transcript path, record the raw session
  reference as unavailable.
- Use the evidence directory shape
  `<workspace.root>/../evidence/<YYYYMMDD-HHmmss>-<issueIdentifier>-attempt-<n>/`.
- Include at minimum:
  - issue identifier, issue id, issue title, and final tracker state;
  - Linear `stateType` when available, using the Linear naming directly;
  - workspace path and cleanup outcome;
  - Codex thread id, turn id, session id, and raw session reference when provided by app-server
    protocol/runtime data;
  - chronological timeline of prompt receipt, agent messages, tool calls, tool outputs, file
    changes, token updates, and final answer;
  - tool call names, target state changes, success/failure, and concise error text;
  - file changes by path and operation;
  - token totals and run duration;
  - hook outcomes relevant to evidence preservation;
  - run lifecycle and Effect `Exit` / `Cause` classification when applicable.
- Redact raw secrets such as Linear API keys from all generated artifacts.
- Keep raw protocol payloads out of the normal summary unless a field is explicitly safe and useful.
- Keep raw Codex sessions local-only by default if a future protocol version exposes a path.

## Constraints

- Do not make orchestrator decisions depend on summary markdown.
- Do not require a dashboard or HTTP server for this task.
- Do not change the tracker write model; summarize what happened, do not add new write behavior.
- Prefer Effect services, schemas, and testable parsing boundaries over one-off scripts.
- Do not use `Effect.matchEffect` or `catchAll` in the worker evidence path in a way that loses the
  original `Cause`. Retry bookkeeping may store a reduced string, but evidence must preserve the
  classification and typed error details.

## Acceptance Criteria

- [ ] A collector can summarize protocol/runtime events from the SAY-8 shape.
- [ ] Worker completion writes `run-summary.md` and `run-summary.json` into the run evidence area.
- [ ] Runtime integration captures `Effect.exit(worker)` before state/retry reduction and includes
      Effect success, typed failure, defect, or interruption in `run-summary.json`.
- [ ] Evidence writing is represented by a typed `RunEvidenceService.writeAttempt(...)` boundary.
- [ ] `CodexRuntimeEvent` provides structured safe fields for protocol/tool/final-turn evidence
      needed by the summary.
- [ ] Run summary and evidence event JSON are encoded/decoded through Effect Schema.
- [ ] Raw session references are either supplied by protocol/runtime data or explicitly marked
      unavailable; no local session fallback is used.
- [ ] Summaries include both Linear `In Progress` and `Done` `linear_graphql` calls for the SAY-8
      style flow.
- [ ] Secret redaction is covered by tests.
- [ ] Existing structured logging remains intact.
- [ ] Real integration evidence points to generated summaries instead of hand-written-only evidence.
- [ ] `rtk proxy pnpm verify` passes or a narrower agreed gate is documented with reason.
