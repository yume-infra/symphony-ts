# Effect 源码参考说明

## 当前做法

本项目把上游 Effect v4 beta 源码作为 squashed `git subtree` 放在：

```text
repos/effect/
```

这是只读源码参考，不是应用依赖，也不是 submodule checkout。

## 为什么不是 submodule

这里的目标是让 agent 和人类在 fresh clone 后立刻可以 `rg`、阅读和引用上游源码，而不是把 Effect 当成另一个可编译 repo 接入。

subtree 更适合这个目标：

- fresh clone 后 `repos/effect/` 立即存在。
- agent、编辑器、`rg` 和 review 都按普通目录处理。
- `--squash` 不会把上游完整历史带进主仓库。
- 不需要额外 `git submodule update --init` 步骤。

submodule 的 Git-layer pin 更显式，但它会引入初始化成本和缺源码风险。对本项目的 agent 工作流来说，这个 tradeoff 不合适。

## pin 在哪里

真正的 pin 不是 JSON 文件本身，而是：

- Git 已跟踪的 `repos/effect/` subtree 内容。
- Git history 中最近的 `git-subtree-split` commit。

`repos/effect.subtree.json` 是 verifier manifest，用来记录 expected repository、branch、prefix、split 和 LLM 文档路径。它让 `pnpm effect:source:verify` 能在 CI/本地检查 subtree provenance、LLMS 文档和 import boundary。

## 维护命令

验证当前 subtree：

```bash
pnpm effect:source:verify
```

更新上游 subtree：

```bash
pnpm effect:source:update
```

更新后需要同步：

- `repos/effect.subtree.json` 里的 `split`。
- `docs/effect-patterns/index.md` 中记录的 selected upstream commit。
- 相关 Effect pattern docs，如果 API 或推荐写法发生变化。

应用代码和测试只能从安装依赖 import，不能从 `repos/effect/` import。
