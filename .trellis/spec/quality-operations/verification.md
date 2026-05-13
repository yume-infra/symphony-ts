# Verification

## Standard Gate

Run:

```bash
pnpm verify
```

This is the default local validation gate.

After monorepo migration and Vitest adoption, update this section with workspace-aware test and
verification commands. Runtime implementation should not rely on stale single-package commands.

## Supporting Commands

```bash
pnpm build
pnpm typecheck
pnpm typecheck:tsc
pnpm lint
pnpm knip
pnpm smoke:bin
```

Use `pnpm smoke:bin` when CLI behavior or packaging changes.

Vitest should be added before broad runtime implementation so deterministic conformance tests can be
written alongside features rather than after the fact.

## Dependency Freshness

This project prefers current dependencies for experimental Effect work. Check freshness with:

```bash
pnpm outdated --format json
```

Effect-related packages should stay current unless a breakage is documented.

## Generated And Managed Files

Do not lint or manually normalize Trellis/Codex generated template files unless the task is
specifically about those files. Application lint should focus on project code and maintained docs.
