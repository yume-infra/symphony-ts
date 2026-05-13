# Goal Context

## Purpose

Future Codex CLI `/goal` runs should be able to implement Symphony-ts from repository context,
without relying on prior chat history.

## Required Context For `/goal`

Before a long implementation loop, ensure the active task includes:

- task `prd.md`
- task `design.md`
- task `implement.md`
- relevant `.trellis/spec/*/index.md`
- detailed specs for touched layers
- `AGENTS.md`
- relevant `SPEC.md` sections

## Suggested `/goal` Flow

1. Create a Trellis task for the implementation slice.
2. Write or update PRD/design/implement artifacts.
3. Add context manifests pointing to relevant specs.
4. Start the task.
5. Run `/goal` with instructions to follow Trellis context and keep changes scoped.
6. Verify with `pnpm verify` and task-specific tests.
7. Update specs when implementation teaches a durable rule.

## Context Hygiene

- Do not load every spec for every task.
- Prefer layer indexes first, then detailed files for touched areas.
- Keep product decisions in specs, not only in chat.
- Keep temporary task constraints in the task artifacts, not global specs.
