# 与 Spec 的对齐情况

本页对照根目录 [SPEC.md](../../SPEC.md) 和 Trellis spec layers，说明当前实现覆盖了哪些范围，哪些是 first-pass，哪些还没有做。

## 总体结论

当前 `symphony-ts` 已经完成一个可执行的 first-pass Symphony runtime：

- 可以从 repo-owned `WORKFLOW.md` 读取运行策略。
- 可以轮询 Linear。
- 可以为 issue 创建 workspace。
- 可以启动真实本地 Codex app-server。
- 可以让 Codex 通过 Linear connector 流转 issue 状态。
- 可以收集 Codex event、tokens、rate limits。
- 可以根据 terminal issue 做 workspace cleanup。
- 已有真实 Linear + Codex acceptance evidence。

还不是完整生产版：

- 没有 HTTP dashboard / REST API extension。
- 没有 durable DB。
- 没有内置 worktree/bootstrap。
- 没有完整 operator control plane。
- external terminal transition 的即时 worker interruption 语义还未完整实现。

## SPEC.md 对齐表

| SPEC 章节 | 当前状态 | 说明 |
| --- | --- | --- |
| 1 Problem Statement | 已对齐 | 服务确实是长运行 scheduler/runner，从 Linear 读 work，在 workspace 中运行 coding agent。 |
| 2 Goals / Non-Goals | 大体对齐 | poll、bounded concurrency、workspace、repo-owned workflow、structured logs 已有；rich UI、control plane 未做，符合 non-goals。 |
| 3 System Overview | 已对齐 | Workflow Loader、Config Layer、Tracker Client、Orchestrator、Workspace Manager、Agent Runner、Logging 都有实现。Status Surface 只有 internal snapshot，没有 UI/API。 |
| 4 Core Domain Model | 已对齐 | `Issue`、`ServiceConfig`、`Workspace`、`LiveSession`、`RetryEntry`、`RuntimeState` 都落在 `domain/types.ts` 和 `orchestrator/state.ts`。 |
| 5 Workflow Specification | 已对齐 | `WORKFLOW.md` front matter + prompt body，unknown keys ignored，prompt trim，missing/parse error typed。 |
| 6 Configuration | 已对齐 | defaults、env indirection、relative workspace root、dispatch validation、dynamic reload 已实现。 |
| 7 Orchestration State Machine | 大体对齐 | `running`、`claimed`、`retryAttempts`、normal continuation retry、failure retry 都有。 |
| 8 Polling / Scheduling / Reconciliation | 部分对齐 | tick 顺序、candidate rules、concurrency、retry、startup cleanup 已有。外部 terminal transition 目前不立刻 kill worker，而是等 worker 结束后 cleanup。 |
| 9 Workspace Management | 已对齐 | path containment、sanitized key、hooks、hook failure semantics、cleanup 都有。 |
| 10 Agent Runner Protocol | 已对齐 first-pass | JSON-RPC initialize/thread/turn、event extraction、timeouts、approval/user-input policy、unsupported tools 都有。 |
| 11 Linear Tracker | 已对齐 first-pass | candidate/issues-by-states/issue-state-refresh、pagination、normalization、typed tracker errors 都有。 |
| 12 Prompt | 部分对齐 | strict variables、loop、unknown variable failure 已有；Liquid filters 暂不支持，遇到 filter 会 fail。 |
| 13 Logging / Observability | 部分对齐 | structured logs、session/token/rate-limit extraction 已有；HTTP/API/dashboard extension 未实现。 |

## Trellis spec layers 对齐

### `runtime-orchestration`

已实现：

- poll tick 顺序。
- one authority state mutation。
- claim/running/retry/completed state。
- candidate sort 和 eligibility。
- continuation retry。
- exponential backoff。
- startup terminal cleanup。
- terminal worker result cleanup。

需要注意的偏差：

- Trellis spec 当前写着“terminal state -> terminate worker and clean workspace”。当前代码为了保证 `after_run` 在 `before_remove` 前执行，把 running issue refresh 到 terminal 时只更新 snapshot，不立即清理。真正 cleanup 等 `AgentRunner` 返回 terminal result 后执行。
- 这个选择是第二轮真实验收修出来的：如果 reconcile 抢先 cleanup，worker 的 `after_run` 和 `turn/completed` evidence 可能丢失。
- 后续更完整做法是显式 interrupt worker fiber/process，并通过 finalizer 保证 `after_run -> before_remove -> rm` 顺序。

### `external-integrations`

已实现：

- Linear GraphQL adapter。
- Codex app-server JSON-RPC protocol boundary。
- `linear_graphql` client-side tool extension。
- unsupported tool call structured failure。
- approval / elicitation auto-resolution。
- user input fail-fast。

需要注意：

- 当前 Codex connector 的 Linear 操作主要依赖 Codex 环境中的 Linear plugin/tooling。
- `linear_graphql` 是 Symphony 暴露的可选 client-side tool，但真实验收中 Codex 也使用了 Codex app 的 Linear connector `linear_save_issue`。

### `testing-conformance`

已实现：

- Vitest deterministic unit tests。
- fake Codex app-server protocol scripts。
- fake Linear transport。
- Effect-first test helper。
- real integration evidence 不放进普通 CI 自动跑，而是作为显式 acceptance artifact。

真实 evidence：

- `SAY-5`：真实 Linear issue + 真实 Codex app-server turn dispatch。
- `SAY-7`：真实 Linear issue 从 Todo 到 In Progress 到 Done，并完成 cleanup。

### `quality-operations`

已实现：

- `rtk proxy pnpm verify` 通过。
- structured logs。
- secret redaction。
- issue/session identifiers 出现在 logs。
- `.trellis/workspace/**` 排除在 `knip` unused source 扫描外，避免验收 artifact 干扰源码质量门。

### `typescript-effect`

已实现：

- CLI 使用 `NodeRuntime.runMain`。
- Effect services + layers。
- typed errors。
- `tsgo --noEmit` typecheck 通过。
- 前一轮 `tsgo` suggestions 已收敛：
  - `tracker/linear.ts` 的 GraphQL request body 使用 `Schema.UnknownFromJsonString` 编码。
  - `TrackerClient` 在 `LinearTrackerClientLive` layer 创建时闭包捕获 `LinearTransport`，不再把
    transport requirement 泄漏到 public service surface。
  - `workflow/runtime.ts` 的 watcher callback 使用 `Effect.context` + `Effect.runPromiseWith`
    继承当前 Effect context。
- ESLint 增加本地 Effect 规则，拦截 legacy `@effect/cli` import、`repos/effect` import、
  `Context.Tag`、`Effect.ignore`、`Effect.catchAllCause`、`Effect.serviceOption`、
  `Effect.asVoid` 和 catch handler 静默返回 `Effect.void`/`Effect.unit`。

当前 `tsgo` 没有输出 Effect suggestion；`pnpm verify` 是准入门。

## First-pass 明确范围

当前实现刻意没有做这些：

- HTTP server。
- dashboard。
- REST API。
- 多租户权限模型。
- durable orchestrator state。
- 复杂 operator approval UI。
- 内建 git/worktree/bootstrap。
- 自动 PR / commit / land 流程。

这些可以作为后续 feature，而不是当前服务能否执行正常 Linear/Codex flow 的前置条件。
