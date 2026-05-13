# Logging Observability

## Required Context

Issue-related logs must include:

- `issue_id`
- `issue_identifier`

Coding-agent lifecycle logs must include:

- `session_id`

## Message Style

Use stable key=value phrasing where practical. Include:

- action
- outcome
- concise reason on failure
- issue/session identifiers when applicable

Avoid logging:

- raw auth tokens
- full secrets
- large protocol payloads by default
- signed URLs unless needed for debugging and safe to expose

## Runtime Snapshot

If a snapshot/status surface is implemented, it should derive from orchestrator state and not affect
correctness.

Recommended fields:

- running sessions
- retry queue
- token totals
- active runtime seconds
- latest rate-limit state

## Debugging Direction

Future debug playbooks should trace from `issue_identifier` to `issue_id` to `session_id`. This
matches the useful pattern in OpenAI Symphony's `.codex/skills/debug`, but paths and commands must
be adapted to this TypeScript project.
