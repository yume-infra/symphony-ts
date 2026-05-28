# Symphony TS 项目说明

## 它是什么

`symphony-ts` 是 `SPEC.md` 描述的 Symphony service 的 TypeScript / Effect 实现。

它的产品形态是长运行编排服务：

- 读取一个 workflow 配置。
- 轮询 Linear 等 tracker 中的 active issue。
- 为每个 issue 建立隔离 workspace。
- 启动本地 Codex app-server 执行 agent 任务。
- 根据 issue 状态、Codex 事件、hooks、重试和 reconciliation 规则推进或收口。

CLI 只是启动入口，目标形态保持最小：

```bash
symphony-ts [workflow-path]
```

不要把它扩成 dashboard、setup wizard、宽泛 operator UX，除非这个范围被明确提出。

## 核心目录怎么理解

| 路径 | 说明 |
| --- | --- |
| `SPEC.md` | 产品蓝图和术语参考，不是机械复制清单 |
| `apps/cli/src/index.ts` | CLI entrypoint，负责解析 workflow path 并启动 Effect runtime |
| `apps/cli/src/app.ts` | service runtime 主流程 |
| `apps/cli/src/config/` | workflow/config 解析和验证 |
| `apps/cli/src/orchestrator/` | orchestrator state、scheduler、worker 生命周期 |
| `apps/cli/src/tracker/` | Linear tracker 边界 |
| `apps/cli/src/agent-runner/` | Codex app-server / coding-agent 运行边界 |
| `apps/cli/src/workspace/` | workspace 路径、安全和生命周期 |
| `apps/cli/src/prompt/` | agent prompt 渲染 |
| `apps/cli/src/client-tools/` | agent 可用 client-side tools |
| `docs/goal/` | 当前实现/验收说明和目标上下文 |
| `docs/ai/` | agent 调试手册和 worktree/bootstrap 说明 |
| `.trellis/spec/` | 可执行的工程约束和验证要求 |

## 核心约束

- Runtime behavior 放在 Effect services/modules 中，不放进 command handler。
- Effect 是配置、服务、并发、资源生命周期、错误和 integration 边界的基础。
- `SPEC.md` 是 conformance baseline；有意偏离需要写入 Trellis spec 或任务记录。
- AI/coding-agent 基础设施是核心产品面：workspace 隔离、agent launch cwd 安全、结构化日志、非阻塞 user-input policy、conformance tests 都是一等要求。

## 最容易踩的点

- 不要按传统 frontend/backend 模板理解这个仓库。
- 不要把 CLI 做厚；CLI 负责启动，runtime 负责业务行为。
- 不要从 `repos/effect/` import；它只是源码参考。
- 不要猜 Effect v4 beta API；先看本地 pattern docs、`repos/effect/LLMS.md`、源码和 tsgo。
- 不要直接复制 OpenAI Symphony 的 `.codex/` 结构；只能在 TypeScript runtime、CI、logging、PR convention 成熟后有选择地适配。
