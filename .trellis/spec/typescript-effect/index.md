# TypeScript Effect Guidelines

> TypeScript, Effect, CLI, services, layers, errors, resources, and diagnostics conventions.

## Scope

Read this layer before writing TypeScript runtime code.

## Pre-Development Checklist

- [ ] Check current dependency versions in `package.json`.
- [ ] Use `@effect/tsgo` diagnostics; do not assume generic TypeScript feedback is enough.
- [ ] Keep `src/index.ts` as a thin entrypoint.
- [ ] Model runtime capabilities as Effect services and layers.
- [ ] Prefer current Effect docs and local source/reference material over memory.

## Quality Check

- [ ] `pnpm typecheck` passes with `tsgo --noEmit`.
- [ ] No floating Effects.
- [ ] Long-running program execution uses `NodeRuntime.runMain`.
- [ ] Expected failures are typed errors.
- [ ] External resources have scoped lifecycle or finalizers.

## Guides

| Guide | Purpose |
| --- | --- |
| [Project Structure](./project-structure.md) | Expected source module boundaries. |
| [Effect Patterns](./effect-patterns.md) | Services, layers, concurrency, resources. |
| [CLI Patterns](./cli-patterns.md) | Minimal `@effect/cli` entrypoint. |
| [Error And Resource Model](./error-resource-model.md) | Typed errors and resource safety. |
| [tsgo And LLM Workflow](./tsgo-and-llm-workflow.md) | Diagnostics and agent coding flow. |
