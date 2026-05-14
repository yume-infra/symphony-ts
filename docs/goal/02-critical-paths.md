# 关键链路

## 1. CLI 启动链路

入口是 [apps/cli/src/index.ts](../../apps/cli/src/index.ts)：

```text
NodeRuntime.runMain(Command.run(command))
```

`command` 定义在 [apps/cli/src/cli/command.ts](../../apps/cli/src/cli/command.ts)，命令形状是：

```bash
symphony-ts [workflow-path]
```

它只做两件事：

1. 解析可选 `workflow-path`。
2. 调用 `startSymphony()`，并提供 `AppLive(selectedWorkflowPath)`。

这符合项目约束：CLI 很薄，真正 runtime 行为都在 Effect services 和 modules 里。

## 2. 配置加载与动态 reload

启动时，`AppLive` 构造 `WorkflowRuntimeLive(workflowPath)`。

关键文件：

- [apps/cli/src/workflow/loader.ts](../../apps/cli/src/workflow/loader.ts)
- [apps/cli/src/workflow/runtime.ts](../../apps/cli/src/workflow/runtime.ts)
- [apps/cli/src/config/resolve.ts](../../apps/cli/src/config/resolve.ts)

链路：

```text
selectWorkflowPath
  -> read WORKFLOW.md
  -> parse YAML front matter
  -> trim prompt body
  -> resolve typed ServiceConfig
  -> validate dispatch config
```

`ConfigResolver` 的重要规则：

- `tracker.api_key: $LINEAR_API_KEY` 会解析环境变量。
- 如果 `tracker.kind` 是 `linear`，没有显式 `api_key` 时也会读 `LINEAR_API_KEY`。
- 相对 `workspace.root` 会相对 `WORKFLOW.md` 所在目录解析。
- `polling.interval_ms`、`agent.max_turns`、hook timeout 等都有默认值。
- `codex.command` 默认是 `codex app-server`。

动态 reload：

- `WorkflowRuntime.watch` 监听当前 workflow 文件。
- reload 成功时替换 effective config。
- reload 失败时保留 last known good config，并记录 `workflow_reload_rejected`。

## 3. 主循环

主循环在 [apps/cli/src/app.ts](../../apps/cli/src/app.ts)：

```text
log symphony_starting
startupTerminalWorkspaceCleanup(initialConfig)
fork workflow.watch(...)
while true:
  config = workflow.getConfig
  pollTick(config, nowMs)
  sleep(config.polling.intervalMs)
```

启动时会先清理 terminal issue 对应的 stale workspace。随后每个 tick 用当前有效 config 执行调度。

## 4. Poll tick 调度链路

核心在 [apps/cli/src/orchestrator/runtime.ts](../../apps/cli/src/orchestrator/runtime.ts) 的 `pollTick`：

```text
reconcileRunning(config, nowMs)
processDueRetries(config, options)
resolver.validateDispatch(config)
candidates = tracker.fetchCandidateIssues(config)
for issue in sortCandidates(candidates):
  if isDispatchEligible(issue, currentState, config):
    dispatchIssue(issue)
```

顺序很重要：

1. **先 reconcile running**
   - 看 running issue 是否 stall。
   - 刷新 running issue 的 Linear 状态。

2. **再处理 due retries**
   - 如果 retry due 到期，重新查候选 issue。
   - issue 不再 active 就 release claim。

3. **再 validate dispatch**
   - tracker kind、api key、project slug、codex command 都必须可用。

4. **最后拉候选并派发**
   - 防止同一 tick 在旧状态下重复派发。

## 5. Dispatch eligibility

判断逻辑在 [apps/cli/src/orchestrator/state.ts](../../apps/cli/src/orchestrator/state.ts) 的 `isDispatchEligible`：

一个 issue 只有同时满足这些条件才会派发：

- `id`、`identifier`、`title`、`state` 都存在。
- issue state 在 `active_states` 中。
- issue state 不在 `terminal_states` 中。
- 不在 `running`。
- 不在 `claimed`。
- 全局并发 slot 足够。
- state-level 并发 slot 足够。
- 如果 state 是 `Todo`，所有 blocker 都必须是 terminal。

排序规则是：

1. priority 小的优先。
2. createdAt 更早的优先。
3. identifier 字典序兜底。

