# CLI And Node Runtime

The public command shape stays minimal:

```bash
symphony-ts [workflow-path]
```

The CLI should parse options, assemble layers, run the main program, and exit
with meaningful status. Runtime behavior belongs in services and layers.

## Entrypoint Pattern

Use `@effect/cli` and `NodeRuntime.runMain`:

```ts
#!/usr/bin/env node

import process from "node:process"
import { Args, Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"

const workflowPath = Args.file({ name: "workflow-path" }).pipe(
  Args.optional,
)

const command = Command.make(
  "symphony-ts",
  { workflowPath },
  ({ workflowPath }) =>
    startSymphony(workflowPath).pipe(
      Effect.provide(AppLive),
    ),
)

const cli = Command.run(command, {
  name: "symphony-ts",
  version: "0.0.0",
})

NodeRuntime.runMain(
  cli(process.argv).pipe(Effect.provide(NodeContext.layer)),
)
```

Use the exact `@effect/cli` API confirmed by `tsgo` for optional path parsing.
The example shows the shape, not a runtime implementation.

## CLI Boundary Rules

- Do not add subcommands unless the task explicitly expands the CLI surface.
- Do not start Linear, workspace, or Codex logic directly in command handlers.
- Do not introduce another CLI framework.
- Provide `NodeContext.layer` at the Node boundary.
- Use `NodeRuntime.runMain`, not `Effect.runPromise`, for the long-running
  service.
- Keep shutdown behavior in scopes and finalizers owned by runtime layers.

## Validation

When CLI behavior changes, run:

```bash
rtk pnpm --filter symphony-ts smoke:bin
rtk pnpm verify
```

## References

- Official docs: <https://effect.website/docs/platform/runtime/>
- Official docs: <https://effect.website/docs/code-style/guidelines/>
- Pinned source: `reference/effect/source/packages/cli/examples/minigit.ts`
- Pinned source: `reference/effect/source/packages/platform-node/src/NodeRuntime.ts`
- Local entrypoint: `apps/cli/src/index.ts`
