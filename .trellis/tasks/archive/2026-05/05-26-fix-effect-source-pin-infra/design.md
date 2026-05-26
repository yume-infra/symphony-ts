# Design

## Current Gap

The repository has a vendored Effect source tree, but the pin is implicit: the
source path exists and git history contains subtree metadata, while normal
development has no command that checks the pin, no update command, and no
machine-readable record of the expected upstream split.

## Pin Contract

Create `repos/effect.pin.json` as the application-owned manifest. It sits next
to, not inside, `repos/effect/` so subtree pulls cannot overwrite it.

The manifest records:

- upstream repository URL,
- branch,
- subtree prefix,
- pinned `git-subtree-split`,
- required local LLM doc path,
- active package baseline for human audit.

## Script Contract

`scripts/effect-source-pin.mjs` owns two modes:

- `verify`: local, deterministic checks only. It reads the manifest, checks the
  vendored tree and `LLMS.md`, extracts the latest subtree split from git log,
  rejects root `.gitmodules` entries for `repos/effect`, and scans application
  files for imports from `repos/effect`.
- `update`: deliberate network/git operation. It refuses dirty worktrees, runs
  `git subtree pull --prefix=<prefix> <repository> <branch> --squash`, and
  prints the new split so the manifest and docs can be updated in the same
  infrastructure task.

## Verify Integration

Root `pnpm verify` should run `pnpm effect:source:verify` before build,
typecheck, test, lint, and knip. That keeps the agent feedback loop tight and
prevents future work from silently losing the source pin.

## Agent Context

For non-trivial Effect work, agents should read local pattern docs first, then
`repos/effect/LLMS.md`, then specific upstream source/tests. The vendored tree
remains read-only and must not become an import source.
