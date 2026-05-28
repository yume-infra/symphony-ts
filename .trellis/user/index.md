# 项目上下文总览

## 这个目录的作用

`.trellis/user/` 是给人读的项目地图，`.trellis/spec/` 是给 agent 执行的工程约束。

两者都是真源，但读者不同：

| 目录 | 主要读者 | 写法 |
| --- | --- | --- |
| `.trellis/user/` | user | 解释项目是什么、怎么读、哪里容易踩坑 |
| `.trellis/spec/` | agent | 记录可执行 contract、检查点、禁止模式和验证要求 |

## 项目一眼看懂

`symphony-ts` 是一个 TypeScript / Effect 实现的 Symphony 编排服务。它不是传统
frontend/backend 应用，而是一个长运行 orchestration service，通过很薄的 CLI 入口启动。

| 区域 | 角色 |
| --- | --- |
| `apps/cli` | CLI 入口、Effect runtime、配置解析、orchestrator、integration 边界 |
| `libs/*` | 预留共享库包位，目前核心实现仍以 `apps/cli` 为主 |
| `repos/effect/` | 只读上游 Effect v4 beta subtree 源码参考 |
| `docs/effect-patterns/` | 本项目优先读取的 Effect pattern 摘要 |
| `.trellis/spec/` | agent-facing 执行规范 |
| `.trellis/user/` | user-facing 项目地图和阅读顺序 |

## 先读什么

1. 读本文件，先确认项目是长运行编排服务，不是普通 CLI 工具或前后端应用。
2. 读 [Symphony TS 项目说明](./symphony-ts.md)，理解产品形态和核心目录。
3. 读 [Effect 源码参考说明](./effect-source.md)，理解为什么使用 subtree，而不是 submodule。
4. 读 [协作与验证说明](./contributing.md)，确认常用命令和验证门槛。
5. 开始改代码前，再读 `.trellis/spec/` 中对应 layer，尤其是
   `.trellis/spec/typescript-effect/index.md`。

## 什么时候维护 user docs

当改动会影响人如何理解项目时，更新 `.trellis/user/`：

- 产品边界、CLI 形态或运行模型变了。
- 目录职责或包边界变了。
- Effect 源码参考、验证流程、agent 工作流变了。
- 常见误解或阅读顺序变了。

如果只是新增代码级禁止模式或测试断言，优先更新 `.trellis/spec/`；只有人也需要理解背景时才同步写进这里。
