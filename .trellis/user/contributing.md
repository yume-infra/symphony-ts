# 协作与验证说明

## 常用命令

本仓库通过 RTK 代理运行本地命令：

```bash
rtk proxy pnpm effect:source:verify
rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck
rtk proxy pnpm verify
```

`pnpm verify` 目前包含：

```text
effect:source:verify -> build -> typecheck -> test -> lint -> knip
```

## Effect 代码验证

- `pnpm --filter @sayoriqwq/symphony-ts typecheck` 使用 `tsgo --noEmit`。
- 如果改到 Effect runtime、services、layers、fiber、schedule 或 resource lifecycle，先读 `docs/effect-patterns/index.md` 和 `.trellis/spec/typescript-effect/index.md`。
- 非平凡 Effect API 工作要读 `repos/effect/LLMS.md`，必要时再查 `repos/effect/` 源码。

## 工作区注意事项

- `repos/effect/` 是只读 subtree，不要在业务改动里编辑它。
- `.vscode/settings.json` 已排除 `repos/**`，避免 editor/search 自动扫上游源码。
- 当前仓库可能有别人留下的未提交变更；只处理本任务相关文件，不回滚无关改动。
