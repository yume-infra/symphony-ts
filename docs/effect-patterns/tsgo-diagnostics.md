# tsgo Diagnostics

This project intentionally uses the experimental `@effect/tsgo` toolchain with
`@typescript/native-preview`.

## Commands

Run Effect diagnostics through the project scripts:

```bash
rtk pnpm typecheck
rtk pnpm typecheck:tsc
rtk pnpm verify
```

`pnpm typecheck` runs `turbo run typecheck`, and the CLI package runs
`tsgo --noEmit`.

After install or dependency updates, the root `prepare` script runs:

```bash
effect-tsgo patch
```

This patches native-preview with the Effect-enhanced binary.
`effect-tsgo` itself is a setup/patch wrapper in the installed `@effect/tsgo`
version; it does not accept `--noEmit`. Keep package scripts on the patched
`tsgo --noEmit` command unless a future `@effect/tsgo` release changes that CLI
surface.

## Policy

- Treat `floatingEffect` as an error in `src/**/*.ts`.
- Do not install standalone `@effect/language-service`.
- The `tsconfig.json` plugin entry named `@effect/language-service` configures
  diagnostics for `tsgo`; it is not a package dependency request.
- If `tsgo` and `tsc` disagree, inspect the Effect diagnostic first, then
  confirm with pinned source or official docs.
- Keep examples in docs aligned with `tsgo` before turning them into runtime
  modules.

## Agent Loop

1. Read the relevant pattern doc.
2. Check source examples under `repos/effect/` only when needed.
3. Implement the narrow runtime slice.
4. Run `rtk pnpm typecheck`.
5. Use diagnostics to fix Effect API and floating Effect issues.
6. Run task-specific tests and `rtk pnpm verify`.

## References

- Official docs: <https://effect.website/docs/getting-started/devtools/>
- Official docs: <https://effect.website/docs/code-style/guidelines/>
- Local config: `apps/cli/tsconfig.json`
- Local package scripts: `package.json`, `apps/cli/package.json`
