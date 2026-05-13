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
versions, local source/reference material when available, and tsgo feedback.

## Future Source Reference

When Effect source is vendored later, use it as read-only reference material:

- inspect examples, tests, module structure, and API design
- do not edit vendored files unless explicitly asked
- do not import from vendored source
- application code imports from package dependencies

Pattern docs such as `agent-patterns/effect-schema.md` may be generated later from vendored source.
