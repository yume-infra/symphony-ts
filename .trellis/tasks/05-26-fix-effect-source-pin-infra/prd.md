# Fix Effect source pin infrastructure

## Goal

Correctly introduce the Effect source pin infrastructure recommended by the
official Effect LLM guidance. The repository already contains `repos/effect`,
but the infrastructure must be executable and verifiable, not only described in
docs.

## User Value

Agents and humans should be able to answer three questions without guessing:

- Which upstream Effect repository and commit is pinned?
- How is the source pin verified locally and in the normal project gate?
- How do we update the pinned source without accidentally treating it as
  application code?

## Confirmed Facts

- Official Effect docs direct LLM users to the Effect source-vendoring blog,
  tight feedback loops, `accountability` as an agentic-feedback example, and
  the latest `@effect/tsgo` implementation.
- The source-vendoring blog recommends `git subtree add/pull --squash` under
  `repos/effect`, editor exclusions for `repos/**`, and explicit agent rules
  that forbid editing or importing from vendored source.
- Current `repos/effect` is present and has subtree history:
  `git-subtree-split: b559d68845f848a10153395778f035682d399075`.
- Current `repos/effect` includes `LLMS.md`, which the blog says agents should
  read before writing Effect v4 code when available.
- The previous pass did not add an executable pin manifest, update command,
  verify command, or normal gate integration.
- `.vscode/settings.json` excludes search/watch and TypeScript/JavaScript
  auto-imports, but was missing the official `files.exclude` entry.

## Requirements

- Add a committed pin manifest outside `repos/effect/` that records the
  upstream repository, branch, subtree prefix, pinned split, and local LLM doc.
- Add a script that verifies:
  - `repos/effect/` exists,
  - `repos/effect/LLMS.md` exists,
  - the latest subtree split for `repos/effect` matches the manifest,
  - app/test source does not import from `repos/effect`,
  - root `.gitmodules` does not define `repos/effect`.
- Add a script path for deliberate subtree updates using
  `git subtree pull --prefix=repos/effect <repo> <branch> --squash`.
- Wire the source-pin verification into the normal `pnpm verify` gate.
- Update agent/docs/spec guidance to name `repos/effect/LLMS.md` as required
  upstream source context for non-trivial Effect work.
- Add `files.exclude` for `repos/**` in VS Code settings.
- Keep runtime behavior unchanged.

## Acceptance Criteria

- [x] `pnpm effect:source:verify` passes.
- [x] `pnpm verify` runs source-pin verification before the standard gate.
- [x] The pin manifest records `Effect-TS/effect-smol`, `main`,
      `repos/effect`, and split
      `b559d68845f848a10153395778f035682d399075`.
- [x] Docs and AGENTS bootstrap mention `repos/effect/LLMS.md`.
- [x] VS Code excludes `repos/**` from files, watch, search, and TS/JS
      auto-import suggestions.
- [x] No app or test code imports from `repos/effect`.
- [x] No files under `repos/effect/` are edited by this task.

## Notes

Official references:

- <https://effect.website/docs/getting-started/introduction/>
- <https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive/>
- <https://github.com/Effect-TS/tsgo>

## Out Of Scope

- Updating `repos/effect` to a newer upstream split.
- Migrating runtime API suggestions emitted by `tsgo`.
- Editing vendored Effect files.
