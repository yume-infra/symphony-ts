# Prepare pre-runtime setup

## Goal

Prepare `symphony-ts` for future strict `SPEC.md` runtime implementation by completing the
repository-structure prerequisite first: migrate the current single-package CLI into the monorepo
shape used by the user's `create-yume` reference, while preserving current CLI behavior and
Effect/tsgo constraints.

This task also records the remaining pre-runtime gate sequence so a later `/goal` runtime task can
assume the repository is already a monorepo with stable package boundaries.

## Confirmed Facts

- `symphony-ts` is currently a single TypeScript ESM package generated from `create-yume`.
- The current public bin is `symphony-ts`, pointing to `dist/index.js`.
- The current CLI is still a generated Effect greeting command in `src/index.ts`.
- The first Symphony runtime pass must not start yet.
- `SPEC.md` remains the reference blueprint and terminology source.
- Dashboard/status UI, HTTP API, and SSH workers are deferred.
- `linear_graphql` and an internal runtime snapshot remain first-pass runtime scope later.
- The user provided `/Users/sayori/Desktop/create-yume` as the monorepo setup reference.
- The `create-yume` monorepo reference uses:
  - pnpm workspace root with `apps/*` and `libs/*`
  - Turbo root task orchestration
  - CLI app under `apps/cli`
  - library packages under `libs/*`
  - workspace package dependencies through `workspace:*`
  - root validation scripts that delegate package build/typecheck/test work
- The current project intentionally uses `@effect/tsgo` and `@typescript/native-preview`; do not
  switch back to standalone `@effect/language-service`.
- The current project has newer dependency choices than `create-yume` in some areas, including
  `@antfu/eslint-config`, commitlint, `tsdown`, and Effect tsgo tooling.

## Requirements

- Create a Trellis planning task before implementation.
- Use `/Users/sayori/Desktop/create-yume` as the first monorepo reference.
- Migrate repository structure toward the `create-yume` workspace shape:
  - root workspace package
  - `apps/cli` package for the public CLI
  - `libs/*` reserved for later runtime/domain/testing libraries
  - root `pnpm-workspace.yaml`
  - root `turbo.json`
- Preserve the public command shape and package identity:
  - installed bin remains `symphony-ts`
  - command still builds to a runnable `dist/index.js` inside the CLI package
  - root scripts provide the expected developer commands
- Preserve current Effect-first toolchain constraints:
  - keep `@effect/cli`, `@effect/platform-node`, `effect`
  - keep `@effect/tsgo` + native-preview diagnostics
  - keep `effect-tsgo patch` in install/prepare flow
- Add Vitest as part of the monorepo test baseline, but do not write broad runtime tests before
  runtime modules exist.
- Keep runtime implementation out of scope.
- Do not edit `.trellis/spec/` unless later evidence shows the migration requires durable spec
  updates and the task explicitly justifies them.
- Do not blindly copy `create-yume`; adapt its workspace conventions to Symphony-ts.

## Acceptance Criteria

- [x] `prd.md`, `design.md`, and `implement.md` exist before implementation starts.
- [x] The repository has a root `pnpm-workspace.yaml` using `apps/*` and `libs/*`.
- [x] The repository has a root `turbo.json` suitable for build/typecheck/test/dev tasks.
- [x] The current CLI source, package manifest, tsconfig, tsdown config, and shebang script are
      moved under `apps/cli`.
- [x] Root `package.json` becomes a private workspace root and keeps appropriate repo-level scripts.
- [x] `apps/cli/package.json` owns the publishable package identity and `symphony-ts` bin.
- [x] Root and package scripts preserve build, typecheck, lint, knip, verify, and smoke behavior.
- [x] Vitest is installed and wired into the workspace test script baseline.
- [x] `pnpm-lock.yaml` reflects the monorepo importers.
- [x] README or task docs explain the new workspace shape for future agents.
- [x] `pnpm verify` passes after migration.
- [x] `pnpm smoke:bin` passes after migration.
- [x] No Symphony runtime modules are implemented in this task.
- [x] The task records the remaining pre-runtime gates for later work:
      Effect monorepo reference, Effect pattern docs, richer test fakes/helpers, and seed AI
      infrastructure/debug playbooks.

## Out Of Scope

- Implementing workflow loading, config, orchestrator, Linear, workspace, Codex app-server, or
  runtime snapshot behavior.
- Building dashboard/status UI, HTTP API, or SSH worker support.
- Vendoring the full upstream Effect monorepo in this first migration slice unless explicitly
  resumed into that gate.
- Creating complete Effect pattern docs or debug playbooks in this first migration slice.
- Full commit/push/land AI skills.

## Open Questions

- None blocking the monorepo migration. The user selected `create-yume` as the monorepo reference
  and requested implementation.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
