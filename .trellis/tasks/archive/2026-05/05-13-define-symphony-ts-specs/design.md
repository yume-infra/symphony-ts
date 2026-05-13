# Design: Symphony-ts Project Specs

## Architecture

The Trellis spec library should mirror Symphony-ts implementation boundaries rather than generic
frontend/backend layers.

```text
.trellis/spec/
  symphony/
  runtime-orchestration/
  external-integrations/
  typescript-effect/
  testing-conformance/
  quality-operations/
  guides/
```

## Layer Responsibilities

### `symphony/`

Defines product identity, conformance posture, domain vocabulary, and explicit deviation policy.

### `runtime-orchestration/`

Defines the internal service runtime: workflow loading, typed config, dynamic reload, orchestrator
state, workspace lifecycle, retry, reconciliation, and shutdown behavior.

### `external-integrations/`

Defines boundaries for Linear, Codex app-server, prompt rendering, and optional client-side tools.

### `typescript-effect/`

Defines how this repository uses TypeScript, Effect, `@effect/cli`, `@effect/platform-node`, services,
layers, typed errors, resources, schedules, and tsgo diagnostics.

### `testing-conformance/`

Maps `SPEC.md` conformance expectations to local tests, fakes, integration profiles, and validation
commands.

### `quality-operations/`

Defines safety checks, logging/observability expectations, AI infrastructure direction, review
rules, and future `/goal` context usage.

## Conformance Model

`SPEC.md` is a conformance baseline. Future implementation work should default to following it.
Intentional differences are allowed only when recorded as project decisions with:

- decision
- rationale
- divergence from `SPEC.md`
- implementation consequences
- tests required

## Context Strategy

Future `/goal` runs should not depend on chat history. They should load:

- task PRD/design/implement files
- the relevant `.trellis/spec/*/index.md` entry points
- detailed spec files for touched implementation areas
- `AGENTS.md`
- `SPEC.md` sections relevant to the task

The task context manifests should include the new spec entry points so Trellis agents and inline
Codex sessions know where to start.

## Compatibility Notes

- This task intentionally removes the old `backend/` and `frontend/` spec templates.
- `.trellis/spec/guides/` remains available as shared thinking material.
- `AGENTS.md` remains a temporary high-level project note, but `.trellis/spec/` becomes the durable
  implementation authority after this task.

## Risks

- Writing specs too narrowly could prematurely lock MVP scope.
- Writing specs too broadly could make `/goal` context noisy.
- Mixing Effect v3 and v4 guidance could cause invalid code. Specs must prioritize current
  `package.json` versions.
- The OpenAI Symphony `.codex/` setup contains Elixir-specific assumptions and must remain reference
  material, not copied infrastructure.
