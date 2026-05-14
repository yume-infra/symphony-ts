# 关键模块及代码解析

## 模块地图

| 模块 | 文件 | 责任 |
| --- | --- | --- |
| CLI entry | [index.ts](../../apps/cli/src/index.ts) | 用 `NodeRuntime.runMain` 启动 Effect CLI。 |
| CLI command | [cli/command.ts](../../apps/cli/src/cli/command.ts) | 定义 `symphony-ts [workflow-path]`。 |
| App layer | [app.ts](../../apps/cli/src/app.ts) | 装配 live services，运行主循环。 |
| Workflow loader | [workflow/loader.ts](../../apps/cli/src/workflow/loader.ts) | 读取 `WORKFLOW.md`，拆 front matter 和 prompt body。 |
| Workflow runtime | [workflow/runtime.ts](../../apps/cli/src/workflow/runtime.ts) | 保存 effective config，支持 reload/watch。 |
| Config resolver | [config/resolve.ts](../../apps/cli/src/config/resolve.ts) | defaults、env、path、typed config、dispatch validation。 |
| Orchestrator runtime | [orchestrator/runtime.ts](../../apps/cli/src/orchestrator/runtime.ts) | poll tick、reconcile、retry、dispatch、worker result 收口。 |
| Orchestrator state | [orchestrator/state.ts](../../apps/cli/src/orchestrator/state.ts) | in-memory state、eligibility、retry math、token totals。 |
| Agent runner | [agent-runner/runner.ts](../../apps/cli/src/agent-runner/runner.ts) | workspace + prompt + Codex turn loop。 |
| Codex client | [agent-runner/codex.ts](../../apps/cli/src/agent-runner/codex.ts) | 真实 Codex app-server JSON-RPC client。 |
| Linear tracker | [tracker/linear.ts](../../apps/cli/src/tracker/linear.ts) | Linear GraphQL transport、queries、normalization。 |
| Client tool | [client-tools/linear-graphql.ts](../../apps/cli/src/client-tools/linear-graphql.ts) | Codex session 内可用的 `linear_graphql` tool。 |
| Workspace | [workspace/manager.ts](../../apps/cli/src/workspace/manager.ts) | workspace path、hooks、cleanup、安全 containment。 |
| Prompt | [prompt/render.ts](../../apps/cli/src/prompt/render.ts) | strict template render。 |
| Logging | [observability/logging.ts](../../apps/cli/src/observability/logging.ts) | structured key=value logs 和 secret redaction。 |

## CLI 层

[apps/cli/src/index.ts](../../apps/cli/src/index.ts) 使用 Effect v4 beta 的当前项目约定：

- `effect/unstable/cli/Command`
- `@effect/platform-node/NodeRuntime`
- `@effect/platform-node/NodeServices`
- `NodeRuntime.runMain`

它没有业务逻辑，只把 command 交给 NodeRuntime。

[apps/cli/src/cli/command.ts](../../apps/cli/src/cli/command.ts) 定义：

- 一个 optional path argument：`workflow-path`。
- 执行体：`startSymphony().pipe(Effect.provide(AppLive(selectedWorkflowPath)))`。

这让 CLI 保持薄入口，符合项目说明。

## App layer

[apps/cli/src/app.ts](../../apps/cli/src/app.ts) 有两个核心导出：

- `AppLive(workflowPath)`
- `startSymphony()`

`AppLive` 是当前服务的 dependency graph。它把 workflow runtime 和所有 live service layer 合起来。

`startSymphony` 做 runtime 生命周期：

1. 读取初始 config。
2. log `symphony_starting`。
3. 启动 terminal workspace cleanup。
4. fork workflow watcher。
5. 无限循环执行 `pollTick`。

如果 `pollTick` 失败，主循环不会退出，而是记录 `poll_tick_failed` 并继续下一轮。

## Workflow 和 config

`WorkflowLoader`：

- `selectWorkflowPath`：有参数用参数，否则用 cwd 下 `WORKFLOW.md`。
- `parseWorkflowSource`：如果有 `---` front matter，就解析 YAML；否则整个文件是 prompt。
- 返回 `WorkflowDefinition`：`path`、`directory`、`config`、`promptTemplate`。

`WorkflowRuntime`：

- 初始 load + resolve + validate。
- 保存 `WorkflowRuntimeSnapshot`。
- `reload` 成功则替换 config，失败则只记录 error。
- `watch` 用文件系统 watch 触发 reload。

`ConfigResolver`：

- 解析 tracker、polling、workspace、hooks、agent、codex。
- `$VAR` 只在显式配置值中解析。
- `workspace.root` 变成 normalized absolute path。
- `validateDispatch` 只检查 dispatch 必需条件。

## Orchestrator runtime

`pollTick` 是调度入口，顺序是：

1. `reconcileRunning`
2. `processDueRetries`
3. `validateDispatch`
4. `fetchCandidateIssues`
5. `sortCandidates`
6. `dispatchIssue`

`dispatchIssue` 的关键点：

