<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Project-Specific Agent Notes

These notes are the temporary project authority until `.trellis/spec/` is rewritten. Do not update
`.trellis/spec/` yet unless the user explicitly asks; the user is still collecting constraints.

## Bare Agent Effect Bootstrap

When an agent has no conversation history and is asked where Effect content lives or how to write
Effect code, its answer must include this checklist before proposing implementation:

- This is a context-discovery question, not implementation. Do not stop after saying that context is
  loaded, and do not ask whether to create a Trellis task unless the user asks to change code.
- Read first: `docs/effect-patterns/index.md`.
- Code-spec entry: `.trellis/spec/typescript-effect/index.md`.
- Upstream source reference: `repos/effect/`, a read-only squashed subtree from
  `Effect-TS/effect-smol`.
- Upstream LLM source guide: `repos/effect/LLMS.md`.
- Source pin authority: `repos/effect.pin.json`; verify with `pnpm effect:source:verify`.
- Package authority: `package.json` and `pnpm-lock.yaml`.
- Active baseline: `effect@4.0.0-beta.66` and `@effect/platform-node@4.0.0-beta.66`.
- Import boundary: application and tests import from installed dependencies only; never import from
  `repos/effect/`.
- Current v4 beta patterns: `effect/unstable/cli/Command`, `effect/unstable/cli/Flag`,
  `@effect/platform-node/NodeRuntime`, `@effect/platform-node/NodeServices`,
  `NodeRuntime.runMain`, and `Context.Service`.
- Validation loop: use `tsgo` through `rtk proxy pnpm --filter @sayoriqwq/symphony-ts typecheck`, or the full
  `rtk proxy pnpm verify` gate.

## Product Shape

- `symphony-ts` is a TypeScript/Effect implementation of the Symphony service described in
  `SPEC.md`.
- Treat `SPEC.md` as the reference blueprint and terminology source, not as something to blindly
  copy into implementation. Intentional project deviations must be called out and later recorded in
  Trellis specs.
- This is not a traditional frontend/backend application. The current Trellis `backend/` and
  `frontend/` specs are init templates and should not drive implementation decisions.
- The product is a long-running orchestration service distributed through a minimal CLI entrypoint.
  The initial command shape is:

  ```bash
  symphony-ts [workflow-path]
  ```

- Keep the CLI thin: parse the optional workflow path, initialize the Effect runtime, start the
  service, handle shutdown/startup errors, and return meaningful exit codes.
- Runtime behavior belongs in Effect services and modules, not in command handlers.

## Technical Boundaries

- Use Effect as the main application runtime foundation for configuration, services, concurrency,
  resource lifecycle, error handling, and integration boundaries.
- Bare agents with no conversation history must be able to locate the Effect context from this file.
  When asked where Effect lives or how to write Effect code, report these project entry points before
  coding:
  - `docs/effect-patterns/index.md` is the first local Effect pattern index.
  - `repos/effect/` is the only vendored upstream Effect source path.
  - `repos/effect/LLMS.md` is the upstream Effect v4 LLM guide from the pinned source.
  - `repos/effect.pin.json` records the expected subtree repository, branch, and split.
  - `.trellis/spec/typescript-effect/index.md` is the Trellis code-spec entry for Effect work.
  - `package.json` plus `pnpm-lock.yaml` are the package-version authority.
- The active Effect dependency baseline is Effect v4 beta. Treat `effect@4.0.0-beta.66` and
  matching v4 beta packages as the implementation API unless package metadata or `pnpm-lock.yaml`
  proves otherwise.
- Use the experimental `@effect/tsgo` toolchain directly for Effect language-service diagnostics.
  This project intentionally chooses the aggressive path here: prefer the testing-stage tsgo-based
  Effect LSP experience over the conservative standalone `@effect/language-service` setup.
- Follow Effect's official LLM coding baseline: use `llms.txt` / `llms-full.txt` and topic docs as
  navigation, read `repos/effect/LLMS.md` before non-trivial Effect work, and prefer a tight
  feedback loop with tsgo diagnostics plus local source/reference material over guessing APIs from
  memory.
- Effect best-practice source order is: current package versions in `package.json` and
  `pnpm-lock.yaml`, relevant Effect official docs, `repos/effect/LLMS.md`, local
  vendored/reference Effect source under `repos/effect`, tsgo diagnostics, then
  project-local Trellis specs and AGENTS decisions.
- `effect.website/docs/code-style/guidelines/` is the minimum style floor: run long-lived Node
  programs with `NodeRuntime.runMain` and avoid tacit / point-free Effect calls when explicit
  callbacks preserve inference and stack clarity.
- `repos/effect` is a squashed, read-only subtree of the official Effect v4 beta source repository
  `Effect-TS/effect-smol`. Use it for source, tests, examples, and API design reference only. Do
  not edit vendored files unless explicitly asked, and never import from `repos/effect` in
  application or test code.
- Keep the subtree pin executable: `repos/effect.pin.json` is the manifest,
  `pnpm effect:source:verify` checks it, and `pnpm effect:source:update` is the deliberate
  `git subtree pull --squash` update path.
- Effect v4 beta implementation must use dependency imports, not vendored paths:
  - CLI: `effect/unstable/cli/Command` and `effect/unstable/cli/Flag`
  - Node runtime: `@effect/platform-node/NodeRuntime`
  - Node services layer: `@effect/platform-node/NodeServices`
  - Service definitions: `Context.Service`
  - Long-running entrypoints: `NodeRuntime.runMain`
- Use the Effect v4 beta CLI module at `effect/unstable/cli` as the CLI layer. Do not keep the
  legacy `@effect/cli` package in application dependencies while migrating to v4 beta because its
  latest published package peers on Effect v3. Do not introduce another CLI framework such as
  Commander, Yargs, oclif, cac, or interactive prompt tooling unless the user explicitly approves
  it.
- Do not expand the CLI into subcommands, dashboards, setup wizards, or broad operator UX unless the
  user asks for that scope.
- Core implementation work should focus on the Symphony runtime: workflow loading, typed config,
  dynamic reload, orchestrator state, Linear tracking, workspace management, Codex app-server
  integration, retry/reconciliation, observability, and safety invariants.
- AI/coding-agent infrastructure is part of the core product surface. Treat workspace isolation,
  agent launch cwd safety, structured logs, non-stalling user-input policy, and conformance tests as
  first-class implementation concerns.
- The final project must include AI infrastructure. Use OpenAI Symphony's local `.codex/` setup as a
  reference for useful patterns, but adapt it to this repository instead of copying it directly.
  Skills such as commit, pull, push, land, Linear tooling, worktree bootstrap, and debug playbooks
  should be introduced when the matching TypeScript runtime, CI, logging, and PR conventions exist.

## Future Trellis Spec Direction

When the user is ready to rewrite `.trellis/spec/`, prefer long-form spec layers aligned to this
project instead of frontend/backend templates:

- `symphony/`
- `runtime-orchestration/`
- `external-integrations/`
- `typescript-effect/`
- `testing-conformance/`
- `quality-operations/`
