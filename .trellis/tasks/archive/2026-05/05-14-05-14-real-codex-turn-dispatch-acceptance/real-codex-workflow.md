---
tracker:
  kind: linear
  project_slug: symphony-test-8e28f62fb2e9
  api_key: $LINEAR_API_KEY
  active_states:
    - Done
  terminal_states:
    - Closed
polling:
  interval_ms: 600000
workspace:
  root: /var/folders/w8/b0vdr9ld3dsg1dyb06ctbr6c0000gn/T/symphony-real-codex-9QbrIw/workspaces
hooks:
  after_run: "printf 'after_run_utc=%s\n' \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\" > .symphony-after-run"
  timeout_ms: 10000
agent:
  max_concurrent_agents: 1
  max_turns: 1
codex:
  command: "printf 'real_codex_app_server_pid=%s\n' $$ > .real-codex-app-server-launched; exec codex app-server"
  approval_policy: never
  thread_sandbox: read-only
  turn_timeout_ms: 150000
  read_timeout_ms: 10000
  stall_timeout_ms: 0
---
You are running a real Symphony-to-Codex acceptance check for {{ issue.identifier }}: {{ issue.title }}.
Do not inspect files. Do not modify files. Do not run shell commands. Do not ask for user input.
Return a final answer exactly equal to: SYMPHONY_REAL_CODEX_TURN_ACCEPTANCE_OK
