# Implementation Plan

## Planning Checklist

- [x] Create Trellis task.
- [x] Inspect current Vitest wiring and package scripts.
- [x] Inspect testing-conformance specs.
- [x] Decide scope: test infrastructure only, no runtime implementation.
- [x] Write `prd.md`, `design.md`, and `implement.md`.

## Ordered Execution After Approval

1. [ ] Start the task with `task.py start`.
2. [ ] Add `apps/cli/tests/support/effect.ts`.
3. [ ] Add narrow support modules for fixtures and fake boundaries.
4. [ ] Add `apps/cli/src/index.test.ts` for current CLI logic.
5. [ ] Remove `passWithNoTests` from `apps/cli/vitest.config.ts`.
6. [ ] Update Knip config only if new test-support exports need explicit handling.
7. [ ] Run package-level tests and full verification.
8. [ ] Fix lint/typecheck/knip issues.
9. [ ] Update task acceptance criteria.

## Validation Commands

```bash
rtk pnpm --filter symphony-ts test
rtk pnpm --filter symphony-ts typecheck
rtk pnpm verify
rtk pnpm smoke:bin
rtk python3 ./.trellis/scripts/task.py validate 05-13-add-effect-test-infrastructure
```

## Risk Points

- Do not introduce application runtime interfaces before the runtime design exists.
- Do not create fake services that hide missing production contracts.
- Do not leave `passWithNoTests` as the reason tests pass once a real test exists.
- Keep direct `Effect.runPromise` use inside shared test helper only.
- Keep support helpers dependency-light; use built-in Node/Vitest/Effect facilities.
