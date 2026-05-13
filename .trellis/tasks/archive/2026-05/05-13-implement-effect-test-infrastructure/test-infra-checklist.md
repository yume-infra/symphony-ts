# Test Infrastructure Checklist

## Scope

- [x] Vitest is already installed and wired.
- [x] This task targets formal test helpers/fake boundaries.
- [x] This task does not implement Symphony runtime modules.

## Implementation

- [x] Add shared Effect test runner helper.
- [x] Add fixture helper entry point.
- [x] Add fake Linear transport boundary.
- [x] Add fake Codex app-server boundary.
- [x] Add fake workspace/filesystem boundary.
- [x] Add fake scheduler/time boundary.
- [x] Add at least one current CLI behavior test.
- [x] Remove `passWithNoTests` from normal test config.
- [x] Keep root `pnpm verify` green.
- [x] Keep `pnpm smoke:bin` green.

## Later Runtime Test Work

- [ ] Replace placeholder fake boundaries with service-specific fakes as runtime services appear.
- [ ] Add workflow/config conformance tests.
- [ ] Add workspace safety and hook tests.
- [ ] Add Linear normalization and GraphQL error tests.
- [ ] Add Codex app-server fake protocol tests.
- [ ] Add orchestrator retry/reconciliation/time tests.
