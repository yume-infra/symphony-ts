# Design: Strict Conformance Preparation

## Objective

Prepare Symphony-ts for a strict first-pass implementation of `SPEC.md` by revising Trellis specs and
front-loading the infrastructure that must exist before a `/goal` runtime implementation handoff.

## Conformance Posture

The first implementation pass targets strict conformance, not a narrowed MVP subset.

In scope:

- All `SPEC.md` section 18.1 required conformance items.
- Core-path `SHOULD` / `RECOMMENDED` clauses that support required runtime behavior.
- Safety posture and documentation clauses.
- Internal runtime snapshot contract.
- `linear_graphql` client-side tool extension.

Deferred:

- Human-readable status surface.
- HTTP server, dashboard, and JSON REST API extension.
- Section 18.2 future extension TODOs.
- Appendix A SSH worker extension.

## Pre-Goal Gates

Before handing the main runtime implementation to `/goal`, complete these gates:

1. Effect reference and pattern gate
   - Vendor the full upstream Effect monorepo as read-only reference material.
   - Pin the reference to a commit/tag aligned with current dependency versions.
   - Generate project-local Effect pattern docs for services/layers, resources, fibers, schedules,
     typed errors, CLI entrypoint, and `@effect/tsgo` diagnostics.

2. Monorepo migration gate
   - Use the user's forthcoming monorepo setup reference.
   - Migrate Symphony-ts to the target monorepo shape before runtime implementation.
   - Keep the public command shape `symphony-ts [workflow-path]`.

3. Test infrastructure gate
   - Adopt Vitest.
   - Provide Effect-first test helpers.
   - Provide fake service patterns for Linear, Codex app-server, workspace/filesystem boundaries,
     and time/scheduling.

4. AI infrastructure gate
   - Document worktree/bootstrap and cwd/package safety rules.
   - Document `/goal` context-loading rules.
   - Create seed debug playbooks.
   - Treat debug playbooks as living artifacts updated during implementation.

## Spec Revision Shape

The current six Trellis spec layers stay:

- `symphony/`
- `runtime-orchestration/`
- `external-integrations/`
- `typescript-effect/`
- `testing-conformance/`
- `quality-operations/`

Revisions should clarify:

- strict conformance scope and deferred extensions,
- pre-goal gates,
- monorepo-oriented paths and package assumptions,
- Effect pattern docs as the first source after `SPEC.md`,
- Vitest and fake-service testing conventions,
- AI infrastructure and living playbook update rules.

## Progress Tracking

`spec-conformance-checklist.md` is the task-local progress authority for aligning implementation
work with `SPEC.md`. Future tasks should update it when scope decisions or implementation progress
change.
