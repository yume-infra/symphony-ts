# Migrate Effect v4 infrastructure

## Goal

Turn the existing Effect v4 beta source-reference and diagnostics setup into
the current migration baseline. The first slice is infrastructure: pinned
upstream source, local guidance, editor/import boundaries, and `tsgo`
validation. Broader Symphony runtime/API work should be validated through this
setup after this task.

## User Value

Future Effect work should have a tight feedback loop for agents and humans:
inspect real upstream source locally, use compact local pattern docs first, keep
application imports on installed dependencies, and let `@effect/tsgo` catch
v3-to-v4 API drift before broad runtime work proceeds.

## Confirmed Facts

- The user asked to follow the official Effect LLM guidance and the May 2026
  Effect blog about vendoring source for agents.
- The Effect docs recommend tight LLM feedback loops, custom validation where
  useful, and the latest `tsgo`-based Effect LSP implementation.
- The Effect blog recommends a squashed `git subtree` under `repos/effect` and
  editor/agent rules that keep the subtree readable but not imported from.
- This repository already has `repos/effect/` as a squashed subtree, currently
  pinned to upstream split `b559d68845f848a10153395778f035682d399075`.
- The active dependency baseline is `effect@4.0.0-beta.66`,
  `@effect/platform-node@4.0.0-beta.66`, `@effect/tsgo@0.7.0`, and
  `@typescript/native-preview@7.0.0-dev.20260513.1`.
- `effect@4.0.0-beta.66` package metadata points at `Effect-TS/effect-smol`,
  so this repository uses that v4 beta source repository rather than the
  stable v3 monorepo.
- Application code already imports the v4 beta CLI from `effect/unstable/cli`
  and Node runtime services from `@effect/platform-node`.
- Project docs already direct agents to `docs/effect-patterns/index.md`,
  `.trellis/spec/typescript-effect/index.md`, `repos/effect/`, and `tsgo`.
- One Trellis spec file still names `@effect/cli`, which can mislead future
  agents back to the v3 peer dependency.

## Requirements

- Keep `repos/effect/` as read-only source/reference material, not an
  application dependency.
- Preserve the `git subtree --squash` pinning model and document the selected
  upstream commit.
- Keep application and test imports on installed package dependencies only.
- Keep `@effect/cli` out of runtime dependencies while targeting Effect v4 beta.
- Align local specs and docs with `effect/unstable/cli`, `NodeRuntime.runMain`,
  `NodeServices.layer`, `Context.Service`, and `@effect/tsgo`.
- Keep editor auto-import/search/watch exclusions for `repos/**`.
- Validate the infrastructure through the project typecheck path that invokes
  `tsgo --noEmit`.

## Acceptance Criteria

- [x] `repos/effect/` remains present as a squashed subtree and the pinned
      upstream split is recorded.
- [x] No application or test code imports from `repos/effect/`.
- [x] No runtime dependency on `@effect/cli` is present.
- [x] Local Effect guidance names the v4 CLI import path
      `effect/unstable/cli`, not `@effect/cli`.
- [x] Editor settings exclude `repos/**` from TypeScript and JavaScript
      auto-import suggestions, search, and watching.
- [x] `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck` passes through
      `@effect/tsgo`.
- [x] No broad Symphony runtime behavior is added in this infrastructure task.

## Notes

- Official docs: <https://effect.website/docs/getting-started/introduction/>
- Official blog:
  <https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive/>
- tsgo source: <https://github.com/Effect-TS/tsgo>
- Agentic feedback-loop example:
  <https://github.com/mikearnaldi/accountability>

## Out Of Scope

- Implementing the next Symphony runtime/API migration slice.
- Editing files under `repos/effect/`.
- Replacing `@effect/tsgo` with standalone `@effect/language-service`.
- Introducing a non-Effect CLI framework.
