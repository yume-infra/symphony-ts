# Implementation Plan

## Planning Checklist

- [x] Create Trellis task.
- [x] Capture requirements from archived pre-runtime planning decisions.
- [x] Keep scope to Effect reference and pattern docs.

## Ordered Execution After Approval

1. [x] Start the task with `task.py start`.
2. [x] Read current package/catalog versions.
3. [x] Research upstream Effect tags/commits aligned to current package versions.
4. [x] Choose reference path and pinning mechanism.
5. [x] Vendor/pin the full upstream Effect monorepo as read-only reference.
6. [x] Add reference metadata and update instructions.
7. [x] Create project-local Effect pattern docs.
8. [x] Cross-link docs from task checklist and maintained docs; Trellis specs intentionally left unchanged.
9. [x] Run validation.
10. [x] Update checklist and finish the task.

## Validation Commands

```bash
rtk pnpm verify
rtk git status --short
rtk python3 ./.trellis/scripts/task.py validate 05-13-prepare-effect-reference-patterns
```

Additional checks may be needed depending on the selected reference strategy.

## Risk Points

- Do not import application code from reference source.
- Do not edit vendored upstream files.
- Do not use standalone `@effect/language-service`.
- Keep docs concise enough for future agents to actually read.
- Avoid implementing Symphony runtime while writing examples.
