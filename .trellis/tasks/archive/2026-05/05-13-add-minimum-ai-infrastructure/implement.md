# Implementation Plan

## Planning Checklist

- [x] Create Trellis task.
- [x] Capture requirements from pre-runtime planning decisions.
- [x] Keep scope to minimum AI infrastructure and seed playbooks.
- [x] Resolve maintained docs location as `docs/ai/` based on current repository structure.
- [x] Identify current root/package validation commands from `package.json`, `README.md`, and
      `apps/cli/package.json`.
- [x] Decide docs-first for this task and defer project-local AI infrastructure skills until
      workflows stabilize.
- [x] User reviewed and approved the planning direction.

## Ordered Execution After Approval

1. [x] Start the task with `task.py start`.
2. [x] Inspect existing `.agents/`, `.codex/`, `AGENTS.md`, and relevant Trellis specs.
3. [x] Confirm no new `.agents/skills/` or `.codex/skills/` are needed for this task.
4. [x] Create `docs/ai/` and `docs/ai/debug-playbooks/`.
5. [x] Write `docs/ai/index.md` as the short navigation and pre-`/goal` handoff summary.
6. [x] Write `docs/ai/worktree-bootstrap.md`.
7. [x] Write `docs/ai/goal-context.md`.
8. [x] Write `docs/ai/debug-playbooks/effect-tsgo.md`.
9. [x] Write `docs/ai/debug-playbooks/codex-app-server.md`.
10. [x] Write `docs/ai/debug-playbooks/linear-integration.md`.
11. [x] Write `docs/ai/debug-playbooks/orchestrator-runtime.md`.
12. [x] Document the living-playbook update template in the debug playbook index or each playbook.
13. [x] Update `ai-infrastructure-checklist.md` and acceptance criteria.
14. [x] Run validation.
15. [ ] Finish the task.

## Validation Commands

```bash
rtk pnpm verify
rtk git status --short
rtk python3 ./.trellis/scripts/task.py validate 05-13-add-minimum-ai-infrastructure
```

## Risk Points

- Do not copy another project's AI infrastructure wholesale.
- Do not introduce commit/push/land skills yet.
- Do not introduce any new AI infrastructure skill in this task; document future extraction criteria
  instead.
- Do not encode stale single-package assumptions; use current monorepo paths.
- Do not start runtime implementation.
- Keep docs concise enough for `/goal` context loading; link to Trellis specs instead of duplicating
  long spec content.
