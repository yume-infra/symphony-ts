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

`pnpm lint` includes local Effect anti-pattern rules in addition to the shared Antfu config. These
rules are part of the agent feedback loop, not style-only checks: do not bypass them without adding a
specific spec note.

## Dependency Freshness

This project prefers current dependencies for experimental Effect work. Check freshness with:

```bash
pnpm outdated --format json
```

Effect-related packages should stay current unless a breakage is documented.

## Generated And Managed Files

Do not lint or manually normalize Trellis/Codex generated template files unless the task is
specifically about those files. Application lint should focus on project code and maintained docs.
