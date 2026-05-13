# Design: Pre-runtime Monorepo Setup

## Objective

Move Symphony-ts from a single generated CLI package into a `create-yume`-style pnpm monorepo while
keeping current behavior intact and avoiding Symphony runtime implementation.

## Reference Inputs

- Current repository: `/Users/sayori/Desktop/symphony-ts`
- User-provided monorepo reference: `/Users/sayori/Desktop/create-yume`
- Product blueprint: `SPEC.md`
- Project constraints: `AGENTS.md` and `.trellis/spec/*`
- Archived plan:
  `.trellis/tasks/archive/2026-05/05-13-plan-symphony-trellis-specs/`

## Target Shape

Use the `create-yume` workspace convention:

```text
symphony-ts/
  package.json
  pnpm-workspace.yaml
  turbo.json
  eslint.config.mjs
  knip.jsonc
  apps/
    cli/
      package.json
      src/
      scripts/
      tsconfig.json
      tsdown.config.ts
      vitest.config.ts
  libs/
    .gitkeep
```

`apps/cli` owns the publishable package and `symphony-ts` bin. `libs/*` is reserved for later
runtime/domain/testing packages, but no runtime package split is introduced until implementation
needs it.

## Adaptation From `create-yume`

Adopt:

- `apps/*` and `libs/*` workspace globs.
- Turbo for root build/typecheck/test/dev orchestration.
- `apps/cli` package boundary for CLI tools.
- `workspace:*` convention for future internal dependencies.
- root-level verification scripts that delegate work to packages.

Do not adopt blindly:

- `create-yume` uses standalone `@effect/language-service`; Symphony-ts must keep `@effect/tsgo`.
- `create-yume` has project-specific CLI scaffolding dependencies that Symphony-ts does not need.
- `create-yume` package names and descriptions do not apply.
- `create-yume` smoke tests and generated examples do not apply.

## Package Boundary

Root package:

- private workspace root
- repo-level scripts
- dev tools shared across packages
- `prepare` runs Husky plus `effect-tsgo patch`
- no publishable bin

`apps/cli` package:

- name: `symphony-ts`
- publishable package fields: `exports`, `main`, `types`, `bin`, `files`
- runtime dependencies: Effect, `@effect/cli`, `@effect/platform*`, printer packages
- package scripts: build, typecheck, test, smoke:bin
- current generated `src/index.ts` stays behaviorally unchanged during migration

## Tooling Contracts

- Root `pnpm verify` runs package build, package typecheck, package tests, root lint, and root knip.
- Root `pnpm smoke:bin` delegates to `apps/cli`.
- Package `build` uses `tsdown` and then the package-local shebang script.
- Package `typecheck` uses `tsgo --noEmit`.
- Package `test` uses `vitest run`; it may pass with no tests only if configured explicitly for the
  empty baseline.
- Root lint still ignores `.agents`, `.codex`, and `.trellis`.
- Knip must understand the workspace and the CLI binary path.

## Compatibility Notes

- Existing imports stay local because the current source is a single entrypoint.
- The public CLI command shape remains `symphony-ts [workflow-path]` for future runtime work, but
  this migration does not implement workflow-path behavior.
- Lockfile importer structure changes from root-only to root plus `apps/cli`.
- README should describe the new workspace commands so future agents do not assume single-package
  paths.

## Remaining Pre-runtime Gates

After monorepo migration, later setup work should complete:

1. Vendor/pin the full upstream Effect monorepo as read-only reference.
2. Generate/curate project-local Effect pattern docs.
3. Add richer Effect-first test helpers and fake services.
4. Add minimum AI infrastructure: worktree/bootstrap rules, `/goal` context-loading rules, and
   seed debug playbooks.

## Rollback

If migration fails badly, rollback is straightforward because the current package files move as a
unit:

- move `apps/cli/src` back to `src`
- move `apps/cli/scripts` back to `scripts`
- move `apps/cli/tsconfig.json` and `apps/cli/tsdown.config.ts` back to root
- restore root `package.json` as the publishable package
- remove `pnpm-workspace.yaml`, `turbo.json`, and `apps/cli/package.json`

Do not use destructive git commands for rollback unless the user explicitly asks.
