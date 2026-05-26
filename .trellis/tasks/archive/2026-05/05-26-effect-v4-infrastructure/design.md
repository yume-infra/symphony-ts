# Design

## Boundary

This task is an infrastructure baseline task, not a runtime feature task. It
does not add orchestration behavior. It makes the existing Effect v4 beta setup
usable as the validation surface for later API migration work.

## Source Pinning

`repos/effect/` is the local upstream source reference. It is managed as a
squashed git subtree so agents can read normal source files without requiring a
separate clone, submodule initialization, or `node_modules` spelunking.

The current subtree history records:

- `git-subtree-dir: repos/effect`
- `git-subtree-split: b559d68845f848a10153395778f035682d399075`

Because the selected published v4 beta packages point at
`Effect-TS/effect-smol`, that repository remains the correct source reference
for this beta baseline.

## Import Boundary

Runtime and test code import only from installed dependencies:

- `effect/Effect`, `effect/Layer`, `effect/Context`
- `effect/unstable/cli/Command`
- `effect/unstable/cli/Argument`
- `@effect/platform-node/NodeRuntime`
- `@effect/platform-node/NodeServices`

`repos/effect/` is source/reference material only. Importing from it would bind
application code to vendored files instead of package resolution and would break
the feedback-loop contract.

## Feedback Loop

The validation loop is:

1. Read `docs/effect-patterns/index.md` and relevant topic docs.
2. Use `repos/effect/` only when the local docs or official docs do not answer
   an API question.
3. Run the package `typecheck` script, which invokes `tsgo --noEmit`.
4. Treat Effect diagnostics such as outdated APIs, floating effects, and missing
   context/error requirements as the primary migration signal.

The repo keeps the tsconfig plugin name `@effect/language-service` because that
is how the tsgo path configures Effect diagnostics; it is not a request to
install standalone `@effect/language-service`.

## Compatibility Notes

- `@effect/cli` peers on Effect v3 and must not be reintroduced.
- The v4 beta CLI surface lives under `effect/unstable/cli`.
- `Context.Service` is the current project service-key pattern.
- Long-running Node entrypoints use `NodeRuntime.runMain`.
