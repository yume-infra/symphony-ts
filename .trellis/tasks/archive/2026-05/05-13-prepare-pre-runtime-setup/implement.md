# Implementation Plan

## Planning Checklist

- [x] Create Trellis task.
- [x] Inspect `AGENTS.md`, `SPEC.md`, archived planning artifacts, and updated `.trellis/spec/`.
- [x] Inspect `/Users/sayori/Desktop/create-yume` monorepo reference.
- [x] Decide immediate implementation slice: monorepo migration only, no runtime implementation.
- [x] Write `prd.md`, `design.md`, and `implement.md`.

## Ordered Execution

1. [x] Start the Trellis task with `task.py start`.
2. [x] Create workspace directories:
   - `apps/cli`
   - `libs`
3. [x] Move current CLI-owned files into `apps/cli`:
   - `src/`
   - `scripts/`
   - `tsconfig.json`
   - `tsdown.config.ts`
4. [x] Create root workspace files:
   - `pnpm-workspace.yaml`
   - `turbo.json`
5. [x] Split package manifests:
   - root `package.json` becomes private workspace root
   - `apps/cli/package.json` becomes the publishable CLI package
6. [x] Add package-local Vitest baseline:
   - `apps/cli/vitest.config.ts`
   - package `test` script
   - root test/verify delegation
7. [x] Update workspace-aware config:
   - `knip.jsonc`
   - README command/path notes
   - `.gitignore` if generated outputs need package-aware ignores
8. [x] Run dependency install/update so `pnpm-lock.yaml` has root and `apps/cli` importers.
9. [x] Run validation and fix migration issues.
10. [x] Update the task checklist with completed migration items.

## Validation Commands

```bash
rtk pnpm install
rtk pnpm verify
rtk pnpm smoke:bin
rtk git status --short
```

Use package-level commands while debugging:

```bash
rtk pnpm --filter symphony-ts build
rtk pnpm --filter symphony-ts typecheck
rtk pnpm --filter symphony-ts test
rtk pnpm --filter symphony-ts smoke:bin
rtk pnpm lint
rtk pnpm knip
```

## Risk Points

- Keep `effect-tsgo patch`; do not replace it with `effect-language-service patch`.
- Keep current dependency versions unless migration requires a lockfile refresh.
- Ensure `scripts/ensure-shebang.mjs` still points at `apps/cli/dist/index.js` from its new
  package-local location.
- Do not introduce runtime modules while moving files.
- Do not update `.trellis/spec/` unless the migration reveals durable repo rules that need to be
  recorded and the task explicitly justifies the edit.
- Root `pnpm verify` should not silently skip CLI build/typecheck/test.

## Future Gates After This Migration

- Effect monorepo reference vendoring and pin record.
- Project-local Effect pattern docs.
- Richer Vitest helpers and fake service layers for runtime work.
- Worktree/bootstrap rules, `/goal` context loading, and seed debug playbooks.
