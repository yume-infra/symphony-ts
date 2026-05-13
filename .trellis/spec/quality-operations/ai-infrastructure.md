# AI Infrastructure

## Direction

AI/coding-agent infrastructure is part of the final product surface. It should be introduced as the
runtime and repository conventions mature, not copied wholesale from another project.

## Reference Material

OpenAI Symphony's `.codex/` setup is useful reference material for:

- commit/push/pull/land skills
- Linear GraphQL workflows
- worktree initialization
- debug playbooks
- PR review/landing loops

Do not copy it directly because it currently contains Elixir, CI, logging, and repository-specific
assumptions.

## Expected Future Skills

Likely future `.codex/skills` or project-local equivalents:

- `commit`: commit with validation and project rationale
- `pull`: merge current branch with main safely
- `push`: publish branch and manage PR metadata
- `land`: watch reviews/checks and merge when green
- `linear`: use Symphony's configured `linear_graphql` tool
- `debug`: trace runtime logs by issue/session identifiers
- `worktree`: initialize isolated workspaces for agent runs

## Introduction Rule

Add AI infrastructure only when the matching project conventions exist:

- TypeScript validation command
- CI behavior
- PR template/review flow
- runtime log path/format
- implemented Linear/Codex tool surface

Until then, document the desired direction rather than installing brittle automation.
