# First-pass Symphony Runtime Design

## Architecture

Implement the runtime inside `apps/cli/src` with explicit module boundaries:

```text
apps/cli/src/
  index.ts
  cli/
  domain/
  workflow/
  config/
  tracker/
  workspace/
  prompt/
  agent-runner/
  client-tools/
  orchestrator/
  observability/
  platform/
```

The CLI entrypoint parses only the optional `workflow-path`, provides `NodeServices.layer` plus the
application live layer, and runs the long-lived service with `NodeRuntime.runMain`.

## Effect Boundaries

- Service contracts use `Context.Service`.
- Live implementations are exported as `Layer` values.
- Tests provide fake layers rather than mocking internals.
- Expected failures use `Data.TaggedError`.
- Long-running loops use fibers/scopes/finalizers so process interruption can release resources.
- Runtime state is owned by one orchestrator state service using Effect state primitives.

## Workflow And Config

`WorkflowLoader` selects the explicit path or `./WORKFLOW.md`, reads the file, parses optional YAML
front matter, and returns `{ config, promptTemplate }`.

First-pass YAML support will be intentionally small but enough for the documented workflow schema:
maps, arrays, strings, block strings, numbers, booleans, nulls, and comments. If this becomes too
brittle, the implementation should add a YAML dependency through the normal approval path rather
than ad hoc string parsing beyond the task scope.

`ConfigResolver` applies defaults, resolves allowed `$VAR` references, expands `~`, resolves
relative workspace roots relative to the workflow file directory, normalizes state keys, ignores
invalid per-state concurrency entries, and validates dispatch preconditions.

Dynamic reload is represented as a workflow runtime service with last-known-good state. It watches
the workflow file and also reloads defensively before dispatch. Invalid reloads update an
operator-visible error field/log and keep the previous effective config.

## Tracker

`TrackerClient` exposes:

- `fetchCandidateIssues`
- `fetchIssuesByStates`
- `fetchIssueStatesByIds`

`LinearTrackerClient` depends on a `LinearTransport` service. The live transport sends GraphQL HTTP
requests to the configured endpoint with the configured token. Tests use deterministic queued
responses.

Normalization maps Linear payloads to the `Issue` domain model, lowercases labels, parses dates,
normalizes priority, derives blockers from inverse `blocks` relations, and rejects missing required
fields as malformed/ineligible depending on boundary.

## Workspace

`WorkspaceManager` owns path sanitization, containment checks, create/reuse, hook execution, and
cleanup. Hooks run through a shell command service with workspace cwd and timeout. Hook output is
truncated for logs. Cleanup validates containment before removal.

The workspace population strategy is implementation-defined and first-pass minimal: create/reuse the
directory, then rely on hooks for repository checkout/bootstrap.

## Prompt Rendering

`PromptRenderer` supports strict interpolation for the first pass:

- `{{ issue.field }}`
- nested fields such as `{{ issue.blocked_by.0.identifier }}`
- `{{ attempt }}`
- simple loops if needed for labels/blockers

Unknown variables and unsupported filters fail with typed render errors. The renderer may expand as
tests reveal the needed syntax, but strictness is more important than accepting broad templating
silently.

## Agent Runner And Codex Boundary

`AgentRunner` composes workspace, prompt rendering, hooks, and `CodexAppServerClient`.

The app-server client boundary is protocol-shaped and fake-first:

- live launch invokes `bash -lc <codex.command>` with cwd equal to workspace path
- JSON-line protocol parsing/writing is isolated
- read and turn timeouts return typed errors
- user-input-required events fail the run immediately under the documented first-pass posture
- command/file approval events are auto-acknowledged only if the targeted protocol fixture supports
  it; otherwise they fail structurally
- unsupported tool calls return structured tool failures

Because the exact Codex app-server schema may drift, tests will target the local boundary and fake
protocol fixtures. Real schema inspection or app-server smoke can be added when needed, but normal
verification must not require live Codex credentials.

## Client Tools

`linear_graphql` is implemented outside orchestrator business logic. It validates input, rejects
empty/multiple operations, requires object variables, calls the same Linear transport/auth boundary,
and returns structured success/failure results without exposing tokens.

## Orchestrator

The orchestrator owns state and all state transitions:

- startup validation
- terminal workspace cleanup
- immediate poll tick
- repeated polling at effective interval
- reconcile before dispatch
- candidate sorting and eligibility
- claimed/running invariants
- worker fiber launch and result handling
- continuation retry after normal exit
- failure retry with capped exponential backoff
- stall detection and cancellation
- active/terminal/non-active tracker reconciliation
- internal snapshot

The snapshot is a synchronous service/test boundary, not a UI or HTTP API.

## Observability

Structured logs use stable key=value messages and avoid secrets. Issue-related logs include
`issue_id` and `issue_identifier`; session logs include `session_id`.

First-pass log sink is console/stderr via Effect logging/Console. If a later file sink is added, sink
failure must not crash the orchestrator.

## Explicit First-pass Posture

- Target environment: trusted local/dev environment with host-level responsibility for stronger
  isolation.
- Workspace containment and cwd checks are enforced by Symphony.
- Coding-agent approval/sandbox config is pass-through from workflow config or defaults.
- User-input-required signals fail the run instead of waiting indefinitely.
- Tracker writes remain agent/tool behavior, not orchestrator business logic.

## Deferred Items

Deferred because `SPEC.md` and Trellis specs label them optional/recommended/extension or future
work:

- HTTP server, dashboard, and JSON REST API.
- Human-readable status surface.
- SSH worker extension.
- Persisted retry/session metadata across restarts.
- First-class orchestrator tracker writes.
- Non-Linear tracker adapters.
