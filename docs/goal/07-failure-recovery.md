# 失败与恢复语义

本页解释服务在失败、续跑、状态变化和 cleanup 上的行为。

## 状态分类

Symphony 同时处理两种状态：

1. Linear issue state
   - 例如 `Todo`、`In Progress`、`Done`。
   - 来自 workflow config 的 `active_states` 和 `terminal_states`。

2. Orchestrator internal state
   - `claimed`
   - `running`
   - `retryAttempts`
   - `completed`

不要把这两类状态混在一起。Linear state 决定 issue 是否可派发；orchestrator state 防止重复派发和控制 retry。

## Normal worker exit

正常 worker exit 不等于 issue 完成。

如果 worker 返回时 issue 仍是 active：

```text
remove running
add completed bookkeeping
schedule continuation retry in 1000ms
keep claim through retry queue
```

这样做是因为 Codex turn 完成后，issue 可能仍需要继续处理。服务会短暂等待后重新评估是否需要下一次 worker session。

代码位置：

- `handleWorkerExitInState` in [orchestrator/state.ts](../../apps/cli/src/orchestrator/state.ts)
- `handleWorkerSuccessEffect` in [orchestrator/runtime.ts](../../apps/cli/src/orchestrator/runtime.ts)

## Terminal worker result

如果 worker 返回时 issue 已经 terminal：

```text
remove running
release claim
mark completed
run before_remove
delete workspace
do not schedule retry
```

这是第二轮 goal 的最终收口路径。`SAY-7` 就是通过这条路径完成。

## Non-active, non-terminal result

如果 worker 返回时 issue 既不 active 也不 terminal：

```text
remove running
release claim
do not cleanup workspace
do not schedule retry
```

原因：这通常代表一个 workflow-defined handoff 状态，例如 `Human Review`。当前实现不会假设它可以删除 workspace。

## Failure worker exit

如果 worker 失败：

```text
remove running
keep claim via retry entry
schedule exponential backoff retry
```

backoff 公式：

```text
delay = min(10000 * 2^(attempt - 1), agent.max_retry_backoff_ms)
```

默认上限是 300000ms。

典型失败包括：

- workflow prompt render error。
- workspace hook fatal error。
- Codex app-server 启动失败。
- JSON-RPC response timeout。
- Codex turn timeout。
- Codex turn failed/cancelled。
- interactive user input request。

## Due retry

`processDueRetries` 会处理到期 retry：

1. 重新拉 active candidate issues。
2. 找到同一个 issue ID。
3. 找不到则 release claim。
4. 找到但 slot 不足则重新排队。
5. 找到且 eligible 则重新 dispatch。

重要点：

- Retry 只从 active candidates 中恢复。
- 如果 issue 已 terminal，它不会出现在 active candidates 中，因此 claim 会释放。
- terminal workspace cleanup 主要由 startup cleanup 和 worker terminal result cleanup 处理。

## Stall detection

`reconcileStalledRuns` 会看每个 running issue 的 last activity：

```text
last_codex_timestamp if available
else startedAtMs
```

如果：

```text
now - lastActivity > codex.stall_timeout_ms
```

则：

```text
remove running
schedule retry with error "worker stalled"
```

如果 `stall_timeout_ms <= 0`，stall detection 关闭。真实验收 workflow 就把它设为 `0`，避免验收时把长 turn 误判为 stalled。

## Tracker refresh failure

`reconcileRunning` 刷新 running issue 状态时，如果 Linear 请求失败：

```text
keep workers running
try again next tick
```

这避免了因为 Linear 临时失败而杀掉正在工作的 Codex session。

## Terminal reconciliation 的当前实现

SPEC 的理想语义是：

```text
running issue externally becomes terminal -> terminate worker -> cleanup workspace
```

当前实现是：

```text
running issue refresh sees terminal
  -> update running snapshot
  -> do not cleanup yet
worker returns terminal issue
  -> run after_run
  -> run before_remove
  -> cleanup workspace
```

这是一个有意的 first-pass tradeoff。它修复了真实验收中发现的 race：如果 reconcile 在 worker 完成前直接删除 workspace，`after_run` 和 `turn/completed` 证据链会断。

未来更完整的实现可以做：

```text
terminal refresh
  -> interrupt worker fiber/process
  -> AgentRunner finalizer runs after_run
  -> Orchestrator then runs before_remove
  -> cleanup workspace
```

也就是说，未来目标不是回到“提前 rm workspace”，而是增加 interruption，同时保持 hook 顺序。

## Startup terminal cleanup

服务启动时会调用 `startupTerminalWorkspaceCleanup`：

```text
fetch issues by terminal states
for each issue:
  remove workspace best-effort
```

这解决重启后残留 terminal workspace 的问题。

如果 fetch terminal issues 失败，当前实现会忽略并继续启动。

## Approval 和 user input 恢复语义

当前 high-trust policy：

- 已知 approval request 自动批准。
- 未知 approval request 返回 unsupported。
- interactive user input request 直接 fail turn。

这样保证服务不会无限停在“等待用户同意 / 等待用户输入”的状态。

## 真实修复后新增的测试覆盖

第二轮 goal 后新增或调整的重点测试：

- Codex MCP elicitation auto-approval。
- worker 返回 terminal issue 时 cleanup 且不 retry。
- terminal running issue 在 worker 退出前不 cleanup。
- AgentRunner 返回 refreshed terminal issue。
- numeric token log 不被 redacted。

完整测试门：

```bash
rtk proxy pnpm verify
```
