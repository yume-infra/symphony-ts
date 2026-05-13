# Effect Pattern Docs

These docs are the first Effect reference for Symphony runtime implementation.
Read the relevant page before writing services, resources, workers, schedules,
state handling, errors, or CLI entrypoint code.

The pinned upstream source is available locally at `reference/effect/source/`.
If it is missing, recreate it from [reference/effect/README.md](../../reference/effect/README.md).

## Version Baseline

- `effect@3.21.2`
- `@effect/platform@0.96.1`
- `@effect/platform-node@0.106.0`
- `@effect/cli@0.75.1`
- `@effect/tsgo@0.7.0`
- `@typescript/native-preview@7.0.0-dev.20260513.1`

## Pattern Topics

- [Services And Layers](./services-and-layers.md)
- [Resources And Finalizers](./resources-and-finalizers.md)
- [Fibers And Interruption](./fibers-and-interruption.md)
- [Schedules And Time](./schedules-and-time.md)
- [State Tools](./state-tools.md)
- [Typed Errors](./typed-errors.md)
- [CLI And Node Runtime](./cli-and-node-runtime.md)
- [tsgo Diagnostics](./tsgo-diagnostics.md)

## Source Order

For non-trivial Effect code, use this order:

1. Current package versions in `pnpm-lock.yaml`.
2. These project-local pattern docs.
3. Official Effect docs:
   - <https://effect.website/llms.txt>
   - <https://effect.website/docs/requirements-management/services/>
   - <https://effect.website/docs/requirements-management/layers/>
   - <https://effect.website/docs/resource-management/introduction/>
   - <https://effect.website/docs/concurrency/fibers/>
   - <https://effect.website/docs/scheduling/built-in-schedules/>
   - <https://effect.website/docs/state-management/ref/>
   - <https://effect.website/docs/data-types/data/>
   - <https://effect.website/docs/code-style/guidelines/>
4. Pinned upstream source under `reference/effect/source/`.
5. `rtk pnpm typecheck` diagnostics from `@effect/tsgo`.

Do not guess Effect APIs from memory when `tsgo` or the pinned source can
answer the question.

## Import Boundary

Application code imports from installed dependencies only:

```ts
import { Effect, Layer } from "effect"
import { NodeRuntime } from "@effect/platform-node"
```

Imports from `reference/effect/source/` are forbidden. The reference checkout is
read-only source material, not an application dependency.
