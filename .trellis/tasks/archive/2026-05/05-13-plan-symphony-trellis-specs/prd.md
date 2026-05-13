# Plan Symphony Trellis specs

## Goal

Review the first Symphony-ts Trellis spec library, decide the unresolved project policy questions,
and prepare a concrete revision plan before any `.trellis/spec/` files are edited.

The immediate user value is to make the next implementation loop load durable project guidance
instead of relying on chat history or generic frontend/backend defaults.

## Confirmed Facts

- The repository currently has no active implementation task and is in a clean `main` worktree.
- The previous archived task `05-13-define-symphony-ts-specs` replaced the initial Trellis
  `backend/` and `frontend/` templates with Symphony-specific layers.
- Current spec layers are:
  - `symphony/`
  - `runtime-orchestration/`
  - `external-integrations/`
  - `typescript-effect/`
  - `testing-conformance/`
  - `quality-operations/`
- `SPEC.md` is the language-agnostic reference blueprint and vocabulary source for Symphony.
- `AGENTS.md` says not to update `.trellis/spec/` yet unless the user explicitly asks; the user is
  still collecting constraints.
- `symphony-ts` is a TypeScript ESM package using Effect, `@effect/cli`, `@effect/platform-node`,
  and experimental `@effect/tsgo`.
- The current runtime implementation is still a generated greeting CLI in `src/index.ts`; core
  Symphony runtime modules are not implemented yet.
- The minimal intended public command shape remains `symphony-ts [workflow-path]`.
- The previous spec-definition task intentionally left these questions for this planning task:
  - Which `SPEC.md` requirements should Symphony-ts intentionally deviate from before MVP?
  - Should Effect source be vendored under `repos/effect/`, and should pattern docs be generated?
  - Which test runner should be adopted for Effect-heavy tests?
  - Which AI infrastructure should be implemented first: worktree bootstrap, debug playbooks, or
    commit/push/land skills?
- User decision: the first implementation pass should target strict conformance, not a narrowed
  phased subset.
- `SPEC.md` section 18.1 defines the required conformance checklist. Section 18.2 contains
  recommended extensions that are explicitly not required for conformance, and section 18.3 contains
  recommended production validation.
- User decision: first-pass strict conformance includes all core-path `SHOULD` / `RECOMMENDED`
  clauses, all safety posture/documentation clauses, an internal runtime snapshot contract, and the
  `linear_graphql` client-side tool extension.
- User decision: the human-readable status surface, dashboard, HTTP server/API extension, future
  extension TODOs, and SSH worker extension are out of the first pass. Dashboard/status work is a
  second-pass concern.
- User requirement: keep a checkbox-based `SPEC.md` comparison/progress file in this task so future
  work can sync implementation progress against the spec without drifting.
- User decision: vendoring/reference capture for the core Effect libraries must happen before the
  main Symphony runtime implementation. The goal is to define best-practice usage up front instead
  of writing broad runtime code and fixing architectural mistakes during review.
- User decision: Effect reference capture should vendor the full upstream Effect monorepo, pinned to
  a commit/tag aligned with the current package versions, rather than only copying installed npm
  package artifacts.
- User decision: before handing the main implementation to Codex, the repository should be migrated
  to a monorepo shape using a setup reference the user will provide. Runtime implementation planning
  may assume this monorepo migration has already happened.
- User decision: first-pass conformance tests should use Vitest as the test runner with
  Effect-first helpers and fake services. The Vitest environment must be implemented before handing
  runtime implementation to `/goal`.
- User decision: first-pass AI infrastructure before `/goal` should prioritize worktree/bootstrap
  rules, seed debug playbooks, and goal context/spec-loading rules. Full commit/push/land skills are
  deferred.
- User decision: debug playbooks are a prerequisite, but the first version is a seed playbook based
  on official/local reference entry points and expected diagnostic order. The complete playbook is a
  living artifact updated during implementation when real bugs and lessons appear.

## Requirements

- Keep discussion and decisions in this task until the user explicitly approves editing
  `.trellis/spec/`.
- Target strict first-pass conformance against `SPEC.md` rather than a deliberately narrowed MVP.
- Decide how strict conformance treats RFC 2119 `SHOULD` and `RECOMMENDED` language outside the
  section 18.1 required checklist.
- Maintain a checkbox progress checklist that maps first-pass implementation scope back to
  `SPEC.md`.
- Treat Effect reference vendoring and project-local Effect pattern docs as a prerequisite gate for
  runtime implementation.
- Treat the repository monorepo migration as a prerequisite gate for runtime implementation.
- Treat Vitest test infrastructure as a prerequisite gate for runtime implementation and `/goal`
  handoff.
- Treat minimum AI infrastructure as a prerequisite gate for `/goal` handoff:
  worktree/bootstrap rules, seed debug playbooks, and goal context/spec-loading rules.
- Do not require fully battle-tested debug playbooks before `/goal`; require the mechanism and seed
  content, then update them during implementation.
- Do not design implementation paths as if the final runtime will remain a single-package layout.
- Identify which existing spec files need clarification, expansion, or reduction.
- Preserve the six Symphony-specific spec layers unless discussion reveals a concrete structural
  flaw.
- Produce planning artifacts that are enough for a later implementation/editing pass:
  - `prd.md` for requirements and acceptance.
  - `design.md` for spec organization decisions if revisions are broad.
  - `implement.md` for the ordered edit/validation plan before `task.py start`.
