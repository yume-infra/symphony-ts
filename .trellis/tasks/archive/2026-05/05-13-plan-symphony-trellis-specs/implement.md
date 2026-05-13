# Implementation Plan

## Planning Checklist

- [x] Create task and capture initial planning facts.
- [x] Decide strict conformance posture.
- [x] Decide first-pass handling for core, safety, extension, dashboard, HTTP, and SSH scope.
- [x] Add `SPEC.md` conformance checklist.
- [x] Decide Effect reference strategy.
- [x] Decide monorepo migration prerequisite.
- [x] Decide Vitest test infrastructure prerequisite.
- [x] Decide AI infrastructure priority and debug playbook policy.
- [x] Review planning artifacts with the user.
- [x] After approval, start implementation phase with `task.py start`.

## Ordered Execution After Approval

1. [x] Revise Trellis specs to encode the strict conformance posture and deferred extensions.
2. [x] Add/update spec references to the conformance checklist.
3. [x] Prepare Effect reference vendoring and pattern-doc generation plan.
4. [x] Record that the user's monorepo setup reference is required before migration design.
5. [x] Record Vitest and Effect-first test helper/fake-service conventions.
6. [x] Add minimum AI infrastructure direction: worktree/bootstrap, `/goal` loading, seed debug
   playbooks.
7. [x] Re-run Trellis package/spec discovery.
8. [x] Run project verification.

Monorepo migration, Effect vendoring, Vitest installation, and seed playbook creation are
prerequisites for the later runtime implementation handoff, not implementation work for this spec
revision task.

## Validation Commands

```bash
rtk python3 ./.trellis/scripts/get_context.py --mode packages
rtk python3 ./.trellis/scripts/task.py validate 05-13-plan-symphony-trellis-specs
rtk pnpm verify
```

Commands may need updates after monorepo migration.

## Risk Points

- Do not edit `.trellis/spec/` before user approval.
- Do not start runtime implementation in this task.
- Do not copy external monorepo setup without adapting it to Symphony-ts.
- Do not import application code from vendored Effect reference material.
- Do not let dashboard/HTTP/SSH scope slip back into first-pass runtime implementation.
- Keep debug playbooks honest: seed content before `/goal`, real lessons during implementation.
