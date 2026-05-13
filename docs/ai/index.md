# AI Infrastructure

This directory is the maintained, docs-first entrypoint for Symphony-ts agent workflow,
`/goal` handoff, and debug playbooks.

It is intentionally separate from:

- `.trellis/spec/`, which holds durable project contracts.
- `.codex/`, which holds executable Codex configuration, hooks, and agent definitions.
- `.agents/skills/`, which holds reusable skills only after a workflow is stable enough to package.

## Documents

| Document | Purpose |
| --- | --- |
| [Worktree Bootstrap](./worktree-bootstrap.md) | Repository cwd, package targeting, install, validation, and workspace safety rules. |
| [Goal Context](./goal-context.md) | What future `/goal` runs must load and how to keep context scoped. |
| [Debug Playbooks](./debug-playbooks/index.md) | Shared update format and seed debug playbook index. |
| [Effect And tsgo](./debug-playbooks/effect-tsgo.md) | Effect, `@effect/tsgo`, and native-preview diagnostics loop. |
| [Codex App Server](./debug-playbooks/codex-app-server.md) | Protocol/schema drift, startup, tool calls, and no-stall debugging. |
| [Linear Integration](./debug-playbooks/linear-integration.md) | Linear fake/real integration and `linear_graphql` boundary debugging. |
| [Orchestrator Runtime](./debug-playbooks/orchestrator-runtime.md) | Concurrency, retry, reconciliation, workspace cleanup, and stalls. |

## Current Boundary

This is documentation and lightweight infrastructure. It does not implement Symphony runtime
behavior, install new skills, add commit/push/land automation, or define a production operator
surface.

Before broad runtime work is handed to `/goal`, this repository should have:

- Effect reference and project-local Effect pattern docs.
- Monorepo-aware validation and package layout.
- Vitest and Effect-first test helpers/fakes.
- Worktree/bootstrap rules.
- `/goal` context-loading rules.
- Seed debug playbooks.

## Skills Policy

Do not create AI infrastructure skills from these docs until the underlying workflow is stable.

A future skill is appropriate only when it has:

- a repeatable trigger and task boundary
- stable command inputs and outputs
- known failure modes and validation checks
- stable log/debug identifiers where relevant
- a clear reason to bundle scripts or procedural guardrails

When a future skill is created, keep it thin. Link back to `docs/ai/` for maintained reference
material instead of copying these docs into `SKILL.md`.

## Command Notes

Project documentation lists canonical commands without wrappers. In Codex CLI sessions that use the
local RTK proxy, prefix shell commands with `rtk`, for example `rtk pnpm verify`.
