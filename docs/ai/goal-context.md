# Goal Context

Use this guide before handing a broad implementation slice to Codex `/goal` or another long-running
agent loop.

## Required Starting Context

Every `/goal` handoff should start from the active Trellis task:

- `prd.md`
- `design.md`, when present
- `implement.md`, when present
- task checklist files such as `*-checklist.md`
- `implement.jsonl` or `check.jsonl`, when curated entries exist

Then load project-wide authority:

- `AGENTS.md`
- relevant sections of `SPEC.md`
- `README.md` for current workspace shape and commands
- `docs/effect-patterns/index.md` before Effect runtime implementation
- relevant `.trellis/spec/*/index.md` files
- detailed `.trellis/spec/*/*.md` files only for touched layers

For AI infrastructure, agent workflow, debugging, or handoff work, also load:

- `docs/ai/index.md`
- `docs/ai/worktree-bootstrap.md`
- this file
- the specific debug playbook for the failure area

## Spec Selection

Use layer indexes first, then detailed specs:

- `symphony/` for product boundaries, vocabulary, and `SPEC.md` interpretation.
- `typescript-effect/` for Effect services, layers, resources, CLI, and tsgo diagnostics.
- `runtime-orchestration/` for workflow loading, orchestrator state, workspaces, retry, and stalls.
- `external-integrations/` for Linear, Codex app-server, prompt rendering, and client tools.
- `testing-conformance/` for deterministic fakes, real integration profiles, and validation.
- `quality-operations/` for logs, safety, `/goal`, verification, and AI infrastructure.

Do not load every spec for every task. Prefer the smallest set that covers the files and behavior
being changed.

## Handoff Checklist

Before starting `/goal`:

- confirm the task has clear acceptance criteria
- confirm the task has a scoped implementation plan
- confirm relevant specs and docs are discoverable from the task
- confirm validation commands are listed
- confirm out-of-scope areas are explicit
- confirm any generated or reference material is read-only unless the task says otherwise

For runtime implementation, do not proceed unless the pre-`/goal` gates in
`.trellis/spec/quality-operations/index.md` are complete or explicitly in progress for the current
task.

## Prompt Shape

Prefer prompts that name the active task and the files to load:

```text
Active task: .trellis/tasks/<task>

Load the task PRD/design/implement files, relevant .trellis/spec indexes and detailed specs, and
docs/ai context required for this task. Keep changes scoped to the task. Do not use prior chat
history as authority.
```

For runtime work, include the relevant `SPEC.md` sections and the specific conformance checklist.

## Context Hygiene

- Keep product decisions in `.trellis/spec/` or task artifacts, not only in chat.
- Keep temporary implementation constraints in task artifacts, not durable specs.
- Load detailed docs on demand instead of pasting large unrelated references.
- Prefer local current files over memory.
- When protocol shape matters, inspect current docs or generated schema instead of relying on stale
  examples.
- When Effect APIs are uncertain, use package versions, project-local pattern docs, official Effect
  docs, the vendored source under `repos/effect/`, and `@effect/tsgo` diagnostics.

## Validation

The default completion gate is:

```bash
pnpm verify
```

Use narrower package checks while iterating, but report the widest check that was actually run.
