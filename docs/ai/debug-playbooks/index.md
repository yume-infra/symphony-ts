# Debug Playbooks

These are seed playbooks. They record entry points and investigation order; they do not pretend to
capture lessons the project has not learned yet.

## Playbooks

| Playbook | Use When |
| --- | --- |
| [Effect And tsgo](./effect-tsgo.md) | Effect code, `@effect/tsgo`, native-preview, or type diagnostics fail. |
| [Codex App Server](./codex-app-server.md) | App-server startup, protocol payloads, dynamic tools, user input, usage, or rate-limit events fail. |
| [Linear Integration](./linear-integration.md) | Linear queries, normalization, auth, fake/real behavior, or `linear_graphql` fail. |
| [Orchestrator Runtime](./orchestrator-runtime.md) | Dispatch, retries, reconciliation, cancellation, workspace cleanup, or stalls fail. |

## Common Trace Keys

Use stable identifiers when debugging issue-related runtime behavior:

- `issue_identifier`: human-readable tracker key
- `issue_id`: tracker-internal issue ID
- `session_id`: `<thread_id>-<turn_id>` from the Codex app-server protocol

Debug paths should trace from `issue_identifier` to `issue_id` to `session_id` where the runtime has
those values.

## Living Update Template

When a real issue teaches a durable lesson, update the relevant playbook with:

```md
## YYYY-MM-DD: Short Symptom

- Symptom:
- Root cause:
- Failed fixes and why:
- Correct investigation order:
- Test or assertion added:
- Spec or checklist update needed:
```

Keep updates short and operational. If the lesson changes a durable project contract, update the
appropriate `.trellis/spec/` file only when the user has approved that scope.

## Safety Rules

- Do not print raw secrets or auth tokens.
- Do not paste large protocol payloads unless the exact payload is required to reproduce a bug.
- Redact signed URLs unless they are safe to expose and needed for debugging.
- Prefer deterministic fakes before real external integrations.
- Do not create shell helpers that expose Linear tokens to coding agents.
