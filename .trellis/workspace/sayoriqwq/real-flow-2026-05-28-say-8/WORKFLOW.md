---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: 8e28f62fb2e9
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
polling:
  interval_ms: 3000
workspace:
  root: workspaces
hooks:
  after_create: |
    mkdir -p ../../events
    printf '{"hook":"after_create","cwd":"%s","ts":"%s"}\n' "$PWD" "$(date -u +%FT%TZ)" >> ../../events/hooks.jsonl
  before_run: |
    mkdir -p ../../events
    printf '{"hook":"before_run","cwd":"%s","ts":"%s"}\n' "$PWD" "$(date -u +%FT%TZ)" >> ../../events/hooks.jsonl
  after_run: |
    mkdir -p ../../events
    if [ -f acceptance-result.txt ]; then cp acceptance-result.txt ../../events/acceptance-result.txt; fi
    printf '{"hook":"after_run","cwd":"%s","ts":"%s","acceptance_file":%s}\n' "$PWD" "$(date -u +%FT%TZ)" "$([ -f acceptance-result.txt ] && printf true || printf false)" >> ../../events/hooks.jsonl
  before_remove: |
    mkdir -p ../../events
    if [ -f acceptance-result.txt ]; then cp acceptance-result.txt ../../events/acceptance-result.before-remove.txt; fi
    printf '{"hook":"before_remove","cwd":"%s","ts":"%s","acceptance_file":%s}\n' "$PWD" "$(date -u +%FT%TZ)" "$([ -f acceptance-result.txt ] && printf true || printf false)" >> ../../events/hooks.jsonl
  timeout_ms: 10000
agent:
  max_concurrent_agents: 1
  max_turns: 2
  max_retry_backoff_ms: 5000
  max_concurrent_agents_by_state:
    Todo: 1
    In Progress: 1
codex:
  command: |
    mkdir -p ../../events
    printf '{"event":"codex_launch","pid":"%s","cwd":"%s","ts":"%s"}\n' "$$" "$PWD" "$(date -u +%FT%TZ)" >> ../../events/codex-launches.jsonl
    unset LINEAR_API_KEY
    tee -a ../../events/codex-protocol-in.jsonl | TRELLIS_DISABLE_HOOKS=1 codex --config features.hooks=false app-server | tee -a ../../events/codex-protocol-out.jsonl
  approval_policy: never
  thread_sandbox: workspace-write
  turn_timeout_ms: 300000
  read_timeout_ms: 15000
  stall_timeout_ms: 0
---
You are the Codex worker launched by symphony-ts for Linear issue {{ issue.identifier }}.

This is a real unattended acceptance task. Do not ask the user for review, input, or approval.
Only work on this exact issue: {{ issue.identifier }} / {{ issue.id }}.

Issue:
- id: {{ issue.id }}
- identifier: {{ issue.identifier }}
- title: {{ issue.title }}
- current state: {{ issue.state }}
- url: {{ issue.url }}
- description: {{ issue.description }}

Required sequence:
1. Move this exact Linear issue to In Progress.
2. In the current working directory, create a file named acceptance-result.txt with exactly this line:
   SYMPHONY_SAY_8_ACCEPTANCE_OK
3. Move this exact Linear issue to Done.
4. Finish with exactly this final marker:
   SYMPHONY_SAY_8_ACCEPTANCE_OK

Use the client-side tool named linear_graphql for the Linear mutations. Do not inspect environment
variables, do not run curl, and do not use shell network calls for Linear.

Use these state ids:
- In Progress: b52852d8-9205-4d7a-8b91-2be6f86b4f7d
- Done: 700b91aa-596e-49df-95ff-414cf8d62ae4

The GraphQL mutation shape is:
mutation UpdateIssueState($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) {
    success
    issue { id identifier state { name } }
  }
}
