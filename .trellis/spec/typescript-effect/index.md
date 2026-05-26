# TypeScript Effect Guidelines

> TypeScript, Effect, CLI, services, layers, errors, resources, and diagnostics conventions.

## Scope

Read this layer before writing TypeScript runtime code.

## Pre-Development Checklist

- [ ] Check current dependency versions in `package.json`.
- [ ] Confirm the active Effect baseline in `pnpm-lock.yaml`: `effect@4.0.0-beta.66` and
      `@effect/platform-node@4.0.0-beta.66` unless package metadata says otherwise.
- [ ] Confirm `repos/effect/` exists as the only vendored upstream Effect source path.
- [ ] Run or trust the latest passing `pnpm effect:source:verify` before relying on the pinned
      source.
- [ ] Read the project-local Effect pattern docs before writing service, layer, fiber, schedule, or
      resource code.
- [ ] Read `repos/effect/LLMS.md` before non-trivial Effect API work.
- [ ] Use `@effect/tsgo` diagnostics; do not assume generic TypeScript feedback is enough.
- [ ] Keep the package entrypoint thin after monorepo migration.
- [ ] Model runtime capabilities as Effect services and layers.
- [ ] Prefer current Effect docs and local source/reference material over memory.

## Quality Check

- [ ] `pnpm typecheck` passes with `tsgo --noEmit`.
- [ ] No floating Effects.
- [ ] Long-running program execution uses `NodeRuntime.runMain`.
- [ ] Expected failures are typed errors.
- [ ] External resources have scoped lifecycle or finalizers.

## Pre-Goal Gate

Do not hand the main runtime implementation to `/goal` until the repository has:

- upstream Effect v4 beta source reference material under `repos/effect/`
- executable source-pin verification through `pnpm effect:source:verify`
- curated project-local Effect pattern docs
- monorepo layout migration completed from the user's setup reference
- Vitest/Effect test infrastructure in place

## Guides

| Guide | Purpose |
| --- | --- |
| [Project Structure](./project-structure.md) | Expected source module boundaries. |
| [Effect Patterns](./effect-patterns.md) | Services, layers, concurrency, resources. |
| [CLI Patterns](./cli-patterns.md) | Minimal Effect v4 beta CLI entrypoint. |
| [Error And Resource Model](./error-resource-model.md) | Typed errors and resource safety. |
| [tsgo And LLM Workflow](./tsgo-and-llm-workflow.md) | Diagnostics and agent coding flow. |
