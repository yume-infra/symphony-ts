# Implementation Plan

## Checklist

- [x] Replace `backend/` and `frontend/` spec layers with Symphony-ts layers.
- [x] Write `symphony/` specs for product shape, conformance, and domain model.
- [x] Write `runtime-orchestration/` specs for service runtime internals.
- [x] Write `external-integrations/` specs for Linear, Codex, prompt rendering, and tools.
- [x] Write `typescript-effect/` specs for Effect architecture and TypeScript conventions.
- [x] Write `testing-conformance/` specs for validation profiles and fakes.
- [x] Write `quality-operations/` specs for logs, safety, AI infrastructure, and `/goal`.
- [x] Add task context entries for the new spec entry points.
- [x] Validate package/spec discovery.
- [x] Run project verification.

## Validation Commands

```bash
rtk python3 ./.trellis/scripts/get_context.py --mode packages
rtk python3 ./.trellis/scripts/task.py validate 05-13-define-symphony-ts-specs
rtk pnpm verify
```

## Risk Points

- Do not edit Trellis-managed workflow internals.
- Do not implement runtime code in this task.
- Do not vendor Effect source in this task.
- Do not copy OpenAI Symphony `.codex/` skills directly.
- Keep specs concrete enough for `/goal`, but leave unresolved product decisions visible for the
  next planning task.

## Rollback

If the spec structure proves wrong, restore the previous `.trellis/spec/backend/` and
`.trellis/spec/frontend/` template directories from git and revise the design before retrying.
