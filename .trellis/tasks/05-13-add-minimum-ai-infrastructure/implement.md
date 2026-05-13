# Implementation Plan

## Planning Checklist

- [x] Create Trellis task.
- [x] Capture requirements from pre-runtime planning decisions.
- [x] Keep scope to minimum AI infrastructure and seed playbooks.

## Ordered Execution After Approval

1. [ ] Start the task with `task.py start`.
2. [ ] Inspect existing `.agents/`, `.codex/`, `AGENTS.md`, and relevant Trellis specs.
3. [ ] Choose docs/playbook directory.
4. [ ] Write worktree/bootstrap rules.
5. [ ] Write `/goal` context-loading rules.
6. [ ] Write seed Effect/tsgo debug playbook.
7. [ ] Write seed Codex app-server debug playbook.
8. [ ] Write seed Linear integration debug playbook.
9. [ ] Write seed orchestrator runtime debug playbook.
10. [ ] Document living-playbook update rule.
11. [ ] Run validation.
12. [ ] Update checklist and finish the task.

## Validation Commands

```bash
rtk pnpm verify
rtk git status --short
rtk python3 ./.trellis/scripts/task.py validate 05-13-add-minimum-ai-infrastructure
```

## Risk Points

- Do not copy another project's AI infrastructure wholesale.
- Do not introduce commit/push/land skills yet.
- Do not encode stale single-package assumptions; use current monorepo paths.
- Do not start runtime implementation.
