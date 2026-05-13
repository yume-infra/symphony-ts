# CLI And Node Runtime

The public command shape stays minimal:

```bash
symphony-ts [workflow-path]
```

The CLI should parse options, assemble layers, run the main program, and exit
with meaningful status. Runtime behavior belongs in services and layers.

## Entrypoint Pattern

Use the Effect v4 beta CLI module and `NodeRuntime.runMain`:

```ts
#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"

const workflowPath = Argument.path("workflow-path").pipe(Argument.optional)

const command = Command.make(
  "symphony-ts",
  { workflowPath },
  ({ workflowPath }) =>
    startSymphony(Option.getOrUndefined(workflowPath)).pipe(
      Effect.provide(AppLive),
    ),
)

const main = Command.run(command, {
  version: "0.0.0",
}).pipe(
  Effect.provide(NodeServices.layer),
)

NodeRuntime.runMain(main)
```

Use the exact `effect/unstable/cli` API confirmed by `tsgo` for optional path
parsing. The example shows the shape, not a runtime implementation.

## CLI Boundary Rules

- Do not add subcommands unless the task explicitly expands the CLI surface.
- Do not start Linear, workspace, or Codex logic directly in command handlers.
- Do not introduce another CLI framework.
- Provide `NodeServices.layer` at the Node boundary.
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
- Pinned source: `repos/effect/packages/effect/src/unstable/cli/Command.ts`
- Pinned source: `repos/effect/packages/effect/typetest/unstable/cli/Command.tst.ts`
- Pinned source: `repos/effect/packages/platform-node/src/NodeRuntime.ts`
- Pinned source: `repos/effect/packages/platform-node/src/NodeServices.ts`
- Local entrypoint: `apps/cli/src/index.ts`
