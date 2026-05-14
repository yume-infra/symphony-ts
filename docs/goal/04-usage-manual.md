# 使用手册

## 前置条件

本机需要：

- Node `>=22.22.1`
- pnpm workspace 已安装依赖
- `codex` CLI 可用，并且能运行 `codex app-server`
- Linear API key
- 一个 Linear project slug
- 该 project 中有可派发状态，比如 `Todo` 或 `In Progress`

本仓库常用命令通过 `rtk proxy pnpm` 跑：

```bash
rtk proxy pnpm verify
rtk proxy pnpm --filter symphony-ts build
rtk proxy pnpm --filter symphony-ts smoke:bin
```

## 配置 Linear API key

推荐在 repo `.env` 中配置：

```bash
LINEAR_API_KEY=...
```

`WORKFLOW.md` 中用变量引用：

```yaml
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
```

不要把真实 key 写进 workflow 或文档。

## 最小 WORKFLOW.md

示例：

```markdown
---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: your-linear-project-slug
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
polling:
  interval_ms: 30000
workspace:
  root: .symphony/workspaces
hooks:
  timeout_ms: 60000
agent:
  max_concurrent_agents: 1
  max_turns: 3
  max_retry_backoff_ms: 300000
codex:
  command: codex app-server
  approval_policy: never
  thread_sandbox: workspace-write
  turn_timeout_ms: 3600000
  read_timeout_ms: 15000
  stall_timeout_ms: 300000
---
You are working on Linear issue {{ issue.identifier }}.

Issue title: {{ issue.title }}
Issue state: {{ issue.state }}

Move the issue to In Progress when you start. Do the requested work in this workspace.
When the task is complete, update the issue to the configured terminal or handoff state.
Do not ask the user for review unless the issue explicitly requires human input.
```

注意：

- `project_slug` 是 Linear project 的 slugId，不是 project name。
- `active_states` 是 Symphony 会捞取和继续处理的状态。
- `terminal_states` 是 Symphony 认为可以 cleanup 的状态。
- tracker writes 通常由 Codex worker 自己用 Linear 工具完成，不是 orchestrator 直接改。

## 启动服务

构建：

```bash
rtk proxy pnpm --filter symphony-ts build
```

启动：

```bash
apps/cli/dist/index.js path/to/WORKFLOW.md
```

如果当前目录就有 `WORKFLOW.md`：

```bash
apps/cli/dist/index.js
```

发布或 link 后，命令形状是：

```bash
symphony-ts [workflow-path]
```

停止：

```text
Ctrl-C
```

## 如何确认服务启动了

启动后应该看到类似：

```text
level=info message=symphony_starting workflow_path=... workspace_root=...
```

如果 workflow reload 成功：

```text
level=info message=workflow_reload_applied workflow_path=...
```

如果 reload 失败：

```text
level=warn message=workflow_reload_rejected workflow_path=... reason=...
```

## 如何确认 issue 被派发

正常派发后会有 Codex event 日志：

```text
level=info message=codex_event issue_id=... issue_identifier=... codex_event=session_started ...
level=info message=codex_event issue_id=... issue_identifier=... codex_event=turn/completed ...
```

关键字段：

- `issue_id`
- `issue_identifier`
- `session_id`
- `codex_event`
- `codex_app_server_pid`
- `codex_total_tokens`

## Workspace 目录

每个 issue 会有一个目录：

```text
<workspace.root>/<sanitized issue identifier>
```

例如 `SAY-7`：

```text
workspaces/SAY-7
```

identifier 中不安全字符会被替换为 `_`。

## Hooks

支持四个 hooks：

- `after_create`
- `before_run`
- `after_run`
- `before_remove`

例子：

```yaml
hooks:
  after_create: |
    printf 'created\n' > .created
  before_run: |
    printf 'before\n' > .before-run
  after_run: |
    printf 'after\n' > .after-run
  before_remove: |
    printf 'remove\n' > ../last-remove-marker
  timeout_ms: 10000
```

语义：

- `after_create` 只在 workspace 新创建时跑。
- `before_run` 每次 worker attempt 前跑。
- `after_run` worker 结束后尽力跑。
- `before_remove` terminal cleanup 删除 workspace 前尽力跑。

## 真实验收怎么跑的

第二轮 goal 的真实验收 workflow 在：

[.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/WORKFLOW.md](../../.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/WORKFLOW.md)

它做了这些事：

1. Linear issue `SAY-7` 从 `Todo` 开始。
2. Symphony 轮询项目 `symphony-test-8e28f62fb2e9`。
3. Symphony 创建 workspace `workspaces/SAY-7`。
4. Symphony 启动真实 `codex app-server`。
5. Codex worker 通过 Linear connector 把 issue 改为 `In Progress`。
6. Codex worker 写入 `acceptance-result.txt`。
7. Codex worker 把 issue 改为 `Done`。
8. Symphony 看到 worker 返回 terminal issue。
9. Symphony 跑 `after_run`。
10. Symphony 跑 `before_remove`。
11. Symphony 删除 workspace。

最终 evidence：

[.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/evidence.json](../../.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/evidence.json)

## 日常验证命令

完整质量门：

```bash
rtk proxy pnpm verify
```

只验证 CLI 包：

```bash
rtk proxy pnpm --filter symphony-ts build
rtk proxy pnpm --filter symphony-ts typecheck
rtk proxy pnpm --filter symphony-ts test
rtk proxy pnpm --filter symphony-ts smoke:bin
```

## 常见问题

### 没有 issue 被派发

检查：

- `tracker.kind` 是否是 `linear`。
- `tracker.api_key` 或 `LINEAR_API_KEY` 是否存在。
- `tracker.project_slug` 是否正确。
- issue state 是否在 `active_states` 中。
- issue 是否已经在 `claimed` / `running` / retry 队列里。
- `Todo` issue 是否有未完成 blocker。

### Codex 没启动

检查：

- `codex` CLI 是否可执行。
- `codex.command` 是否非空。
- 当前 Codex 是否支持 `app-server`。
- workspace path 是否存在。
- 日志里是否有 `codex_not_found`、`response_timeout`、`malformed_message`。

### 卡在 approval

当前实现会自动处理已知 approval / elicitation request：

- command execution approval
- file change approval
- permissions approval
- MCP elicitation approval

如果仍然卡住，说明 Codex app-server 返回了新的 request method，需要在 [apps/cli/src/agent-runner/codex.ts](../../apps/cli/src/agent-runner/codex.ts) 增加协议处理。

### Workspace 没清理

只有 terminal issue 才会 cleanup。

如果 worker 结束后 issue 仍在 `active_states`，orchestrator 会安排 continuation retry，而不是删 workspace。
