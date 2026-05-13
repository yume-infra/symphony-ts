# Product Boundaries

## Product Shape

Symphony-ts is a long-running orchestration service distributed through a minimal CLI entrypoint.
The initial command shape is:

```bash
symphony-ts [workflow-path]
```

The CLI starts the service. The runtime then loads `WORKFLOW.md`, polls the issue tracker, creates
per-issue workspaces, launches coding-agent sessions, observes progress, retries failures, and
reconciles tracker state.

## Goals

- Implement the Symphony service contract in TypeScript with Effect.
- Keep workflow policy in the repository through `WORKFLOW.md`.
- Dispatch tracker issues to isolated workspaces with bounded concurrency.
- Run coding agents only inside per-issue workspace directories.
- Provide structured observability for operations and debugging.
- Preserve enough context for AI agents to implement and review safely.

## Non-Goals

- Do not build a rich CLI product with many subcommands by default.
- Do not build a web dashboard unless explicitly scoped later.
- Do not turn the orchestrator into a general-purpose workflow engine.
- Do not copy OpenAI Symphony's Elixir-specific `.codex/` setup directly.
- Do not treat tracker writes as orchestrator business logic unless a future decision changes that
  boundary.

## Minimal CLI Boundary

The command handler should parse the optional workflow path, initialize the Effect runtime, start the
service, handle shutdown/startup errors, and return meaningful exit codes. Runtime behavior belongs
in Effect services and modules, not command handlers.

Allowed initial CLI behavior:

- no argument -> use `./WORKFLOW.md`
- one optional positional argument -> explicit workflow file path
- standard `@effect/cli` help/version/log-level behavior

Avoid adding setup wizards, dashboards, interactive prompts, or operator UX unless the user explicitly
asks for that scope.

## Project Decisions

- Decision: `SPEC.md` is a conformance baseline with explicit deviations.
- Why: The project should follow the reference contract while preserving room for deliberate product
  choices.
- Consequence: Changes that diverge from `SPEC.md` must update `spec-interpretation.md`.
