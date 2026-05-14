# 安全边界与高信任策略

当前 `symphony-ts` 是本机高信任执行模型。它能无人值守地驱动 Codex 和 Linear，但也因此必须清楚边界。

## 关键安全不变量

### 1. Codex subprocess cwd 必须等于 issue workspace

在 [apps/cli/src/agent-runner/codex.ts](../../apps/cli/src/agent-runner/codex.ts) 中，`validateWorkspaceCwd` 检查：

```text
params.cwd === params.workspacePath
```

不满足就返回 `invalid_workspace_cwd`。

目的：

- 防止 coding agent 从 repo root 或任意目录启动。
- 保证每个 issue 的执行边界是自己的 workspace。

### 2. Workspace path 必须在 workspace root 内

在 [apps/cli/src/workspace/manager.ts](../../apps/cli/src/workspace/manager.ts)：

- `isPathInside`
- `assertContained`

会 normalize root 和 candidate path，然后验证 candidate 没有逃逸 workspace root。

目的：

- 防止 path traversal。
- 防止 `before_remove` 删除 workspace root 外的目录。

### 3. Workspace key 要 sanitize

`sanitizeWorkspaceKey` 会把 issue identifier 中不属于 `[A-Za-z0-9._-]` 的字符替换成 `_`。

例如：

```text
team/issue:1 -> team_issue_1
```

目的：

- 让 issue identifier 可以安全变成目录名。
- 避免 slash、colon 等字符改变路径结构。

## Approval 策略

当前实现采用 high-trust unattended policy：

| Codex request | 当前响应 |
| --- | --- |
| `item/commandExecution/requestApproval` | `{ decision: "approve" }` |
| `item/fileChange/requestApproval` | `{ decision: "approve" }` |
| `item/permissions/requestApproval` | session-scoped approve |
| `mcpServer/elicitation/request` | `{ action: "accept", content: {} }` |
| `item/tool/requestUserInput` | fail-fast，不支持 interactive input |

为什么这么做：

- 用户要求默认批准，不要反复询问。
- 真实 Linear connector 会通过 MCP elicitation 问是否允许 `linear_save_issue`。
- 如果不 auto-accept，正常流程无法无人值守完成。

风险：

- Codex worker 可以执行 workflow prompt 允许范围内的本地命令和文件改动。
- 如果 workflow prompt 不可信，这个策略不安全。

适用场景：

- 本机开发。
- 用户信任 workflow、repo 和 Codex worker。
- 目标是自动完成 Linear issue。

不适用场景：

- 多租户服务。
- 运行不可信 issue prompt。
- 需要人工审批每个外部动作的环境。

## User input 策略

当前实现不支持运行中问用户问题。

如果 Codex app-server 发出：

```text
item/tool/requestUserInput
```

Symphony 会：

1. 给 app-server 返回 JSON-RPC error。
2. 让当前 turn 失败为 `turn_input_required`。
3. 由 orchestrator 按失败 retry 语义处理。

目的：

- 避免无人值守服务无限等待。

## Linear API key 边界

Linear API key 的边界：

- workflow 中应写 `$LINEAR_API_KEY`。
- `ConfigResolver` 从 `.env` 或 process env 解析。
- `LinearTransport` 在 HTTP header 中使用。
- 日志 redaction 会处理 `api_key`、`authorization`、`secret` 等 key。

不要：

- 把 raw key 写入 `WORKFLOW.md`。
- 把 raw key 写入 issue description。
- 把 raw key 写进 evidence。

第二轮验收前后已扫描 evidence，没有保存 raw Linear API key。

## Logging 边界

日志需要足够调试，但不能泄漏 secret。

当前 structured logs 包含：

- `issue_id`
- `issue_identifier`
- `session_id`
- `codex_event`
- `codex_app_server_pid`
- token usage
- concise message

当前 redaction：

- key 包含 `token`、`secret`、`api_key`、`authorization` 时会 redact。
- 数字值不会 redact，避免 token usage 计数变成 `[redacted]`。

注意：

- Codex protocol artifact 可能包含 issue text、tool arguments 和 public Linear metadata。
- 不应把包含 secrets 的 prompt 或 tool input 写入 evidence。

## Workspace cleanup 边界

`removeForIssueBestEffort` 的 cleanup 顺序：

```text
assert contained path
if exists:
  run before_remove best-effort
  rm -rf workspace path
```

它会忽略 `before_remove` failure 并继续删除 workspace。

真实验收中，`before_remove` 把 `acceptance-result.txt` 复制到 evidence 后，workspace 被删除。

## Hooks 边界

Hooks 是 workflow 配置中的 shell script。

这意味着：

- hook 权限等同于运行 `symphony-ts` 的本地用户。
- hook 是高信任配置。
- hook 不应该来自不可信输入。

Fatal hooks：

- `after_create`
- `before_run`

Best-effort hooks：

- `after_run`
- `before_remove`

## `linear_graphql` tool 边界

`linear_graphql` 是 Codex session 可请求的 client-side tool。

限制：

- 需要 `tracker.kind == linear`。
- 需要配置 Linear auth。
- query 必须非空。
- 只能有一个 GraphQL operation。
- variables 必须是 object。

它返回 structured success/failure，不直接抛给 app-server。

它使用 Symphony runtime config 中的 Linear auth，所以 Codex worker 不需要读取 raw API key。

## 当前高信任实现的实际含义

如果你启动一个 workflow：

```bash
apps/cli/dist/index.js WORKFLOW.md
```

你等价于授权：

- Symphony 读取 Linear project issue。
- Codex 在 per-issue workspace 中运行。
- Codex 通过可用 Linear connector 或 `linear_graphql` 改 issue。
- 已知 approval request 自动批准。
- hooks 执行 workflow 中的 shell scripts。

这正是无人值守执行 Linear issue 的目标，但不是低权限沙箱。

## 后续可加固方向

可以后续增加：

- approval policy profile：`trusted` / `manual` / `deny-external`。
- per-tool allowlist。
- Linear mutation allowlist。
- command execution allowlist。
- workspace size / file count guard。
- protocol artifact redaction pass。
- durable audit log。
- external terminal transition 的 explicit interruption + finalizer cleanup。
