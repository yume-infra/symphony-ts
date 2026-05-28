# Standardize real integration harness assets

## Goal

Turn the ad hoc SAY-7/SAY-8 real Linear + Codex acceptance workflow into reusable harness assets
for future real integration validation.

## Problem

Real testing currently depends on hand-written `WORKFLOW.md` files, custom hook snippets, manual
Linear state checks, and manual evidence interpretation. This makes future real-run validation
slower and less comparable across changes.

## Requirements

- Provide reusable workflow templates or documented harness profiles for real Linear/Codex runs.
- Standardize hook behavior for:
  - launch markers;
  - acceptance marker capture;
  - run summary capture;
  - before-remove evidence preservation.
- Document the setup flow for a new Linear issue in the test project.
- Define what evidence is committed versus kept local:
  - committed: templates, guides, redacted summaries, and reusable fixtures;
  - local-only by default: raw Codex sessions, real credentials, and full protocol logs.
- Include safety guidance for protocol event files, optional raw session references, and secret
  redaction.
- Build on `run-summary` artifacts once available.
- Do not define a second evidence format. Harness assertions should consume `run-summary.json`,
  `protocol-events.jsonl`, and redacted fixtures produced by the run-summary task.

## Constraints

- Do not require real credentials for normal unit tests.
- Do not commit raw protocol/session logs by default.
- Do not make the harness depend on the Codex MCP connector; Symphony's configured
  `linear_graphql` path remains the stable real-run channel.

## Acceptance Criteria

- [ ] A new real integration run can be prepared from a template without rewriting hooks by hand.
- [ ] Harness documentation states prerequisites, commands, expected Linear states, and evidence
      locations.
- [ ] Generated evidence includes run summaries and acceptance markers.
- [ ] Raw secrets are not written to committed artifacts.
- [ ] The harness is validated against at least one real Linear issue or a documented dry run.
