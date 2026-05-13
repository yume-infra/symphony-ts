# Prepare Effect reference and pattern docs

## Goal

Complete the Effect reference and pattern-doc pre-runtime gate before broad Symphony runtime
implementation begins.

This task should vendor or otherwise pin the full upstream Effect monorepo as read-only reference
material, record how it aligns with the current `effect` / `@effect/*` package versions, and create
project-local Effect pattern docs that future agents can read before writing runtime code.

## Confirmed Facts

- The project intentionally uses Effect as the runtime foundation.
- The project intentionally uses `@effect/tsgo` with `@typescript/native-preview`.
- Runtime implementation should not begin until Effect reference material and local pattern docs
  exist.
- The current monorepo shape has the CLI package in `apps/cli`.
- Current dependency versions are managed through root `pnpm-workspace.yaml` catalog entries and
  `apps/cli/package.json`.
- Vendored/reference Effect source must be read-only.
- Application code must import from normal package dependencies, not from vendored source.

## Requirements

- Identify current local Effect-related package versions from workspace metadata.
- Choose and record the upstream Effect monorepo commit/tag that best aligns with those versions.
- Vendor or pin the full upstream Effect monorepo under a clearly marked read-only reference path.
- Add documentation that forbids application imports from the vendored/reference tree.
- Create or curate project-local Effect pattern docs for:
  - services, tags, contexts, and layers
  - scoped resources, acquire/release, and finalizers
  - fibers, interruption, worker cancellation
  - schedules for polling, retry, timeout, and backoff
  - refs/queues or equivalent state tools for orchestrator state
  - typed errors for config, tracker, workspace, hooks, Codex, and rendering boundaries
  - `@effect/cli` entrypoint and `NodeRuntime.runMain`
  - `@effect/tsgo` diagnostics workflow for agents
- Prefer current package versions, official docs, local reference source, and tsgo diagnostics over
  API guessing.
- Do not implement Symphony runtime behavior in this task.
- Do not replace `@effect/tsgo` with standalone `@effect/language-service`.

## Acceptance Criteria

- [ ] Current Effect-related package versions are recorded.
- [ ] A full upstream Effect monorepo reference is pinned to a commit/tag.
- [ ] The reference location is documented as read-only.
- [ ] Application-import rules explicitly prohibit importing from the reference tree.
- [ ] Pattern docs exist for services/layers.
- [ ] Pattern docs exist for scoped resources/finalizers.
- [ ] Pattern docs exist for fibers/interruption/cancellation.
- [ ] Pattern docs exist for schedules/retry/timeout/backoff.
- [ ] Pattern docs exist for typed errors.
- [ ] Pattern docs exist for CLI entrypoint and `NodeRuntime.runMain`.
- [ ] Pattern docs exist for `@effect/tsgo` diagnostics workflow.
- [ ] Future `/goal` runtime work can use these docs before reading raw Effect source.
- [ ] `pnpm verify` passes.
- [ ] No Symphony runtime modules are implemented.

## Out Of Scope

- Implementing workflow/config/orchestrator/tracker/workspace/Codex runtime modules.
- Adding full conformance tests beyond checks needed for reference/doc validation.
- Changing package managers or replacing Effect toolchain decisions.
- Building AI worktree/bootstrap or debug playbooks; that is a separate task.

## Open Questions

- Exact reference storage path and pinning mechanism must be decided during implementation based on
  repository size, git hygiene, and user preference if needed.
