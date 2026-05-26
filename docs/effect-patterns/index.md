# Effect Pattern Docs

These docs are the first Effect reference for Symphony runtime implementation.
Read the relevant page before writing services, resources, workers, schedules,
state handling, errors, or CLI entrypoint code.

The upstream Effect v4 beta source is vendored locally at `repos/effect/`.
It is a squashed subtree from `Effect-TS/effect-smol`, the repository published
in the `effect@4.0.0-beta.66` package metadata. The selected upstream commit is
`b559d68845f848a10153395778f035682d399075`.

The executable pin authority is `repos/effect.pin.json`. Verify it with:

```bash
pnpm effect:source:verify
```

## Pinned Source Maintenance

The pinned source follows the official Effect LLM workflow: keep the real
upstream source in-repo as a squashed subtree so agents can inspect it without
depending on `node_modules` or a separate clone.

Update it only as a deliberate infrastructure task:

```bash
pnpm effect:source:update
```

After updating, record the new `git-subtree-split` commit in
`repos/effect.pin.json` and this file, then run `pnpm effect:source:verify` and
the `tsgo` validation loop before changing runtime code.

## Version Baseline

- `effect@4.0.0-beta.66`
- `@effect/platform-node@4.0.0-beta.66`
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
   - `repos/effect/LLMS.md`
   - <https://effect.website/llms.txt>
   - <https://effect.website/docs/requirements-management/services/>
   - <https://effect.website/docs/requirements-management/layers/>
   - <https://effect.website/docs/resource-management/introduction/>
   - <https://effect.website/docs/concurrency/fibers/>
   - <https://effect.website/docs/scheduling/built-in-schedules/>
   - <https://effect.website/docs/state-management/ref/>
   - <https://effect.website/docs/data-types/data/>
   - <https://effect.website/docs/code-style/guidelines/>
4. Vendored upstream source under `repos/effect/`.
5. `rtk pnpm typecheck` diagnostics from `@effect/tsgo`.

Do not guess Effect APIs from memory when `tsgo` or the pinned source can
answer the question.

## Import Boundary

Application code imports from installed dependencies only:

```ts
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
```

Imports from `repos/effect/` are forbidden. The subtree is read-only source
material, not an application dependency.
