# Implementation Plan

## Steps

1. Confirm the existing subtree pin and dependency baseline.
2. Update task artifacts so this migration slice has explicit acceptance
   criteria.
3. Fix stale local guidance that still points agents at `@effect/cli`.
4. Ensure editor settings exclude `repos/**` from both TypeScript and
   JavaScript auto-import suggestions.
5. Run the tsgo-backed package typecheck as the acceptance gate.
6. Record any remaining migration findings for the next runtime/API slice.

## Validation Commands

```bash
rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck
```

If the typecheck passes and the changed files are limited to infrastructure
guidance/configuration, this task is complete.

## Validation Results

- `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck` passed.
- `rtk proxy pnpm verify` passed.
- `tsgo` emitted non-failing suggestions for future migration work:
  `preferSchemaOverJson` in `src/tracker/linear.ts`, `leakingRequirements` in
  `src/tracker/linear.ts`, and `runEffectInsideEffect` in
  `src/workflow/runtime.ts`.

## Rollback Points

- Revert `.trellis/tasks/05-26-effect-v4-infrastructure/*` if the planning
  scope needs to be rewritten.
- Revert `.trellis/spec/typescript-effect/*` or `.vscode/settings.json` if the
  user wants to keep older local guidance temporarily.