## 6. Worker 启动链路

`dispatchIssue` 会先调用 `state.tryMarkRunning`。只有成功 claim 后才启动 worker。

随后构造：

```text
runner.runAttempt({
  issue,
  attempt,
  config,
  onCodexEvent
})
```

`onCodexEvent` 同时做两件事：

1. `state.recordCodexEvent(issue.id, event)` 更新 live session、token totals、rate limits。
2. `logger.info('codex_event', ...)` 输出 operator-visible 日志。

`launchMode` 默认是 fork child fiber。测试可用 `inline` 让 worker 同步完成。

## 7. AgentRunner 链路

核心在 [apps/cli/src/agent-runner/runner.ts](../../apps/cli/src/agent-runner/runner.ts)：

```text
createForIssue
runBeforeRun
for turnNumber <= maxTurns:
  render initial prompt or continuation prompt
  codex.runTurn(...)
  refresh Linear issue by ID
  if refreshed missing: break
  currentIssue = refreshedIssue
  if refreshedIssue not active: break
runAfterRunBestEffort
return latest issue + workspace + Codex session
```

这里有一个第二轮 goal 修复过的关键 bug：

- 以前刷新到 `Done` 后直接 break，但没有把 `currentIssue` 更新成 `Done`。
- Orchestrator 收到的 result 仍像 active issue，于是安排 continuation retry，没有 cleanup。
- 现在先赋值 `currentIssue = refreshedIssue`，再判断是否 active。

因此 `AgentRunResult.issue` 能真实反映 worker 结束时 Linear 最新状态。

## 8. Codex app-server JSON-RPC 链路

核心在 [apps/cli/src/agent-runner/codex.ts](../../apps/cli/src/agent-runner/codex.ts)。

真实进程链路：

```text
spawn bash -lc <codex.command> with cwd = workspace.path
send initialize
send thread/start or thread/resume
send turn/start
process JSON-RPC responses, requests, notifications
return on turn/completed
kill child process after result
```

当前协议重点：

- `initialize`
  - `clientInfo: { name: "symphony-ts", version: "0.0.0" }`
  - `capabilities.experimentalApi: true`

- `thread/start`
  - `cwd`
  - `approvalPolicy`
  - `sandbox`
  - `serviceName: "symphony-ts"`

- `thread/resume`
  - continuation turn 复用已有 `threadId`。

- `turn/start`
  - `threadId`
  - `cwd`
  - `approvalPolicy`
  - `sandboxPolicy`
  - text input，即渲染后的 prompt。

Codex server request 处理：

- `item/tool/call`
  - 支持 `linear_graphql`。
  - 不支持的 tool 返回 structured failure，不让 session 卡住。

- `item/tool/requestUserInput`
  - 返回不支持，并将 turn 失败为 `turn_input_required`。

- approval 类请求
  - 自动返回 approve / accept。
  - 事件记录为 `approval_granted`。

Codex notification 处理：

- `thread/started`、`turn/started`、`turn/completed`
  - 提取 thread/turn identity。

- `thread/tokenUsage/updated`
  - 提取 input/output/total tokens。

- `account/rateLimits/updated`
  - 更新最新 rate-limit payload。

## 9. Terminal cleanup 链路

Worker 成功后由 `handleWorkerSuccessEffect` 收口：

```text
if result.issue is terminal:
  remove running
  release claim
  mark completed
  workspace.removeForIssueBestEffort
elif result.issue not active:
  remove running
  release claim
else:
  normal worker exit -> continuation retry
```

Workspace cleanup 由 [apps/cli/src/workspace/manager.ts](../../apps/cli/src/workspace/manager.ts) 的 `removeForIssueBestEffort` 完成：

```text
compute contained workspace path
if workspace exists:
  run before_remove best-effort
  rm -rf workspace
```

第二轮 goal 里还修了一个 race：

- `reconcileRunning` 如果看到 running issue 已经是 terminal，不再立即清 workspace。
- 它只更新 running issue snapshot。
- 真正 cleanup 等 worker return 后执行，这样 `after_run` 一定有机会在 `before_remove` 之前运行。

这就是最终 evidence 里能看到：

```text
after_create -> before_run -> after_run -> before_remove
workspaceEntries: []
```
