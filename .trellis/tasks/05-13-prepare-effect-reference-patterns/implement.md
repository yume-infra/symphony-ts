# Implementation Plan

## Planning Checklist

- [x] Create Trellis task.
- [x] Capture requirements from archived pre-runtime planning decisions.
- [x] Keep scope to Effect reference and pattern docs.

## Ordered Execution After Approval

1. [ ] Start the task with `task.py start`.
2. [ ] Read current package/catalog versions.
3. [ ] Research upstream Effect tags/commits aligned to current package versions.
4. [ ] Choose reference path and pinning mechanism.
5. [ ] Vendor/pin the full upstream Effect monorepo as read-only reference.
6. [ ] Add reference metadata and update instructions.
7. [ ] Create project-local Effect pattern docs.
8. [ ] Cross-link docs from task checklist and, only if explicitly justified, Trellis specs.
9. [ ] Run validation.
10. [ ] Update checklist and finish the task.

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
