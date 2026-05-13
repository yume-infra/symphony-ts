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

## Requirements

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
- Do not implement Symphony runtime behavior.

## Acceptance Criteria

- [ ] Worktree/bootstrap rules exist.
- [ ] Dependency install and validation commands are documented.
- [ ] cwd/package-target safety rules exist.
- [ ] `/goal` context-loading rules exist.
- [ ] Seed debug playbook exists for Effect/tsgo.
- [ ] Seed debug playbook exists for Codex app-server schema/protocol drift.
- [ ] Seed debug playbook exists for Linear fake/real integration.
- [ ] Seed debug playbook exists for orchestrator concurrency/retry/reconciliation/stalls.
- [ ] Living-playbook update format is documented.
- [ ] Full commit/push/land skills remain deferred.
- [ ] `pnpm verify` passes if maintained docs are linted by the project.
- [ ] No Symphony runtime modules are implemented.

## Out Of Scope

- Implementing commit/push/land skills.
- Implementing Linear/Codex/runtime modules.
- Adding CI or PR workflow automation unless needed only as documentation.
- Rewriting all Trellis specs.

## Open Questions

- Exact directory for AI docs/playbooks should be selected during implementation. Prefer a path that
  future `/goal` prompts can load directly.
