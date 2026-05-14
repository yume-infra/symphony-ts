# 整体架构

## 系统边界

`symphony-ts` 不是传统前后端应用。它是一个本地长运行服务，核心职责是调度和运行 coding agent：

1. 从仓库内 `WORKFLOW.md` 读取策略、配置和 prompt。
2. 从 Linear 拉取符合 active state 的 issue。
3. 为 issue 创建或复用隔离 workspace。
4. 在 workspace 中启动 `codex app-server`。
5. 将 Codex runtime events 汇报给 orchestrator。
6. 在 worker 结束后根据 Linear 最新状态决定续跑、重试、释放或 cleanup。

## 架构图

```text
          symphony-ts [workflow-path]
                     |
                     v
              CLI / NodeRuntime
                     |
                     v
              AppLive Effect Layer
                     |
       +-------------+--------------+
       |                            |
       v                            v
 WorkflowRuntime              RuntimeLogger
 load/reload config           structured key=value logs
       |
       v
   startSymphony loop
       |
       v
    pollTick
       |
       +--> reconcile running issues
       +--> process due retries
       +--> validate dispatch config
       +--> fetch Linear candidates
       +--> dispatch eligible issues
                |
                v
          AgentRunner.runAttempt
                |
       +--------+---------+
       |                  |
       v                  v
 WorkspaceManager     PromptRenderer
 create/hooks         strict template render
       |
       v
 CodexAppServerClient
 JSON-RPC initialize -> thread/start -> turn/start
       |
       v
 local codex app-server process
       |
       +--> Linear connector / linear_graphql
       +--> file changes inside issue workspace
       +--> token usage / rate limits / turn completion
```

## Effect layer 装配

`AppLive` 在 [apps/cli/src/app.ts](../../apps/cli/src/app.ts) 里把 runtime 所需服务组合起来：

- `WorkflowRuntimeLive`
- `ConfigResolverLive`
- `RuntimeLoggerLive`
- `OrchestratorStateLive`
- `WorkspaceManagerLive`
- `PromptRendererLive`
- `LinearTransportLive`
- `LinearTrackerClientLive`
- `CodexAppServerClientLive`
- `AgentRunnerLive`

这意味着业务代码不是手动传一堆对象，而是通过 Effect service requirement 声明依赖。测试里可以替换成 fake layer，真实运行时用 live layer。

## 主要运行时对象

核心 domain type 在 [apps/cli/src/domain/types.ts](../../apps/cli/src/domain/types.ts)：

- `Issue`：Linear issue 的 normalized model。
- `ServiceConfig`：从 `WORKFLOW.md` 解析出的 typed runtime config。
- `Workspace`：每个 issue 的本地 workspace。
- `LiveSession`：Codex thread/turn/session/token/rate-limit 信息。
- `RunningIssue`：orchestrator 正在运行的 issue 状态。
- `RetryEntry`：被安排重试或 continuation retry 的 issue。
- `OrchestratorSnapshot`：面向 status surface 的内存快照。

## 数据流

输入：

- CLI 参数：可选 `workflow-path`。
- `WORKFLOW.md`：tracker、polling、workspace、hooks、agent、codex 配置，以及 prompt 模板。
- `.env` 或 process env：典型是 `LINEAR_API_KEY`。
- Linear API：候选 issue、terminal issue、issue state refresh。
- Codex app-server JSON-RPC stream：thread/turn lifecycle、tool requests、usage、rate limits。

输出：

- stdout/stderr 上的结构化日志。
- 每个 issue workspace 中 Codex 创建或修改的文件。
- workspace hooks 写出的 artifact。
- Linear issue 状态变化，通常由 Codex worker 的 Linear 工具完成。

## 控制权分层

可以把系统分成五层：

1. **Policy layer**
   - `WORKFLOW.md` prompt 和 workflow config。
   - 例如“拿到 issue 后先改 In Progress，再做任务，再改 Done”。

2. **Configuration layer**
   - `WorkflowLoader` 读取 markdown + YAML front matter。
   - `ConfigResolver` 解析 defaults、env、paths、typed values。

3. **Coordination layer**
   - `pollTick`、`OrchestratorState`。
   - 负责 claim、running、retry、reconciliation、dispatch eligibility。

4. **Execution layer**
   - `WorkspaceManager` + `AgentRunner` + `CodexAppServerClient`。
   - 负责本地目录、hooks、prompt、Codex app-server JSON-RPC。

5. **Integration layer**
   - `LinearTransport` 和 `TrackerClient`。
   - 负责 GraphQL transport、pagination、payload normalization。

## 当前服务的信任模型

当前实现是高信任本地环境模型：

- 依赖本机已登录 / 可用的 `codex` CLI。
- 依赖 workflow 配置提供 Linear API key。
- Codex connector approval 会自动批准，以保证无人值守执行。
- interactive user input 不支持，遇到就 fail-fast，避免无限等待。
- Codex subprocess 必须从 per-issue workspace 启动。

这不是面向不可信多租户的实现。安全边界详见 [安全边界与高信任策略](./08-safety-boundaries.md)。
