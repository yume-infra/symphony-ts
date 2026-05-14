# Effect And tsgo Debug Playbook

Use this when Effect code, `@effect/tsgo`, native-preview, or TypeScript diagnostics fail.

## Sources Of Truth

Check in this order:

1. Current dependency versions in `package.json` and `pnpm-workspace.yaml`.
2. Project-local specs under `.trellis/spec/typescript-effect/`.
3. `@effect/tsgo` diagnostics from `pnpm typecheck`.
4. `pnpm typecheck:tsc` as a fallback when isolating native-preview or tsgo issues.
5. Official Effect docs and `llms.txt` / `llms-full.txt` as navigation.
6. Vendored Effect source, if present, as read-only reference material.

Do not install standalone `@effect/language-service`. The `@effect/language-service` tsconfig plugin
name is used by the tsgo path.

## Commands

Run from the repository root:

```bash
pnpm install
pnpm typecheck
pnpm typecheck:tsc
pnpm verify
```

For the CLI package:

```bash
pnpm --filter @sayoriqwq/symphony-ts typecheck
pnpm --filter @sayoriqwq/symphony-ts typecheck:tsc
pnpm --filter @sayoriqwq/symphony-ts test
```

In Codex CLI sessions using RTK, prefix commands with `rtk`.

## Investigation Order

1. Confirm `pnpm install` has run and `effect-tsgo patch` completed through the root `prepare`
   script.
2. Confirm the failing command and package target.
3. Read the exact tsgo diagnostic. Do not generalize from a similar TypeScript error.
4. Check whether the failure is an Effect diagnostic such as a floating Effect.
5. Check local Effect pattern docs before changing service, layer, fiber, schedule, or resource
   code.
6. Prefer explicit callbacks where inference is ambiguous.
7. For long-running Node entrypoints, verify `NodeRuntime.runMain` is used instead of
   `Effect.runPromise`.
8. If tsgo and tsc disagree, keep tsgo as the Effect diagnostic source and use tsc only to isolate
   native-preview or standard TypeScript behavior.

## Common Failure Classes

- Missing or stale `effect-tsgo patch` after dependency changes.
- Floating Effects in `src/**/*.ts`.
- Point-free `Effect.map` or similar calls that obscure inference.
- Direct Node resource management where scoped Effect services or finalizers are expected.
- Runtime services passed as large ad hoc objects instead of Effect services and layers.
- Importing from vendored reference source instead of normal package dependencies.

## Required Evidence For Updates

When updating this playbook, include:

- failing command
- package target
- exact diagnostic summary
- root cause
- fix that resolved the diagnostic
- test or typecheck command that proved the fix
