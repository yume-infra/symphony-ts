# Design: Official Effect LLM Reference Shape and v4 Beta Migration

## Objective

Move from a locally ignored Effect checkout and Effect v3 dependency set to the
official source-available agent workflow plus the current Effect v4 beta API
baseline: a committed squashed subtree under `repos/effect`, explicit agent
rules, editor exclusions, project-local v4 pattern docs, and tsgo-based
diagnostics.

## Official Guidance Mapping

| Official Guidance | Repository Design |
| --- | --- |
| Give agents real library source code | Add upstream Effect as `repos/effect` subtree. |
| Prefer `git subtree --squash` | Add subtree with squashed upstream history. |
| Keep vendored repositories under a common path | Use `repos/effect`. |
| Document read-only/reference intent for agents | Update `AGENTS.md` and README docs. |
| Do not import from vendored source | Keep explicit import prohibition and validation/search rules. |
| Create project-local pattern files | Keep `docs/effect-patterns/*`, update source paths and examples for v4 beta. |
| Tight feedback loop with Effect LSP/tsgo | Use `@effect/tsgo` diagnostics in package scripts/config. |
| Avoid editor noise from vendored repos | Add `.vscode/settings.json` excludes for `repos/**`. |

## Reference Ref Strategy

The user selected **upstream main** for `repos/effect`.

For a direct v4 beta migration, npm metadata is the decisive source for which
upstream repository to vendor. `effect@4.0.0-beta.66` and
`@effect/platform-node@4.0.0-beta.66` both publish repository metadata pointing
to `Effect-TS/effect-smol`, so `repos/effect` uses that official v4 beta source
repository. The trade-off is that upstream `main` may still be ahead of the
currently published v4 beta packages. The implementation must make that
boundary explicit:

- `repos/effect` is source/reference material only.
- Application imports continue to come from installed package dependencies.
- Project-local pattern docs must target the installed beta package set, not an
  unreleased upstream-only API.
- Future agents should use tsgo diagnostics and package versions as the final
  check when upstream `main` and installed packages diverge.

The subtree command should therefore use:

```bash
git subtree add --squash --prefix=repos/effect https://github.com/Effect-TS/effect-smol.git main
```

The exact squashed upstream commit is
`b559d68845f848a10153395778f035682d399075`.

## Effect v4 Migration Path

The user chose a direct Effect v4 beta migration in this task. Current npm
metadata shows this is a beta migration rather than a latest-stable upgrade:

- `effect@latest`: `3.21.2`
- `effect@beta`: `4.0.0-beta.66`
- `@effect/platform-node@beta`: `4.0.0-beta.66`
- `@effect/platform` and `@effect/cli`: no beta dist-tag in the checked
  metadata
- `@effect/cli@0.75.1`: peers on `effect@^3.21.1`
- `effect@4.0.0-beta.66`: exports `effect/unstable/cli`

A v4 migration is therefore a dependency/API migration, not a simple catalog
version bump:

- Update package catalog ranges to the selected v4-compatible package set.
- Regenerate the lockfile with `pnpm install`.
- Re-run `effect-tsgo` / `tsgo` diagnostics and fix breaking API changes.
- Replace `@effect/cli` imports with the v4 beta CLI modules exposed from
  `effect/unstable/cli`, specifically `Command` and `Flag` for the current CLI.
- Use `@effect/platform-node@beta` for `NodeRuntime` and `NodeServices`.
- Remove `@effect/platform`, `@effect/printer`, and `@effect/printer-ansi` if
  they are no longer direct runtime dependencies after moving off `@effect/cli`.
- Update `docs/effect-patterns/*` so examples match the installed v4 packages,
  not just upstream `main`.
- Run the full project verification gate.

## Known API Changes in This Repository

The pre-migration code showed a small direct migration surface:

- `apps/cli/src/index.ts` imported `Command` and `Options` from `@effect/cli`.
  The v4 target is `effect/unstable/cli`, specifically `Command` and `Flag`.
- `apps/cli/src/index.ts` imported `NodeContext` and `NodeRuntime` from
  `@effect/platform-node`; v4 beta keeps `NodeRuntime` but replaces
  `NodeContext.layer` with `NodeServices.layer`.
- `apps/cli/tests/support/effect.test.ts` uses `Context.Tag`; migrate the test
  service to `Context.Service`.
- `apps/cli/tests/support/effect.ts` uses `Cause`, `Effect`, `Exit`, and
  `Layer`; verify signatures with tsgo rather than assuming v3 types still
  match.

The installed beta exposes the needed shape through `effect/unstable/cli` with
`Command` and `Flag`. If a later beta changes that API, preserve the thin CLI
shape with the closest official v4 CLI API from `repos/effect`, but do not
introduce another CLI framework.

## File Layout

```text
repos/
  effect/                 # upstream Effect subtree, read-only reference
docs/effect-patterns/     # compact project-local Effect patterns
README.md                 # points future contributors to pattern docs/subtree
AGENTS.md                 # tells agents how to treat repos/effect
.vscode/settings.json     # excludes repos/** from editor search/import noise
```

The old `reference/effect/` metadata and ignored checkout workflow are removed.
The final shape avoids two reference locations and makes `repos/effect` the
single source path.

## Import Boundary

Application code must keep importing from installed dependencies:

```ts
import { Effect } from "effect"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
```

Imports from `repos/effect` are forbidden. `repos/effect` is source/reference
material only.

## tsgo Strategy

Use the official Effect tsgo binary path as implemented by the installed
`@effect/tsgo` version. Current evidence shows:

- `@effect/tsgo` provides `effect-tsgo`.
- `@typescript/native-preview` provides `tsgo`.
- Current scripts run `tsgo --noEmit` after `effect-tsgo patch`.
- The installed `effect-tsgo` binary is a setup/patch wrapper and does not
  accept `--noEmit`.

Implementation tested `effect-tsgo --noEmit`; it failed with an unrecognized
flag. Preserve the patched `tsgo --noEmit` path and document the
version-specific limitation.

## Validation

- `rtk proxy pnpm verify`
- `rtk git status --short`
- `rtk python3 ./.trellis/scripts/task.py validate 05-13-align-effect-reference-official-llm-guidance`

## Rollback

The subtree change is isolated. Rollback means removing `repos/effect`,
restoring docs to the previous reference path, and reverting script/config
changes.
