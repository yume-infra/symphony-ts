# Add minimum AI infrastructure

## Goal

Create the minimum AI infrastructure required before broad `/goal` runtime implementation can start.

This task should document and seed the agent/worktree/bootstrap/debug conventions that future agents
will rely on while implementing Symphony runtime modules. It should not introduce full commit/push
/land skills or runtime code.

## Confirmed Facts

- AI/coding-agent infrastructure is part of the final Symphony-ts product surface.
- Full commit/push/land skills are intentionally deferred until runtime, CI, logs, and PR
  conventions stabilize.
- Before `/goal` runtime implementation, the project needs:
  - worktree/bootstrap rules
  - dependency install and validation commands
  - cwd/package-target safety rules
  - `/goal` context-loading rules
  - seed debug playbooks
- Debug playbooks should start as seed artifacts and become living docs during implementation.
- OpenAI Symphony's `.codex/` setup may be used as reference, but must not be copied blindly.
- The repository currently has project-local `.agents/`, `.codex/`, `.trellis/spec/`, `apps/cli/`,
  and `libs/` paths, but no maintained `docs/` convention yet.
- `README.md` already documents the pnpm monorepo shape and the root/package-level validation
  commands that the AI infrastructure should reference.
- The current implementation package is `apps/cli`; future runtime/domain/testing packages are
  expected under `libs/`.
- This task should use a docs-first approach. Do not create project-local AI infrastructure skills
  yet; defer skills until the repeated workflows, command contracts, logs, CI behavior, and
  Linear/Codex integration surfaces are stable.

## Requirements

- Create the maintained AI infrastructure docs under `docs/ai/` so future `/goal` prompts can load
  them directly without treating them as Trellis-managed specs or Codex runtime config.
- Document worktree/bootstrap rules for agent runs in this monorepo.
- Document dependency install and validation commands.
- Document cwd and package-target safety rules for future agent launch/implementation work.
- Document `/goal` context-loading rules:
  - `AGENTS.md`
  - `SPEC.md`
  - active task artifacts
  - relevant `.trellis/spec/` layer indexes
  - Effect pattern docs once created
  - testing/conformance docs
  - monorepo package paths
- Create seed debug playbooks for:
  - Effect and `@effect/tsgo` diagnostics
  - Codex app-server protocol/schema drift
  - Linear fake and real integration paths
  - orchestrator concurrency, retry, reconciliation, and stalls
- Define the living-playbook update rule:
  - symptom
  - root cause
  - failed fixes
  - correct investigation order
  - test/assertion added
  - spec/checklist update needed
- Keep full commit/push/land automation out of scope.
- Keep `.agents/skills/` and `.codex/skills/` creation out of scope for this task. Future skills
  should be thin procedural wrappers around stable workflows and should link to `docs/ai/` rather
  than duplicating the maintained docs.
- Do not implement Symphony runtime behavior.

## Acceptance Criteria

- [x] Worktree/bootstrap rules exist.
- [x] Dependency install and validation commands are documented.
- [x] cwd/package-target safety rules exist.
- [x] `/goal` context-loading rules exist.
- [x] Seed debug playbook exists for Effect/tsgo.
- [x] Seed debug playbook exists for Codex app-server schema/protocol drift.
- [x] Seed debug playbook exists for Linear fake/real integration.
- [x] Seed debug playbook exists for orchestrator concurrency/retry/reconciliation/stalls.
- [x] Living-playbook update format is documented.
- [x] Full commit/push/land skills remain deferred.
- [x] New AI infrastructure skills remain deferred.
- [x] `pnpm verify` passes if maintained docs are linted by the project.
- [x] No Symphony runtime modules are implemented.

## Out Of Scope

- Implementing commit/push/land skills.
- Creating new project-local AI infrastructure skills.
- Implementing Linear/Codex/runtime modules.
- Adding CI or PR workflow automation unless needed only as documentation.
- Rewriting all Trellis specs.

## Open Questions

None blocking planning. The implementation should still inspect `.agents/`, `.codex/`, `AGENTS.md`,
and relevant Trellis specs before writing the final docs, but the planned maintained-docs location is
`docs/ai/`.

## Review Status

Planning reviewed and approved on 2026-05-13. Proceed with docs-first implementation when the
workflow state allows starting the task.
