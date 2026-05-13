# Pre-runtime Setup Checklist

## Scope Decisions

- [x] Use `/Users/sayori/Desktop/create-yume` as the first monorepo setup reference.
- [x] Adapt `create-yume` conventions instead of copying package names or unrelated dependencies.
- [x] Preserve `@effect/tsgo` and native-preview diagnostics.
- [x] Keep Symphony runtime implementation out of this migration slice.
- [x] Preserve `symphony-ts` as the public CLI bin.

## Monorepo Migration

- [x] Root `package.json` is a private pnpm workspace root.
- [x] `pnpm-workspace.yaml` includes `apps/*` and `libs/*`.
- [x] `turbo.json` defines build/typecheck/test/dev tasks.
- [x] Current CLI code lives under `apps/cli/src`.
- [x] Current CLI package config lives under `apps/cli/package.json`.
- [x] CLI build config lives under `apps/cli/tsdown.config.ts`.
- [x] CLI TypeScript config lives under `apps/cli/tsconfig.json`.
- [x] CLI shebang script lives under `apps/cli/scripts/ensure-shebang.mjs`.
- [x] `apps/cli` package owns the `symphony-ts` bin.
- [x] Root scripts delegate package build/typecheck/test/smoke work.
- [x] `pnpm-lock.yaml` has workspace importers.
- [x] README documents the monorepo command shape.
- [x] `pnpm verify` passes.
- [x] `pnpm smoke:bin` passes.

## Remaining Gates For Later

- [ ] Vendor and pin the full upstream Effect monorepo as read-only reference.
- [ ] Record Effect package-version-to-reference alignment.
- [ ] Generate or curate project-local Effect pattern docs.
- [ ] Add richer Effect-first Vitest helpers.
- [ ] Add fake services for Linear, Codex app-server, filesystem/workspace, and time/scheduling.
- [ ] Document worktree/bootstrap rules.
- [ ] Document `/goal` context-loading rules.
- [ ] Create seed debug playbooks.
