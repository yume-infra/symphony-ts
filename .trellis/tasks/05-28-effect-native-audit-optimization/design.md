# Design

## Authorities

The audit uses this source order:

1. `package.json` and `pnpm-lock.yaml` for installed Effect versions.
2. `docs/effect-patterns/` for project-local practice summaries.
3. `repos/effect/LLMS.md` and targeted files under `repos/effect/ai-docs/src/`.
4. Targeted upstream source and tests under `repos/effect/packages/`.
5. `tsgo` diagnostics from the package typecheck gate.
6. Trellis specs for durable project decisions.

## Audit Model

Create and maintain a small audit asset that records:

- module or flow name
- local files inspected
- upstream practice references
- current pattern observed
- risk level
- decision: keep, optimize now, defer, or document exception
- verification command evidence

The audit asset is the harness for relentless iteration. It prevents the work from becoming a one-off
style sweep and lets future turns continue from evidence.

## Optimization Categories

1. Function shape: prefer `Effect.fn("name")` for exported functions returning effects and named
   service methods; keep local short orchestration inline when clearer.
2. Orchestration shape: use `Effect.gen` for multi-step flows and explicit callbacks in pipes when
   inference or stack clarity matters.
3. Service and layer shape: use `Context.Service` for capabilities; avoid ad hoc dependency bags.
4. Error shape: use tagged expected errors at integration boundaries; preserve defects for programmer
   mistakes.
5. Resource shape: use scopes, finalizers, fibers, schedules, and interruption-aware loops for
   long-running work.
6. Platform shape: prefer Effect platform services for integration boundaries when they keep code
   clearer and testable.
7. Test shape: run Effect programs through Effect-aware helpers and fake layers.

## Documentation Assets

The task may add or update:

- `docs/effect-patterns/*` for general practice guides.
- `.trellis/spec/typescript-effect/*` for enforceable project conventions.
- `.trellis/tasks/<task>/research/*` for pass-by-pass audit evidence.
- `docs/adr/*` for decisions with long-term tradeoffs.

Documentation should name the upstream reference that justified a convention and distinguish hard
rules from local preferences.

## Risk Control

- Keep code edits module-scoped and verify after each cluster.
- Avoid broad refactors that mix practice optimization with product behavior changes.
- Do not change public CLI behavior unless the audited practice requires a bug fix in the entrypoint.
- When a pattern is uncertain, record the evidence gap before deferring instead of guessing.
