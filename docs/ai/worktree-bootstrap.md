# Worktree Bootstrap

Use this guide when preparing agent runs, isolated worktrees, or local validation for Symphony-ts.

## Repository Shape

Run repository-wide work from the repository root:

```bash
cd "$(git rev-parse --show-toplevel)"
```

Current package layout:

```text
apps/cli/  public @sayoriqwq/symphony-ts CLI package
libs/      reserved for future runtime, domain, and testing packages
```

Prefer root workspace commands with `pnpm --filter` for package targeting. Change into a package
directory only when a package-local tool explicitly requires that cwd.

## Bootstrap Commands

Install dependencies from the repository root:

```bash
pnpm install
```

The root `prepare` script installs Husky when `.git` exists and runs `effect-tsgo patch`. If Effect
or native-preview diagnostics look stale after dependency changes, run:

```bash
pnpm install
pnpm typecheck
```

In Codex CLI sessions using the local RTK proxy, prefix these commands with `rtk`.

## Validation Commands

Default gate:

```bash
pnpm verify
```

Root supporting checks:

```bash
pnpm build
pnpm typecheck
pnpm typecheck:tsc
pnpm test
pnpm lint
pnpm knip
pnpm smoke:bin
```

CLI package checks:

```bash
pnpm --filter @sayoriqwq/symphony-ts build
pnpm --filter @sayoriqwq/symphony-ts typecheck
pnpm --filter @sayoriqwq/symphony-ts typecheck:tsc
pnpm --filter @sayoriqwq/symphony-ts test
pnpm --filter @sayoriqwq/symphony-ts smoke:bin
```

Use `pnpm smoke:bin` when CLI behavior, packaging, bin output, or the entrypoint changes.

## Generated And Cache Paths

Do not intentionally commit generated or cache output such as:

- `node_modules/`
- `.turbo/`
- `dist/`
- `apps/*/dist/`
- `apps/*/.turbo/`
- logs and `*.log`

Generated Trellis and Codex templates should not be normalized by unrelated docs or runtime tasks.

## Agent Cwd Safety

Future Symphony workers must launch coding-agent subprocesses only from the per-issue workspace path,
not from the repository root.

Required runtime invariants:

- workspace root is normalized and absolute
- per-issue workspace path is inside workspace root
- `workspace_key` is sanitized from `issue.identifier` using only `[A-Za-z0-9._-]`
- coding-agent subprocess cwd equals the per-issue workspace path
- workspace hooks run with the workspace path as cwd
- cleanup cannot remove paths outside workspace root

Local validation commands are the exception: they may run from the repository root or targeted
package paths because they are not agent-runner subprocesses.

## Package Target Safety

Before modifying code or docs, identify the intended target:

- `apps/cli` for the public CLI entrypoint, CLI tests, and package scripts.
- `libs/*` for future runtime, domain, integration, and testing packages.
- `.trellis/spec/*` only when the user explicitly asks to update durable project contracts.
- `docs/ai/*` for AI workflow guides and playbooks.

Do not encode stale single-package assumptions. When new `libs/*` packages appear, update this guide
and any `/goal` handoff docs that mention package paths.

## Secrets

Do not expose raw Linear tokens, Codex credentials, signed URLs, or other secrets in prompts,
playbooks, logs, or shell helpers.

Validate that required secrets exist without printing their values. Future coding agents should use
configured tool surfaces, such as `linear_graphql`, rather than reading tokens from disk.
