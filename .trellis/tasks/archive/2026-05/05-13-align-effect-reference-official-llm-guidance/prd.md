# Align Effect reference and migrate to Effect v4 beta

## Goal

Make the repository's Effect source/reference setup match Effect's official
"Coding with LLMs" guidance as closely as possible, and directly migrate the
workspace from Effect v3 packages to the current Effect v4 beta package shape.
Future agents should inspect real upstream source through a normal repository
path, while application code and docs compile against the installed v4 beta
dependencies.

## User Value

Future Symphony runtime work should start from the same major Effect API surface
that upstream is actively documenting for v4. The setup should make reference
source obvious, read-only for application work, protected from accidental
imports, and paired with tight `@effect/tsgo` diagnostics so beta API changes
are caught quickly.

## Confirmed Facts

- The user explicitly wants the setup changed to the official form.
- Effect's introduction page says LLM usage should optimize a tight feedback
  loop and use the latest tsgo-based Effect LSP implementation.
- Effect's official May 11, 2026 blog recommends giving agents real Effect
  source code and using `git subtree --squash` under a path such as
  `repos/effect`.
- The same blog recommends documenting agent rules: use vendored repositories
  as read-only reference material, prefer source patterns over guesses, do not
  edit vendored files unless asked, and do not import from vendored paths.
- The blog also recommends project-local pattern files derived from the
  vendored source.
- The user selected upstream `main` as the subtree ref for `repos/effect`.
- The user explicitly expanded the task to directly migrate to Effect v4 beta.
- The current repository already has project-local pattern docs under
  `docs/effect-patterns/`.
- The current repository had an ignored local checkout under
  `reference/effect/source/`, which was useful locally but not the official
  subtree shape and not reproducible from a fresh clone without extra setup.
- Before migration, resolved Effect versions included `effect@3.21.2`,
  `@effect/platform@0.96.1`, `@effect/platform-node@0.106.0`,
  `@effect/cli@0.75.1`, `@effect/tsgo@0.7.0`, and
  `@typescript/native-preview@7.0.0-dev.20260513.1`.
- `effect@3.21.2` and `@effect/platform@0.96.1` both resolve to upstream commit
  `39c934c1476be389f7469433910fdf30fc4dad82`.
- Package scripts run `tsgo --noEmit`; installed binaries include both
  `tsgo` from `@typescript/native-preview` and `effect-tsgo` from
  `@effect/tsgo`.
- As of 2026-05-14, current npm metadata reports `effect@latest` as `3.21.2`
  and `effect@beta` as `4.0.0-beta.66`; `@effect/platform-node` also has a
  `4.0.0-beta.66` beta tag, while `@effect/platform` and `@effect/cli` do not
  expose beta tags in the checked metadata.
- `effect@4.0.0-beta.66` and `@effect/platform-node@4.0.0-beta.66` publish
  repository metadata pointing to `Effect-TS/effect-smol`, so the v4 beta
  subtree source must use that official repository rather than the stable v3
  `Effect-TS/effect` monorepo.
- The Effect v4 migration guide says v4 is beta, ecosystem packages use unified
  versioning, many formerly separate `@effect/*` modules are consolidated into
  `effect`, and separate packages that remain should be bumped to matching v4
  beta versions.
- `effect@4.0.0-beta.66` exports `effect/unstable/cli`; this is the expected
  v4 replacement path for the current `@effect/cli` usage.
- `@effect/cli@0.75.1` peers on `effect@^3.21.1`, so it should not remain in a
  direct v4 beta migration.
- Before migration, runtime code imported `Command` and `Options` from `@effect/cli`,
  `NodeContext` and `NodeRuntime` from `@effect/platform-node`, and `Effect`
  from `effect`.
- Before migration, tests defined one service with `Context.Tag`; the installed v4 beta
  source uses `Context.Service`.

## Requirements

- Replace the ignored local Effect checkout with a committed `git subtree`
  reference under `repos/effect`, tracking upstream `main` from
  `Effect-TS/effect-smol`.
- Use `--squash` so upstream history is not imported wholesale.
- Keep the subtree read-only for normal Symphony implementation work.
- Preserve the application import boundary: application and tests import from
  package dependencies, never from `repos/effect`.
- Update `pnpm-workspace.yaml` catalog entries and `pnpm-lock.yaml` to the
  selected v4 beta package set.
- Remove v3-only Effect packages from direct dependencies when v4 has
  consolidated them into `effect`; specifically, do not keep `@effect/cli`
  because its latest package peers on Effect v3.
- Keep `@effect/platform-node` only if the v4 beta package remains needed for
  Node runtime/context integration.
- Update imports and code to the v4 beta API, including `effect/unstable/cli`
  for CLI utilities and `Context.Service` for test service definitions.
- Update docs and agent instructions to point to `repos/effect`.
- Keep or update project-local Effect pattern docs so future agents start with
  compact v4 beta patterns and can drill into `repos/effect` when needed.
- Add editor settings to exclude `repos/**` from auto-import suggestions, file
  watching, and normal search, matching the official blog guidance.
- Update lint/knip or other validation ignores only when needed to avoid treating
  vendored reference source as application code.
- Align the `@effect/tsgo` workflow with the official README as far as it is
  compatible with the current package version and scripts.
- Document beta-version risk: upstream `main` and published beta packages may
  still diverge, so package versions plus tsgo diagnostics remain the final
  implementation authority.
- Validate with the standard project gate.

## Acceptance Criteria

- [x] `repos/effect` exists as a committed git subtree.
- [x] The subtree was added with `--squash`.
- [x] The selected upstream ref is `Effect-TS/effect-smol` upstream `main`, and
      the exact squashed commit is documented.
- [x] The workspace catalog uses the current selected Effect v4 beta package
      set.
- [x] `pnpm-lock.yaml` is regenerated for the v4 beta package set.
- [x] `apps/cli/package.json` no longer depends on v3-only Effect packages such
      as `@effect/cli`.
- [x] CLI code compiles against the v4 beta import shape, including
      `effect/unstable/cli` if the current beta exposes the needed API there.
- [x] Tests compile against v4 service definitions instead of v3-only
      `Context.Tag` patterns.
- [x] The old ignored `reference/effect/source` workflow is removed.
- [x] `AGENTS.md` includes explicit vendored repository rules for `repos/effect`.
- [x] `README.md`, `docs/ai/goal-context.md`, and `docs/effect-patterns/*`
      point at `repos/effect` instead of `reference/effect/source` and
      describe v4 beta as the active Effect baseline.
- [x] `.vscode/settings.json` excludes `repos/**` from auto-import, search, and
      file watching.
- [x] ESLint/Knip/project validation do not scan vendored source as application
      code.
- [x] Typecheck uses the official Effect tsgo path selected for this project.
- [x] `rtk proxy pnpm verify` passes.
- [x] No Symphony runtime behavior is implemented in this task.

## Out Of Scope

- Implementing runtime orchestration, workflow loading, Linear integration,
  Codex integration, or workspace management.
- Rewriting `.trellis/spec/`; the current project instruction says not to update
  Trellis specs unless explicitly asked.
- Introducing another CLI framework or expanding the CLI beyond the current
  minimal command shape.
- Editing upstream files inside the Effect subtree.

## Open Question

- None. The user selected upstream `main` for `repos/effect` and direct Effect
  v4 beta migration for this task.
