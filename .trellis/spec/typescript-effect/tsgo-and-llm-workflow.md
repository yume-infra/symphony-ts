# tsgo And LLM Workflow

## Toolchain

This project intentionally uses the experimental Effect tsgo path:

- `@effect/tsgo`
- `@typescript/native-preview`
- `tsgo --noEmit` for `pnpm typecheck`

The `tsconfig.json` plugin entry named `@effect/language-service` configures Effect diagnostics for
tsgo. It does not mean the standalone language-service package should be installed.

## Diagnostics Policy

- Treat `floatingEffect` as an error in `src/**/*.ts`.
- Keep Effect warnings and errors affecting the typecheck exit code.
- Suggestions may be visible without failing typecheck.
- Run `effect-tsgo patch` after install/prepare so native-preview uses the Effect-enhanced binary.

## LLM Coding Baseline

Use official docs and LLM files as navigation:

- `https://effect.website/llms.txt`
- `https://effect.website/llms-full.txt`
- topic-specific docs

But do not rely on memory or isolated snippets for complex Effect code. Prefer current package
versions, project-local pattern docs, vendored source/reference material, and tsgo feedback.

## Source Reference Gate

Before main runtime implementation, vendor the full upstream Effect monorepo and pin it to a
commit/tag aligned with current dependency versions. Use it as read-only reference material:

- inspect examples, tests, module structure, and API design
- do not edit vendored files unless explicitly asked
- do not import from vendored source
- application code imports from package dependencies

Project-local pattern docs must summarize the parts future agents should use so implementation does
not devolve into broad source spelunking.
