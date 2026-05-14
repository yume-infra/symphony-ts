# Goal Documentation

这些文档解释当前 `symphony-ts` 服务已经实现了什么、它怎样工作、怎样运行，以及它和 `SPEC.md` / Trellis spec 的关系。

这里的重点不是复述 commit，而是把两轮 goal 的结果整理成可读的系统说明：

- 第一轮把 Codex app-server 边界从猜测式协议修正为真实 JSON-RPC 协议，并验证本地 `codex app-server` 能被服务驱动。
- 第二轮跑通一个真实 Linear issue 的正常闭环：`Todo -> In Progress -> Done`，由 `symphony-ts` 轮询、派发、启动 Codex、收集事件、执行 hooks、最终清理 workspace。

## 当前服务一句话

`symphony-ts` 是一个 TypeScript / Effect 写的长运行编排服务：它读取 `WORKFLOW.md`，轮询 Linear 项目里的 active issue，为每个 issue 建立隔离 workspace，启动本地 Codex app-server 执行任务，并根据 Linear 状态、Codex 事件和 hooks 做重试、续跑、收口与日志记录。

## 建议阅读顺序

1. [整体架构](./01-architecture.md)
2. [关键链路](./02-critical-paths.md)
3. [关键模块及代码解析](./03-modules.md)
4. [使用手册](./04-usage-manual.md)
5. [与 spec 的对齐情况](./05-spec-alignment.md)
6. [真实验收证据](./06-acceptance-evidence.md)
7. [失败与恢复语义](./07-failure-recovery.md)
8. [安全边界与高信任策略](./08-safety-boundaries.md)

## 主要落地物

代码入口：

- CLI 入口：[apps/cli/src/index.ts](../../apps/cli/src/index.ts)
- CLI 命令：[apps/cli/src/cli/command.ts](../../apps/cli/src/cli/command.ts)
- Effect layer 装配与主循环：[apps/cli/src/app.ts](../../apps/cli/src/app.ts)
- Orchestrator poll / dispatch / cleanup：[apps/cli/src/orchestrator/runtime.ts](../../apps/cli/src/orchestrator/runtime.ts)
- Orchestrator in-memory state：[apps/cli/src/orchestrator/state.ts](../../apps/cli/src/orchestrator/state.ts)
- Agent runner：[apps/cli/src/agent-runner/runner.ts](../../apps/cli/src/agent-runner/runner.ts)
- Codex app-server JSON-RPC client：[apps/cli/src/agent-runner/codex.ts](../../apps/cli/src/agent-runner/codex.ts)
- Linear tracker：[apps/cli/src/tracker/linear.ts](../../apps/cli/src/tracker/linear.ts)
- Workspace lifecycle：[apps/cli/src/workspace/manager.ts](../../apps/cli/src/workspace/manager.ts)

真实验收 evidence：

- 正常闭环 evidence：[.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/evidence.json](../../.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/evidence.json)
- 正常闭环 workflow：[.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/WORKFLOW.md](../../.trellis/workspace/sayoriqwq/normal-flow-2026-05-14-say-7/WORKFLOW.md)
- 早一轮 real Codex turn evidence：[.trellis/tasks/archive/2026-05/05-14-05-14-real-codex-turn-dispatch-acceptance/real-codex-dispatch-evidence.json](../../.trellis/tasks/archive/2026-05/05-14-05-14-real-codex-turn-dispatch-acceptance/real-codex-dispatch-evidence.json)

关键 commits：

- `4132b7929 fix: speak codex app-server jsonrpc`
- `4e61419f0 test: record real codex dispatch acceptance`
- `b413d95f6 fix: complete codex worker flow acceptance`

## 当前完成度

已经完成：

- `symphony-ts [workflow-path]` CLI。
- `WORKFLOW.md` YAML front matter + prompt body。
- Typed config resolution、`.env` fallback、dispatch preflight validation。
- Dynamic workflow reload，失败 reload 保留 last known good config。
- Linear candidate query、terminal issue query、issue state refresh。
- Orchestrator claim/running/retry/completed/codex totals state。
- Workspace path containment、workspace hooks、terminal cleanup。
- Codex app-server JSON-RPC initialize/thread/turn lifecycle。
- Codex event extraction、token/rate-limit extraction、structured logs。
- High-trust approval auto-resolution，interactive user input fail-fast。
- `linear_graphql` client-side tool extension。
- Real Linear + real local Codex app-server acceptance evidence。

尚未完成或仍是 first-pass：

- 没有 HTTP dashboard / REST API。
- 没有 durable scheduler database，重启恢复依赖 Linear 和 workspace 文件系统。
- 没有内置 git checkout / worktree population，workspace 预备工作需要 hooks 承担。
- tracker writes 不在 orchestrator 里实现，状态流转由 Codex worker 通过 Linear 工具完成。
- 外部 terminal 状态变化时，目前实现优先保留 worker 到 turn 结束以保证 `after_run` 再 cleanup，未来可以补显式 interruption + finalizer 顺序。
