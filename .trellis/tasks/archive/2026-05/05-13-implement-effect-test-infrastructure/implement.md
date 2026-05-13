# Implementation Plan

## Planning Checklist

- [x] Create Trellis task.
- [x] Inspect current Vitest wiring and package scripts.
- [x] Inspect testing-conformance specs.
- [x] Decide scope: test infrastructure only, no runtime implementation.
- [x] Write `prd.md`, `design.md`, and `implement.md`.

## Ordered Execution After Approval

1. [x] Start the task with `task.py start`.
2. [x] Add `apps/cli/tests/support/effect.ts`.
3. [x] Add narrow support modules for fixtures and fake boundaries.
4. [x] Add `apps/cli/src/index.test.ts` for current CLI logic.
5. [x] Remove `passWithNoTests` from `apps/cli/vitest.config.ts`.
6. [x] Update Knip config only if new test-support exports need explicit handling.
7. [x] Run package-level tests and full verification.
8. [x] Fix lint/typecheck/knip issues.
9. [x] Update task acceptance criteria.

## Validation Commands

```bash
rtk pnpm --filter symphony-ts test
rtk proxy pnpm --filter symphony-ts typecheck
rtk pnpm verify
rtk pnpm smoke:bin
rtk python3 ./.trellis/scripts/task.py validate 05-13-implement-effect-test-infrastructure
```

`rtk proxy` was used for the filtered typecheck because the plain `rtk pnpm --filter symphony-ts
typecheck` path rewrote the command incorrectly while the underlying package script passed.

## Risk Points

- Do not introduce application runtime interfaces before the runtime design exists.
- Do not create fake services that hide missing production contracts.
- Do not leave `passWithNoTests` as the reason tests pass once a real test exists.
- Keep direct `Effect.runPromise` use inside shared test helper only.
- Keep support helpers dependency-light; use built-in Node/Vitest/Effect facilities.
