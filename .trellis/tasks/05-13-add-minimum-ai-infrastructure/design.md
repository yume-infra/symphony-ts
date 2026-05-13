# Design: Minimum AI Infrastructure

## Objective

Seed the repository-level instructions and playbooks needed for safe future `/goal` runtime work.
This is documentation and lightweight infrastructure, not runtime implementation.

## Suggested Artifact Shape

Candidate locations:

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

If implementation discovers an existing project-local AI docs convention, use that instead.

## Worktree And Bootstrap Rules

Document:

- expected cwd for repository work
- monorepo package path conventions
- dependency install command
- validation commands
- generated/cache directories not to commit
- package-target safety for future agent launch

## `/goal` Context Rules

Future `/goal` runs should load only the context they need, but must include:

- active task artifacts
- `AGENTS.md`
- relevant `SPEC.md` sections
- relevant `.trellis/spec/` indexes and detailed files
- Effect pattern docs after the reference task lands
- testing/conformance docs
- package paths and validation commands

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
- Do not implement runtime modules.
- Keep docs practical and short enough for future agents to load.