- 先 `tryMarkRunning`，避免重复派发。
- worker 默认 fork 到 child fiber。
- Codex event callback 同时更新 state 和输出 structured log。
- worker failure 统一转成 `worker_failed` log 和 retry。
- worker success 根据返回 issue 状态决定 cleanup、release 或 continuation retry。

`handleWorkerSuccessEffect` 是第二轮 goal 的核心收口点：

- terminal：remove running + completed + workspace cleanup。
- non-active：remove running，不 cleanup。
- still active：走 normal exit，安排 continuation retry。

## Orchestrator state

[apps/cli/src/orchestrator/state.ts](../../apps/cli/src/orchestrator/state.ts) 用 `Ref<RuntimeState>` 保存单一权威内存状态。

`RuntimeState` 包含：

- `running`
- `claimed`
- `retryAttempts`
- `completed`
- `codexTotals`
- `rateLimits`

`isDispatchEligible` 是防重复派发和 concurrency gating 的核心。

`handleWorkerExitInState` 定义 retry 语义：

- normal exit：加入 `completed`，并安排 1000ms continuation retry。
- abnormal exit：指数 backoff retry。

`recordCodexEventInState` 定义观测语义：

- 更新 running session。
- 根据 absolute token totals 计算 delta，累加全局 totals。
- 保存最新 rate limits。

## Agent runner

[apps/cli/src/agent-runner/runner.ts](../../apps/cli/src/agent-runner/runner.ts) 是 workspace/prompt/Codex 的组合器。

关键顺序：

1. `workspaceManager.createForIssue`
2. `workspaceManager.runBeforeRun`
3. 最多 `agent.maxTurns` 次 Codex turn
4. 每个 turn 后 `tracker.fetchIssueStatesByIds`
5. `Effect.ensuring(runAfterRunBestEffort)`
6. 返回 latest issue + workspace + session

这里的 `ensuring` 很关键：不管 turn 成功、失败还是异常，`after_run` 都会尽力跑。

## Codex app-server client

[apps/cli/src/agent-runner/codex.ts](../../apps/cli/src/agent-runner/codex.ts) 是第一轮 goal 修正最多的模块。

当前实现不是伪协议，而是真实 JSON-RPC stream：

- request/response 用 `id` 匹配。
- notification 没有 `id`。
- server request 需要 client response。

核心能力：

- 启动 `bash -lc <codex.command>`。
- cwd 必须等于 issue workspace。
- 初始化 app-server。
- start 或 resume thread。
- start turn。
- 处理 tool call、approval、user input、usage、rate limits、turn completion。

错误类型会转成 `CodexError`，例如：

- `invalid_workspace_cwd`
- `codex_not_found`
- `response_timeout`
- `turn_timeout`
- `process_exit`
- `malformed_message`
- `response_error`
- `turn_failed`
- `turn_cancelled`
- `turn_input_required`

## Linear tracker

[apps/cli/src/tracker/linear.ts](../../apps/cli/src/tracker/linear.ts) 分两层：

- `LinearTransport`：只负责 HTTP POST GraphQL。
- `TrackerClient`：负责 Symphony 需要的 tracker operations。

支持三类 query：

- `fetchCandidateIssues`
- `fetchIssuesByStates`
- `fetchIssueStatesByIds`

每个 Linear payload 都 normalize 成 `Issue`：

- state name。
- labels lowercase。
- blockers 从 inverse relations 里提取。
- priority / timestamps 做类型收窄。

## Workspace manager

[apps/cli/src/workspace/manager.ts](../../apps/cli/src/workspace/manager.ts) 负责本地文件系统边界。

关键函数：

- `sanitizeWorkspaceKey`
- `workspacePathFor`
- `isPathInside`
- `assertContained`
- `createForIssue`
- `runBeforeRun`
- `runAfterRunBestEffort`
- `removeForIssueBestEffort`

安全规则：

- workspace path 必须在 workspace root 下。
- issue identifier 只保留 `[A-Za-z0-9._-]`，其他字符替换成 `_`。
- hooks 运行 cwd 是 workspace path。
- `after_create` / `before_run` 失败是 fatal。
- `after_run` / `before_remove` 是 best-effort。

## Prompt renderer

[apps/cli/src/prompt/render.ts](../../apps/cli/src/prompt/render.ts) 是一个 first-pass strict renderer。

支持：

- `{{ issue.identifier }}`
- `{{ issue.title }}`
- `{{ attempt }}`
- `{% for label in issue.labels %}...{% endfor %}`

不支持 filters。遇到未知变量、非法表达式或 filter 会失败。这是故意的：prompt 错误应该暴露，而不是静默渲染错。

## Logging

[apps/cli/src/observability/logging.ts](../../apps/cli/src/observability/logging.ts) 输出稳定 `key=value` 日志。

第二轮 goal 中修过一个细节：包含 `token` 的 key 会被 secret redaction 命中，但 token usage 是数字指标，不是 secret。现在 numeric value 会保留，例如：

```text
codex_total_tokens=218050
```

而 `api_key`、`authorization`、`secret` 等仍会输出 `[redacted]`。
