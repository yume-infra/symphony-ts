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

- `repos/effect/LLMS.md`
- `https://effect.website/llms.txt`
- `https://effect.website/llms-full.txt`
- topic-specific docs

But do not rely on memory or isolated snippets for complex Effect code. Prefer current package
versions, project-local pattern docs, the pinned upstream `LLMS.md`, vendored source/reference
material, and tsgo feedback.

## Source Reference Gate

Before main runtime implementation, keep upstream Effect v4 beta source available at `repos/effect/`.
Use it as read-only reference material:

- read `repos/effect/LLMS.md` before non-trivial Effect API work
- inspect examples, tests, module structure, and API design
- do not edit vendored files unless explicitly asked
- do not import from vendored source
- application code imports from package dependencies
- verify the pin with `pnpm effect:source:verify`

Project-local pattern docs must summarize the parts future agents should use so implementation does
not devolve into broad source spelunking.

## Scenario: Bare Agent Effect Context Bootstrap

### 1. Scope / Trigger

- Trigger: an agent or subagent is spawned without conversation history and is asked where Effect
  content lives or how to write Effect code in this repository.
- Scope: agent context discovery, import boundaries, and v4 beta coding conventions before any
  runtime implementation starts.

### 2. Signatures

- Input prompt shape: "Where is Effect content?" / "How should Effect code be written?" / any
  request to edit TypeScript runtime code using Effect.
- Required discovery response shape:
  - local pattern index: `docs/effect-patterns/index.md`
  - code-spec index: `.trellis/spec/typescript-effect/index.md`
  - upstream source reference: `repos/effect/`
  - upstream LLM guide: `repos/effect/LLMS.md`
  - source pin manifest: `repos/effect.pin.json`
  - package authority: `package.json` and `pnpm-lock.yaml`
  - diagnostics command: `rtk proxy pnpm --filter symphony-ts typecheck` or full
    `rtk proxy pnpm verify`

### 3. Contracts

- `repos/effect/` is a read-only squashed subtree from `Effect-TS/effect-smol` for the active Effect
  v4 beta source reference.
- `repos/effect.pin.json` records the expected subtree repository, branch, prefix, split, and LLM
  guide path.
- Application and test code must import from installed package dependencies only.
- Active packages are `effect@4.0.0-beta.66` and `@effect/platform-node@4.0.0-beta.66` unless the
  lockfile changes.
- Current v4 beta CLI imports come from `effect/unstable/cli/Command` and
  `effect/unstable/cli/Flag`.
- Node entrypoints use `@effect/platform-node/NodeRuntime`,
  `@effect/platform-node/NodeServices`, and `NodeRuntime.runMain`.
- Service definitions use `Context.Service`; do not introduce new `Context.Tag` patterns.

### 4. Validation & Error Matrix

- Missing `docs/effect-patterns/index.md` in the answer -> context bootstrap failure.
- Missing `repos/effect/` in the answer -> source-reference discovery failure.
- Missing `repos/effect/LLMS.md` for non-trivial Effect API work -> upstream LLM baseline failure.
- Failing `pnpm effect:source:verify` -> source pin infrastructure failure.
- Answering only "context loaded" or "understood" -> no-task routing failure.
- Asking whether to create a Trellis task for a pure Effect context-discovery question -> routing
  failure.
- Importing from `repos/effect/` -> import-boundary violation.
- Reintroducing `@effect/cli` for CLI code -> v3 peer dependency regression.
- Using `NodeContext.layer` for new code -> stale v3 platform pattern.
- Using `Context.Tag` for new services -> stale service-definition pattern.
- Skipping `tsgo`/verify before reporting completion -> diagnostics-loop failure.

### 5. Good/Base/Bad Cases

- Good: the agent names the local pattern docs, Trellis spec, vendored source, package baseline, and
  v4 import constraints before proposing code.
- Base: the agent says "Effect v4 beta with tsgo" and can find `apps/cli`, but must still look up
  the pattern docs and source boundary before editing.
- Bad: the agent only reports generic TypeScript/Effect guidance, only says context is loaded, or
  uses memory without identifying `docs/effect-patterns/index.md` and `repos/effect/`.

### 6. Tests Required

- Spawn a subagent with no conversation history and no extra context.
- Prompt: `请在当前仓库中独立回答：Effect 相关内容在哪里？写 Effect 代码应遵循哪些约束？`
- Pass assertions:
  - response mentions `docs/effect-patterns/index.md`
  - response mentions `repos/effect/`
  - response mentions `repos/effect/LLMS.md`
  - response mentions Effect v4 beta package baseline
  - response forbids imports from `repos/effect/`
  - response mentions v4 CLI/Node/service patterns or points to the docs that contain them

### 7. Wrong vs Correct

#### Wrong

```text
This is a TypeScript/Effect project. Use tsgo, keep the CLI thin, and put runtime logic in services.
```

```text
Loaded the project context. I will follow the AGENTS/Trellis instructions.
```

#### Correct

```text
Start with docs/effect-patterns/index.md and .trellis/spec/typescript-effect/index.md. The vendored
upstream source is repos/effect/ and is read-only; never import from it. Code targets
effect@4.0.0-beta.66 and @effect/platform-node@4.0.0-beta.66, using effect/unstable/cli,
NodeServices.layer, NodeRuntime.runMain, Context.Service, and tsgo diagnostics.
```
