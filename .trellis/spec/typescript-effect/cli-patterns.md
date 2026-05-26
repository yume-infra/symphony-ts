# CLI Patterns

## Command Shape

The initial CLI is intentionally minimal:

```bash
symphony-ts [workflow-path]
```

`workflow-path` is optional. If absent, the runtime uses `./WORKFLOW.md`.

## CLI Responsibilities

The CLI may:

- parse the optional workflow path
- provide help/version output
- set up application layers
- start the main Effect program
- surface startup failure and exit code

The CLI should not:

- own runtime state
- perform Linear operations directly
- start Codex sessions directly
- implement dashboards or setup wizards
- grow multiple subcommands without explicit scope approval

## Dependencies

Use the Effect v4 beta CLI modules from `effect/unstable/cli`, such as
`effect/unstable/cli/Command`, `effect/unstable/cli/Argument`, and
`effect/unstable/cli/Flag` when needed.

Do not reintroduce `@effect/cli`; its latest package peers on Effect v3. Do not
introduce Commander, Yargs, oclif, cac, or interactive prompt tooling unless the
user explicitly approves it.

## Shutdown

The long-running service must run under `NodeRuntime.runMain` so Ctrl+C and process interruption
release scoped resources.
