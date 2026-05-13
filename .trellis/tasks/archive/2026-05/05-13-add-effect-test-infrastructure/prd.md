# Add Effect-first test infrastructure

## Goal

Turn the existing minimal Vitest wiring into usable pre-runtime test infrastructure for Symphony-ts.

The immediate value is to make future runtime work start with a deterministic Effect-first testing
surface instead of every implementation task inventing its own `Effect.runPromise` calls, fake
services, fixture layout, and failure formatting.

## Confirmed Facts

- The repository is now a pnpm monorepo using the `create-yume`-style shape.
- Trellis package discovery can remain single-repo for now; the user confirmed it is not blocking.
- The public CLI package lives in `apps/cli`.
- Vitest is already installed and wired:
  - `apps/cli/vitest.config.ts`
  - `apps/cli/package.json` script `test: vitest run`
  - root `pnpm test`
  - root `pnpm verify` includes tests.
- The current Vitest config allows no-test baseline with `passWithNoTests: true`.
- The current CLI is still the generated greeting command in `apps/cli/src/index.ts`.
- Broad Symphony runtime implementation must not start in this task.
- `.trellis/spec/testing-conformance/` requires:
  - Vitest for first-pass conformance tests
  - Effect-first test helpers
  - deterministic fakes for Linear, Codex, filesystem/workspace, and time/scheduling
  - explicit real-integration skips when credentials/env are absent
- Current runtime services do not exist yet, so fake service implementations should be scaffolded
  as test-support boundaries rather than pretending to integrate with nonexistent runtime modules.

## Requirements

- Keep the task focused on test infrastructure and current CLI behavior.
- Add an Effect-first test helper that:
  - runs Effect programs from Vitest through one shared helper
  - preserves typed Cause/error detail in assertion failures
  - supports explicit layer provisioning for future tests
- Add a test-support directory structure under `apps/cli` for:
  - Effect helpers
  - fixture helpers
  - fake Linear transport boundary
  - fake Codex app-server/protocol boundary
  - fake workspace/filesystem boundary
  - fake clock/scheduler boundary
- Add a first deterministic unit test for current behavior (`renderGreeting`) so `pnpm test` no
  longer passes only because no tests exist.
- Keep fake implementations narrow and dependency-light until runtime service interfaces exist.
- Keep real integration profile disabled by default and represented through explicit skip helpers or
  documented helpers, not silent pass-through.
- Keep the CLI runtime behavior unchanged.
- Do not implement Symphony workflow/config/orchestrator/tracker/Codex runtime modules here.
- Do not update `.trellis/spec/` unless implementation reveals a durable testing rule that should be
  preserved globally.

## Acceptance Criteria

- [ ] `prd.md`, `design.md`, and `implement.md` exist before implementation starts.
- [ ] `apps/cli` has a shared Effect test helper.
- [ ] The helper can run a successful Effect and return its value in a Vitest test.
- [ ] The helper surfaces Effect failures with useful Cause/error detail.
- [ ] Test-support directories exist for fakes/fixtures without introducing runtime behavior.
- [ ] Placeholder fake boundaries are documented or typed enough for future runtime tests to extend.
- [ ] At least one real test covers current CLI logic.
- [ ] `passWithNoTests` is removed or no longer required for the normal test path.
- [ ] `pnpm --filter symphony-ts test` passes.
- [ ] `pnpm verify` passes.
- [ ] `pnpm smoke:bin` still passes.
- [ ] No Symphony runtime implementation is added.

## Out Of Scope

- Implementing Linear client logic.
- Implementing Codex app-server protocol logic.
- Implementing workspace manager, orchestrator, workflow loader, or runtime services.
- Real Linear/Codex integration tests.
- Dashboard/status/HTTP/SSH work.
- Complete Effect pattern docs or Effect monorepo vendoring.

## Open Questions

- None blocking planning. Use the conservative scope above unless the user expands it.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
