# 真实验收证据

本页记录两轮 goal 里最重要的验收事实。

## Round 1: Real Codex turn dispatch acceptance

目标：

- 证明 `symphony-ts` 能从真实 Linear 选到 issue。
- 证明它能创建 per-issue workspace。
- 证明它能启动真实本地 `codex app-server`。
- 证明一个真实 Codex turn 能完成。

证据路径：

- [real-codex-dispatch-evidence.json](../../.trellis/tasks/archive/2026-05/05-14-05-14-real-codex-turn-dispatch-acceptance/real-codex-dispatch-evidence.json)
- [acceptance-audit.md](../../.trellis/tasks/archive/2026-05/05-14-05-14-real-codex-turn-dispatch-acceptance/acceptance-audit.md)
- [real-codex-workflow.md](../../.trellis/tasks/archive/2026-05/05-14-05-14-real-codex-turn-dispatch-acceptance/real-codex-workflow.md)

关键事实：

- 选中 Linear issue：`SAY-5`。
- issue title：`哈哈`。
- workspace：`SAY-5`。
- real Codex launch marker：`.real-codex-app-server-launched`。
- real Codex app-server pid：`68794`。
- `after_run` marker：`.symphony-after-run`。
- `after_run` UTC：`2026-05-14T03:34:22Z`。
- 无 protocol deserialization failure。
- 无 poll failure。
- 无 user input required。
- artifact scan 未发现 raw Linear API key。

这轮证明的是：真实 Codex turn 能被 `symphony-ts` 启动并完成。

它没有证明完整 Linear 状态闭环，因为当时目标是 Codex app-server 环境验收。

## Round 2: Normal flow acceptance

目标：

- 从一个 Todo issue 开始。
- 由 `symphony-ts` 正常 polling / dispatch。
- 启动真实本机 Codex app-server。
- Codex 执行一个最小真实任务。
- Linear 状态流转 `Todo -> In Progress -> Done`。
- Symphony 看到 terminal result 后执行 `after_run`、`before_remove`、workspace cleanup。

证据路径：

- [evidence.json](../../.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/evidence.json)
- [WORKFLOW.md](../../.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/WORKFLOW.md)
- [hooks.jsonl](../../.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/events/hooks.jsonl)
- [codex-launches.jsonl](../../.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/events/codex-launches.jsonl)
- [codex-protocol-out.jsonl](../../.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/events/codex-protocol-out.jsonl)
- [acceptance-result.txt](../../.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/events/acceptance-result.txt)
- [acceptance-result.before-remove.txt](../../.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/events/acceptance-result.before-remove.txt)

关键事实：

| 项 | 值 |
| --- | --- |
| Issue | `SAY-7` |
| Issue ID | `cb103680-0c34-4321-90af-98abfff017b7` |
| Title | `Symphony normal flow acceptance 2026-05-14 11:46` |
| Linear URL | `https://linear.app/sayoriqwq/issue/SAY-7/symphony-normal-flow-acceptance-2026-05-14-1146` |
| Initial state | `Todo` |
| Final state | `Done` |
| Codex app-server pid | `92234` |
| Session | `019e253c-9920-76f1-988b-5a483e30befb-019e253c-9950-7471-a488-79ca2aae5071` |
| Acceptance marker | `SYMPHONY_NORMAL_FLOW_ACCEPTANCE_OK` |
| Result | `pass: true` |

状态 timeline：

| State | Observed At | Linear Updated At |
| --- | --- | --- |
| `Todo` | `2026-05-14T06:46:27.798Z` | `2026-05-14T06:46:18.767Z` |
| `In Progress` | `2026-05-14T06:47:08.319Z` | `2026-05-14T06:47:06.749Z` |
| `Done` | `2026-05-14T06:47:21.855Z` | `2026-05-14T06:47:19.411Z` |

Hook 顺序：

```text
after_create  2026-05-14T06:46:28Z
before_run    2026-05-14T06:46:28Z
after_run     2026-05-14T06:47:21Z
before_remove 2026-05-14T06:47:21Z
```

Controller checks：

```text
createdFromTodo: true
sawInProgress: true
sawDone: true
symphonyStarted: true
codexLaunched: true
sawSessionStarted: true
sawTurnCompleted: true
afterCreateRan: true
beforeRunRan: true
afterRunRan: true
beforeRemoveRan: true
acceptanceResultCopied: true
workspaceCleaned: true
noPollFailures: true
noUnsupportedToolCall: true
noApprovalRejected: true
noUserInputRequest: true
timedOut: false
pass: true
```

## 这次验收实际覆盖了什么

覆盖：

- `symphony-ts` built dist 启动。
- 真实 Linear API 读 issue。
- 真实 Linear state transitions。
- 真实 Codex app-server process。
- Codex connector approval auto-accept。
- Codex file change。
- Codex final answer marker。
- `turn/completed` event。
- `after_run` hook。
- `before_remove` hook。
- workspace deletion。
- structured logs 中没有 poll failure / unsupported tool call / approval rejection / user input stall。

未覆盖：

- 多 issue 并发。
- long-running multi-turn 复杂任务。
- Codex process crash 后 retry。
- external operator 中途把 issue 改 terminal 时的即时 interruption。
- HTTP / dashboard，因为当前未实现。

## 第二轮验收中修出的关键 bug

### Bug 1: Approval 默认拒绝导致 Linear connector 不能运行

现象：

- Codex app-server 请求允许 Linear connector tool `linear_save_issue`。
- Symphony 当时把 approval request 作为 rejected 处理。
- Codex 无法正常无人值守流转 Linear 状态。

修复：

- `item/commandExecution/requestApproval` -> approve。
- `item/fileChange/requestApproval` -> approve。
- `item/permissions/requestApproval` -> session scope approve。
- `mcpServer/elicitation/request` -> accept。

### Bug 2: AgentRunner 丢失 terminal refresh state

现象：

- Codex 把 issue 改到 `Done`。
- `AgentRunner` refresh 到 Done 后 break。
- 但返回给 Orchestrator 的 `result.issue` 仍是旧 active issue。
- Orchestrator 以为需要 continuation retry，不 cleanup。

修复：

- 先 `currentIssue = refreshedIssue`，再判断是否 active。

### Bug 3: Reconcile 过早清理 workspace

现象：

- Orchestrator 在 worker 还没完全退出时看到 Linear 已 terminal。
- 立即 cleanup workspace。
- `after_run` / `turn/completed` evidence 可能丢。

修复：

- `reconcileRunning` 对 terminal running issue 只更新 snapshot。
- cleanup 等 worker success result 返回后执行。

## 相关 commit

- `4e61419f0 test: record real codex dispatch acceptance`
- `b413d95f6 fix: complete codex worker flow acceptance`
