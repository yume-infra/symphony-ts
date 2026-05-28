# Effect v4 源码参考与迁移说明

这篇文档说明 Symphony-ts 现在围绕 Effect 做的事情：把项目迁到 Effect v4 beta
的 API 形态，同时把上游 Effect 源码以 vendored source 的方式放进仓库，供人和
agent 查阅，但不让应用代码直接依赖这份源码。

## 当前目标

Symphony-ts 是一个 TypeScript / Effect 实现的长运行编排服务。为了避免后续 runtime
开发靠记忆猜 Effect API，项目先完成了三件基础设施工作：

1. 选定 Effect v4 beta 作为实现基线。
2. 把上游 Effect v4 beta 源码放到 `repos/effect/`，作为只读参考。
3. 建立本地 pattern docs、subtree 验证脚本和 `tsgo` 诊断闭环。

当前基线是：

- `effect@4.0.0-beta.66`
- `@effect/platform-node@4.0.0-beta.66`
- `@effect/tsgo@0.7.0`
- `@typescript/native-preview@7.0.0-dev.20260513.1`

## Effect v4 迁移点

Effect v4 beta 不是简单升级版本号。它调整了包组织方式，也把仍在变化的模块放到
`effect/unstable/*` 下面。

本项目当前采用这些 v4 beta 入口：

- CLI：`effect/unstable/cli/Command` 和 `effect/unstable/cli/Flag`
- Node runtime：`@effect/platform-node/NodeRuntime`
- Node services：`@effect/platform-node/NodeServices`
- Service 定义：`Context.Service`
- 长运行入口：`NodeRuntime.runMain`

这也意味着不再使用旧的 `@effect/cli` 作为应用依赖。原因很直接：当前 `@effect/cli`
仍 peer 到 Effect v3，而本项目的目标是直接落到 v4 beta 的 API 面上。

## 为什么 vendor 上游源码

Effect API 面比较大，v4 又处在 beta 阶段。只看 `node_modules` 或靠模型记忆，很容易
写出看起来合理但当前版本不可用的代码。

所以仓库里保留了一份上游源码：

```text
repos/effect/
```

它是从 `Effect-TS/effect-smol` 拉进来的 squashed `git subtree`。这个仓库是
`effect@4.0.0-beta.66` package metadata 指向的 v4 beta 源码仓库。

当前记录的 upstream split 是：

```text
b559d68845f848a10153395778f035682d399075
```

选择 subtree 而不是 submodule，是为了让 fresh clone 后立刻能读源码，不需要额外
初始化步骤；同时 `--squash` 不会把上游完整历史塞进主仓库。

## 这份源码是什么，不是什么

`repos/effect/` 是源码参考，不是应用依赖。

可以用它做这些事：

- 查 Effect v4 beta 的真实实现。
- 查 upstream tests 和 examples。
- 查 `repos/effect/LLMS.md` 里的官方 LLM coding guidance。
- 对照 `repos/effect/MIGRATION.md` 和 `repos/effect/migration/*.md` 理解 v3 到 v4 的变化。

不能做这些事：

- 不能从应用代码或测试代码 import `repos/effect/...`。
- 不能把 `repos/effect/` 当成 workspace package。
- 不能在普通 runtime 任务里编辑 vendored source。

应用和测试必须从安装依赖 import：

```ts
import * as Effect from "effect/Effect"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Command from "effect/unstable/cli/Command"
```

## pin 和验证在哪里

真正的 pin 是两部分：

1. Git 已跟踪的 `repos/effect/` tree。
2. Git history 里最近的 `git-subtree-split` commit。

`repos/effect.subtree.json` 是 verifier manifest。它记录 expected repository、
branch、prefix、split、LLM 文档路径和 package baseline，让本地和 CI 可以检查这份
源码参考是否仍然可信。

验证命令：

```bash
pnpm effect:source:verify
```

这个命令会检查：

- `repos/effect/` 存在；
- 它是普通 Git tree，不是 submodule gitlink；
- `repos/effect/LLMS.md` 存在；
- manifest 里的 split 和 Git history 对得上；
- 应用和测试没有 import `repos/effect`。

## 日常开发怎么用

写非平凡 Effect 代码时，推荐顺序是：

1. 先看 `package.json` 和 `pnpm-lock.yaml`，确认当前安装版本。
2. 读 `docs/effect-patterns/index.md` 和相关本地 pattern 文档。
3. 读 `repos/effect/LLMS.md`。
4. 必要时在 `repos/effect/packages/` 里查源码、测试和 examples。
5. 用 `@effect/tsgo` 诊断确认当前安装包真的支持这些 API。

最短诊断命令：

```bash
rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck
```

完整验证门：

```bash
rtk proxy pnpm verify
```

完整验证会先跑 `effect:source:verify`，然后再 build、typecheck、test、lint 和 knip。

## 更新上游源码怎么做

更新 `repos/effect/` 不是普通业务改动，应该作为基础设施任务处理。

更新命令：

```bash
pnpm effect:source:update
```

更新后必须同步：

- `repos/effect.subtree.json` 里的 `split`；
- `docs/effect-patterns/index.md` 里记录的 selected upstream commit；
- 如果 API 或推荐写法变化了，同步更新相关 `docs/effect-patterns/*.md`。

然后运行：

```bash
pnpm effect:source:verify
rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck
```

只有源码参考和诊断闭环都通过后，才应该开始基于新版本改 runtime 代码。
