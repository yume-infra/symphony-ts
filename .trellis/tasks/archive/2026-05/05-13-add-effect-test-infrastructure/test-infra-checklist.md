# Test Infrastructure Checklist

## Scope

- [x] Vitest is already installed and wired.
- [x] This task targets formal test helpers/fake boundaries.
- [x] This task does not implement Symphony runtime modules.

## Implementation

- [ ] Add shared Effect test runner helper.
- [ ] Add fixture helper entry point.
- [ ] Add fake Linear transport boundary.
- [ ] Add fake Codex app-server boundary.
- [ ] Add fake workspace/filesystem boundary.
- [ ] Add fake scheduler/time boundary.
- [ ] Add at least one current CLI behavior test.
- [ ] Remove `passWithNoTests` from normal test config.
- [ ] Keep root `pnpm verify` green.
- [ ] Keep `pnpm smoke:bin` green.

## Later Runtime Test Work

- [ ] Replace placeholder fake boundaries with service-specific fakes as runtime services appear.
- [ ] Add workflow/config conformance tests.
- [ ] Add workspace safety and hook tests.
- [ ] Add Linear normalization and GraphQL error tests.
- [ ] Add Codex app-server fake protocol tests.
- [ ] Add orchestrator retry/reconciliation/time tests.