- Keep the resulting guidance useful to future Trellis/Codex runs without needing this conversation.

## Acceptance Criteria

- [x] The task records the first-pass conformance posture.
- [x] The task records first-pass extension/defer decisions for dashboard, HTTP API, SSH, internal
      snapshot, and `linear_graphql`.
- [x] The task records that Effect source/reference capture and pattern docs must be completed
      before Symphony runtime implementation.
- [x] The task records that the full Effect monorepo should be vendored/pinned for reference.
- [x] The task records that Symphony-ts should be migrated to a monorepo shape before main runtime
      implementation.
- [x] The task records Vitest as the test runner and makes test infrastructure a `/goal`
      prerequisite.
- [x] The task records AI infrastructure priorities and seed/living debug playbook policy.
- [x] The task records user decisions for all currently identified MVP-blocking spec questions.
- [x] A checkbox-based `SPEC.md` comparison/progress file exists in this task directory.
- [x] The task separates confirmed repository facts from open product/scope decisions.
- [x] Any intended deviation from `SPEC.md` is described with rationale and implementation impact.
- [x] The task identifies specific `.trellis/spec/` files that should be changed later.
- [x] Complex spec revision scope has `design.md` and `implement.md` before implementation starts.
- [x] No `.trellis/spec/` source file is edited before explicit user approval.

## Planned Spec Revisions

These files should be updated after the user approves entering implementation for this planning
task:

- `.trellis/spec/symphony/index.md`
  - Link the conformance checklist as the first-pass scope tracker.
- `.trellis/spec/symphony/spec-interpretation.md`
  - Record strict first-pass conformance and clarify that deferred dashboard/HTTP/SSH items are
    exclusions allowed by `SPEC.md`, not project deviations from required conformance.
- `.trellis/spec/symphony/product-boundaries.md`
  - Clarify that the first implementation pass excludes dashboard/HTTP/status UI and SSH workers.
- `.trellis/spec/runtime-orchestration/index.md`
  - Add the internal runtime snapshot as a first-pass runtime contract.
- `.trellis/spec/runtime-orchestration/orchestrator-state.md`
  - Require snapshot state to come from orchestrator state/metrics only.
- `.trellis/spec/runtime-orchestration/retry-reconciliation.md`
  - Cross-reference the checklist items for continuation retry, stalls, and terminal cleanup.
- `.trellis/spec/external-integrations/index.md`
  - Mark `linear_graphql` as first-pass scope and HTTP/dashboard as deferred.
- `.trellis/spec/external-integrations/codex-app-server.md`
  - Require targeted app-server schema validation, pass-through Codex config, continuation thread
    behavior, unsupported tool failure handling, and seed protocol debug playbook references.
- `.trellis/spec/external-integrations/linear-tracker.md`
  - Add the first-pass `linear_graphql` tool extension boundary.
- `.trellis/spec/external-integrations/client-tools.md`
  - Define the `linear_graphql` client-side tool extension and unsupported-tool behavior.
- `.trellis/spec/typescript-effect/index.md`
  - Add Effect monorepo reference and pattern docs as pre-runtime implementation gates.
- `.trellis/spec/typescript-effect/effect-patterns.md`
  - Link/generated-curate service, layer, fiber, schedule, resource, and typed error patterns.
- `.trellis/spec/typescript-effect/project-structure.md`
  - Update assumptions for the forthcoming monorepo layout.
- `.trellis/spec/typescript-effect/tsgo-and-llm-workflow.md`
  - Require tsgo diagnostics and Effect pattern docs before API guessing.
- `.trellis/spec/testing-conformance/index.md`
  - Record Vitest as the test runner.
- `.trellis/spec/testing-conformance/fakes-and-integration.md`
  - Define fake service conventions for Linear, Codex, workspace/filesystem, and time/scheduling.
- `.trellis/spec/testing-conformance/validation-matrix.md`
  - Align conformance coverage with `spec-conformance-checklist.md`.
- `.trellis/spec/quality-operations/index.md`
  - Add `/goal` preflight gates and seed/living debug playbook policy.
- `.trellis/spec/quality-operations/ai-infrastructure.md`
  - Prioritize worktree/bootstrap, goal context loading, and seed debug playbooks; defer full
    commit/push/land skills.
- `.trellis/spec/quality-operations/goal-context.md`
  - Require `/goal` to load `SPEC.md`, this checklist, Effect pattern docs, monorepo package specs,
    and testing/conformance docs.
- `.trellis/spec/quality-operations/safety-invariants.md`
  - Include safety posture documentation and harness hardening expectations in first-pass scope.
- `.trellis/spec/quality-operations/verification.md`
  - Update validation commands after monorepo/Vitest migration.

No required `SPEC.md` conformance deviation is currently planned. Deferred items are optional or
recommended extension work under `SPEC.md`: human-readable status surface, HTTP/dashboard/API,
section 18.2 future extension TODOs, and Appendix A SSH workers.

## Out Of Scope

- Implementing the Symphony runtime.
- Starting `task.py start` before the user has reviewed the planning artifacts.
- Replacing Effect, `@effect/cli`, or `@effect/tsgo` without explicit user direction.
- Copying OpenAI Symphony infrastructure wholesale.

## Open Questions

- None currently identified.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
