# Effect native audit and optimization

## Goal

Audit Symphony's Effect usage against the pinned vendored Effect v4 beta source and project-local
Effect guides, then iteratively optimize runtime code and durable documentation so future work stays
Effect-native instead of merely type-correct.

## Requirements

- Treat `repos/effect/` and `repos/effect/LLMS.md` as the local upstream practice authority, with
  `docs/effect-patterns/` and `.trellis/spec/typescript-effect/` as project guidance.
- Preserve the import boundary: application and tests import Effect from package dependencies, never
  from `repos/effect/`.
- Inventory all maintained Effect code in the repository by module and by runtime flow.
- Compare each module/flow against official and project practices for:
  - `Effect.fn` / named spans for exported effectful functions.
  - `Effect.gen` orchestration clarity.
  - service boundaries with `Context.Service` and layers.
  - typed error boundaries and defect preservation.
  - scoped resources, finalizers, fibers, schedules, and interruption behavior.
  - platform service usage around filesystem, command/process, path, terminal, and runtime entry.
  - test harness usage, fake layers, and Effect-first execution.
- Apply scoped code optimizations when evidence shows current usage is weaker than recommended
  practice.
- Add or update ADR, guide, spec, and audit assets that make the practice durable for later agents.
- Keep the task incremental: each pass must leave an auditable module/flow status and a next queue.

## Constraints

- Do not edit vendored Effect source unless the user explicitly requests a source update task.
- Do not introduce new framework dependencies for CLI or runtime orchestration without explicit
  approval.
- Do not broaden CLI shape beyond `symphony-ts [workflow-path]` while performing this audit.
- Use `rtk` for shell commands and the project validation loop.
- Use `@effect/tsgo` diagnostics through the package typecheck gate for Effect code changes.

## Acceptance Criteria

- [x] A repository-wide Effect usage inventory exists and is kept current with module status.
- [x] Each maintained Effect module has been reviewed against the official practice checklist.
- [x] Every accepted optimization is implemented in a scoped change with passing local verification.
- [x] Any intentionally non-standard Effect usage is documented with a reason and follow-up trigger.
- [x] Project docs include durable Effect-native guidance beyond syntax correctness.
- [x] Trellis specs are updated when a repeatable convention or guardrail is discovered.
- [x] Verification evidence includes `pnpm effect:source:verify`, package typecheck, and the relevant
      full/project gates for touched areas.

## First Pass Scope

The first pass established the audit harness, then expanded to the maintained Effect runtime and
test surface. The acceptance criteria above are proven by `research/effect-usage-inventory.md` and
`research/verification-evidence.md`.
