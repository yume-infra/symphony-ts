# Execution observability and orchestration assets lead implementation plan

## Ordered Plan

1. Complete `05-28-agent-run-summary-artifacts`.
   - Define summary JSON schema.
   - Define `RunEvidenceService.writeAttempt(...)`.
   - Capture worker `Effect.exit(...)` before reducing state/retry bookkeeping.
   - Expand `CodexRuntimeEvent` into a safe schema-backed event union.
   - Implement parser/collector.
   - Write markdown and JSON artifacts.
   - Validate against SAY-8 style session data.
2. Complete `05-28-terminal-draining-semantics`.
   - Write ADR/spec decision.
   - Lock the three exit models: `completed`, `canceled`, and `terminated`.
   - Choose built-in Linear state type behavior and the `completed` drain timeout.
   - Define fiber/control-handle ownership for interrupting running workers.
   - Decide whether implementation follows immediately or becomes a separate code task.
3. Complete `05-28-runtime-status-snapshot-surface`.
   - Implement CLI JSON backed by `.symphony/status/current.json`.
   - Use atomic snapshot file writes and Schema decode on CLI reads.
   - Reuse existing snapshot state.
   - Link completed runs to summaries where available.
4. Complete `05-28-real-integration-harness-assets`.
   - Extract reusable workflow/hook template.
   - Document real Linear issue setup and evidence policy.
   - Validate with a real or documented dry-run profile.

## Review Gates

- Do not start status or harness implementation until run-summary artifact shape is reviewed.
- Do not change terminal cleanup behavior until the terminal-draining decision is reviewed.
- Each child task should leave its own verification evidence and spec updates.
- Do not connect run-summary writing to runtime cleanup until `Effect.exit(...)`, evidence-before-cleanup,
  and Codex event union boundaries are defined.

## Decided Direction

- Run-summary path: write `run-summary.md` and `run-summary.json` into
  `<workspace.root>/../evidence/<YYYYMMDD-HHmmss>-<issueIdentifier>-attempt-<n>/`.
- Run-summary boundary: use a typed `RunEvidenceService.writeAttempt(...)`; evidence writing failure
  prevents workspace removal and leaves the workspace for investigation.
- Effect cause reporting: capture `Effect.exit(worker)` at the orchestrator boundary. Do not lose
  `Cause` details before the evidence writer classifies success, typed failure, defect, or
  interruption.
- Protocol events: expand `CodexRuntimeEvent` into a schema-backed safe union before relying on it
  for summaries.
- Raw session reference: use only app-server protocol/runtime data in the first implementation.
  Record unavailable when the protocol/runtime data does not provide a raw transcript path; do not
  search local Codex session directories.
- Terminal defaults: use Linear state type naming directly. `completed` means `completed`;
  `canceled` means `canceled`; do not introduce a conversion layer.
- Completed timeout: use a 90 second grace window before a stuck drain escalates to `terminated`.
- Linear state source: add `Issue.stateType` from Linear `state { name type }`; workflow state-name
  lists remain compatibility, not the primary Linear semantic source.
- Explicit kill: document `terminated` semantics now; implement the `symphony kill` command as a
  separate follow-up unless deliberately pulled forward.
- Status surface: first implementation is CLI JSON backed by a daemon-written
  `.symphony/status/current.json` snapshot file, written atomically and decoded through Schema.
- Harness evidence policy: commit templates, guides, redacted summaries, and reusable fixtures; keep
  raw Codex sessions, real credentials, and full protocol logs local by default.

## Remaining Design Points

- Decide whether custom non-Linear tracker states need workflow-level mapping configuration in the
  first implementation.
- Define cleanup/archive mechanics for the case where partial evidence preservation itself fails.

## Validation Baseline

- Use targeted package tests while iterating.
- Use `rtk proxy pnpm verify` before merging child tasks that touch runtime behavior.
- For documentation-only child tasks, run `git diff --check` and any relevant markdown checks if
  introduced.
