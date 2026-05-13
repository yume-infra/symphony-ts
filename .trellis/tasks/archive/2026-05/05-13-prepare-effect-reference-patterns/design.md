# Design: Effect Reference And Pattern Docs

## Objective

Give future Symphony runtime work a reliable local Effect reference and a compact set of
project-local patterns. The goal is to reduce API guessing and prevent broad runtime code from being
written against stale Effect assumptions.

## Inputs

- `pnpm-workspace.yaml` catalog versions
- `apps/cli/package.json`
- `SPEC.md`
- `.trellis/spec/typescript-effect/*`
- Official Effect docs and upstream Effect monorepo
- `@effect/tsgo` diagnostics

## Reference Strategy

The implementation should pin the full upstream Effect monorepo, not only installed package
artifacts. The reference must be clearly read-only.

Candidate storage patterns:

- `repos/effect/` as a vendored/reference checkout
- `reference/effect/` if a future convention prefers non-source wording
- a git submodule only if the user explicitly prefers submodule management

The selected approach must document:

- upstream URL
- commit/tag
- package version alignment rationale
- update command/process
- read-only import boundary

## Pattern Docs

Create concise, project-local docs that summarize the Effect patterns Symphony-ts should use. These
docs should be easier to consume than raw source spelunking.

Suggested location:

```text
docs/effect-patterns/
  index.md
  services-and-layers.md
  resources-and-finalizers.md
  fibers-and-interruption.md
  schedules-and-time.md
  state-tools.md
  typed-errors.md
  cli-and-node-runtime.md
  tsgo-diagnostics.md
```

If implementation finds a better local docs convention, it may adjust the path, but future `/goal`
instructions must be able to locate the docs easily.

## Boundaries

- Vendored/reference source is for reading only.
- Application source imports only normal workspace/package dependencies.
- Pattern docs may include short examples, but should not become a runtime implementation.
- Do not add Symphony services in this task.

## Verification

- Confirm reference metadata is present.
- Confirm docs link to source/reference entry points.
- Run `pnpm verify`.
- If a docs-only path causes lint/knip churn, adjust ignores only when justified.
