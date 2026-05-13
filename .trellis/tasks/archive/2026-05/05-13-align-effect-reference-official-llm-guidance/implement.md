# Implementation Plan

## Planning Checklist

- [x] Create Trellis task.
- [x] Inspect current reference docs, pattern docs, editor settings, package
      scripts, and AGENTS instructions.
- [x] Compare current setup with official Effect LLM coding guidance.
- [x] Resolve subtree ref decision: use upstream `main`.
- [x] Resolve whether Effect v4 beta migration is included here or handled as a
      separate task: include it here.
- [x] Inspect current Effect package usage and v4 beta package metadata.
- [x] Review planning artifacts before `task.py start`.

## Ordered Execution After Approval

1. [x] Start the task with `task.py start`.
2. [x] Add upstream Effect with
       `git subtree add --squash --prefix=repos/effect https://github.com/Effect-TS/effect-smol.git main`.
3. [x] Record the exact squashed upstream commit and update/remove the old
       `reference/effect/source` workflow docs.
4. [x] Update `.gitignore` and validation ignores to match the new committed
       subtree shape.
5. [x] Update `pnpm-workspace.yaml` catalog entries for the selected v4 beta
       package set.
6. [x] Update `apps/cli/package.json` to remove v3-only Effect packages such
       as `@effect/cli`, `@effect/platform`, `@effect/printer`, and
       `@effect/printer-ansi` unless tsgo proves a remaining direct dependency
       is required.
7. [x] Run `pnpm install` to regenerate `pnpm-lock.yaml`.
8. [x] Migrate CLI imports and code to the v4 beta API:
       `effect/unstable/cli` for CLI utilities, `@effect/platform-node@beta`
       for Node runtime/context if still exported there, and `effect` for core
       APIs.
9. [x] Migrate tests from `Context.Tag` to `Context.Service`, and fix any
       additional v4 type errors surfaced by tsgo.
10. [x] Update `AGENTS.md` vendored repository and Effect v4 beta guidance for
        `repos/effect`.
11. [x] Update `README.md`, `docs/ai/goal-context.md`, and
       `docs/effect-patterns/*` paths from `reference/effect/source` to
       `repos/effect`, and update examples to v4 beta.
12. [x] Add `.vscode/settings.json` excludes for `repos/**`.
13. [x] Test `effect-tsgo --noEmit`; preserve patched `tsgo --noEmit` because
       `effect-tsgo` is a setup/patch wrapper in the installed version.
14. [x] Run validation.
15. [x] Update checklist/artifacts and finish the task.

## Validation Commands

```bash
rtk proxy pnpm verify
rtk git status --short
rtk python3 ./.trellis/scripts/task.py validate 05-13-align-effect-reference-official-llm-guidance
```

If `effect-tsgo --noEmit` is adopted, also run:

```bash
rtk proxy pnpm --filter symphony-ts typecheck
```

`effect-tsgo --noEmit` was tested and rejected because the installed
`@effect/tsgo@0.7.0` wrapper does not accept `--noEmit`; package scripts remain
on `tsgo --noEmit`.

## Risk Points

- `git subtree add` may create a large commit; use `--squash`.
- Effect v4 is beta as of 2026-05-14; APIs may change between beta releases.
- `@effect/cli@0.75.1` peers on Effect v3, so keeping it would defeat a direct
  v4 migration. Prefer `effect/unstable/cli`.
- `effect/unstable/*` imports are explicitly unstable v4 modules; document that
  risk instead of hiding it.
- Avoid importing or editing upstream code under `repos/effect`.
- Avoid letting ESLint, Knip, or package tooling treat `repos/effect` as
  maintained application code.
- Do not update `.trellis/spec/` in this task unless the user explicitly asks.
- Do not implement Symphony runtime behavior.
