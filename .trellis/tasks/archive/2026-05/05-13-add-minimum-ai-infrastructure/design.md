# Design: Minimum AI Infrastructure

## Objective

Seed the repository-level instructions and playbooks needed for safe future `/goal` runtime work.
This is documentation and lightweight infrastructure, not runtime implementation.

## Chosen Artifact Shape

Create maintained AI infrastructure docs under `docs/ai/`:

```text
docs/ai/
  index.md
  worktree-bootstrap.md
  goal-context.md
  debug-playbooks/
    effect-tsgo.md
    codex-app-server.md
    linear-integration.md
    orchestrator-runtime.md
```

This path is intentionally outside `.trellis/spec/` and `.codex/`:

- `.trellis/spec/` remains the durable project contract layer.
- `.codex/` remains executable Codex configuration, hooks, and agent definitions.
- `docs/ai/` becomes a concise, maintained load target for future `/goal` prompts and debug loops.

## Docs Before Skills

Do not create a skill as part of this task. The AI infrastructure is still defining project
conventions, not packaging a stable repeated workflow.

Create future project-local skills only after the underlying workflow has stabilized enough to have:

- a repeatable trigger and task boundary
- stable command inputs and outputs
- known failure modes and validation checks
- stable log/debug identifiers where relevant
- a clear reason to bundle scripts or procedural guardrails

When those conditions are met, the skill should be a thin procedural entrypoint that links to
`docs/ai/` for maintained reference material instead of copying the docs into `SKILL.md`.

## Worktree And Bootstrap Rules

Document:

- expected cwd for repository work: repository root unless a package-specific command explicitly
  requires `apps/cli` or a future `libs/*` package
- monorepo package path conventions: `apps/cli` for the public `symphony-ts` CLI and `libs/*` for
  future runtime/domain/testing packages
- dependency install command: `pnpm install`
- validation commands: root `pnpm verify` plus targeted package commands such as
  `pnpm --filter symphony-ts typecheck`, `test`, `build`, and `smoke:bin`
- generated/cache directories not to commit
- package-target safety for future agent launch

## `/goal` Context Rules

Future `/goal` runs should load only the context they need. The common starting set is:

- active task artifacts: `prd.md`, `design.md`, `implement.md`, and any task checklist
- `AGENTS.md`
- relevant `SPEC.md` sections
- relevant `.trellis/spec/*/index.md` files first, then detailed files for touched layers
- Effect pattern docs from `.trellis/spec/typescript-effect/`
- testing/conformance docs from `.trellis/spec/testing-conformance/`
- package paths and validation commands
- `docs/ai/index.md` and specific playbooks only when the task touches agent workflow,
  integrations, debugging, or `/goal` handoff

## Debug Playbooks

Playbooks should be seed docs, not fake lessons. Each starts with official/local diagnostic entry
points and expected investigation order.

Each future real issue update should record:

- symptom
- root cause
- failed fixes and why
- correct investigation order
- test/assertion added
- spec/checklist update needed

## Boundaries

- Do not install brittle full automation before runtime conventions exist.
- Do not copy OpenAI Symphony `.codex/` files directly.
- Do not create AI infrastructure skills before the workflows are stable.
- Do not implement runtime modules.
- Keep docs practical and short enough for future agents to load.
- Do not mark the pre-`/goal` gate complete until the docs exist and the task checklist is updated.
