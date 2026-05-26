# Implementation Plan

1. Add `repos/effect.pin.json`.
2. Add `scripts/effect-source-pin.mjs` with `verify` and `update` modes.
3. Add `effect:source:verify` and `effect:source:update` root package scripts,
   and prepend source-pin verification to `verify`.
4. Update `AGENTS.md`, `docs/effect-patterns/index.md`, and the
   TypeScript-Effect spec to mention `repos/effect/LLMS.md`.
5. Add VS Code `files.exclude` for `repos/**`.
6. Run:

```bash
pnpm effect:source:verify
rtk proxy pnpm verify
```

7. Confirm no vendored Effect files changed.

## Validation Results

- `pnpm effect:source:verify` passed.
- `rtk proxy pnpm verify` passed and ran `pnpm effect:source:verify` first.
- No files under `repos/effect/` were modified.
- `tsgo` still reports the pre-existing non-failing suggestions in
  `src/tracker/linear.ts` and `src/workflow/runtime.ts`; those remain follow-up
  runtime/API migration work, not source-pin infrastructure.
