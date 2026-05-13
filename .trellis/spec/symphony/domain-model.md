# Domain Model

## Core Entities

Use these names consistently in code, tests, logs, and docs.

| Entity | Meaning |
| --- | --- |
| `Issue` | Normalized tracker work item used for dispatch and prompt construction. |
| `WorkflowDefinition` | Parsed `WORKFLOW.md`, including config and prompt template. |
| `ServiceConfig` | Typed runtime config after defaults, environment resolution, and validation. |
| `Workspace` | Per-issue filesystem directory under the configured workspace root. |
| `RunAttempt` | One worker attempt for one issue in one workspace. |
| `LiveSession` | Coding-agent session metadata and latest event/usage state. |
| `RetryEntry` | Scheduled retry state for an issue. |
| `OrchestratorState` | Single authority for running, claimed, retrying, completed, and metrics state. |

## Identifiers

- `issue.id`: stable tracker-internal ID, used for maps and tracker lookup.
- `issue.identifier`: human-readable key, used for logs and workspace naming.
- `workspace_key`: sanitized `issue.identifier`; only `[A-Za-z0-9._-]` is allowed.
- `session_id`: `<thread_id>-<turn_id>` from the coding-agent protocol.

## Naming Conventions

- Prefer domain names from `SPEC.md` over local synonyms.
- Use `tracker state` for Linear or tracker workflow states.
- Use `orchestration state` for internal states such as running or retry queued.
- Use `worker` for the runtime unit that prepares a workspace and runs a coding agent.
- Use `agent runner` for the boundary around the Codex app-server client.

## Log Context

Issue-related logs should include:

- `issue_id`
- `issue_identifier`

Coding-agent lifecycle logs should include:

- `session_id`

Logs may include more fields, but these keys are the minimum join points for debugging.
