# Effect Reference

This directory pins the upstream Effect monorepo used as local read-only
reference material for Symphony runtime work.

## Pinned Checkout

- Upstream: <https://github.com/Effect-TS/effect>
- Local source path: `reference/effect/source/`
- Pin tag: `effect@3.21.2`
- Pin commit: `39c934c1476be389f7469433910fdf30fc4dad82`
- Checkout type: shallow detached checkout of the full monorepo working tree

The source checkout is ignored by this repository's git history to avoid
vendoring the whole Effect monorepo into `symphony-ts`. The committed pin
metadata here is the source of truth for recreating it.

## Recreate Or Update

To recreate the current reference checkout:

```bash
rtk mkdir -p reference/effect
rtk git clone --depth 1 --branch 'effect@3.21.2' \
  https://github.com/Effect-TS/effect.git reference/effect/source
rtk git -C reference/effect/source rev-parse HEAD
```

The final command must print:

```text
39c934c1476be389f7469433910fdf30fc4dad82
```

If the checkout has been made read-only, run this before updating it:

```bash
chmod -R u+w reference/effect/source
```

After updating, record the new tag, commit, dependency alignment, and package
versions in this directory before using the reference for runtime work.

## Read-Only Boundary

Treat `reference/effect/source/` as read-only upstream material. It exists for
reading package source, tests, examples, and API design. Do not patch files
inside it as part of Symphony implementation work.

Application and test code must import Effect APIs from normal package
dependencies:

```ts
import { Effect, Layer } from "effect"
import { NodeRuntime } from "@effect/platform-node"
```

Never import from the reference checkout:

```ts
// Forbidden.
import { Effect } from "../../reference/effect/source/packages/effect/src/index.js"
```

## Local Pattern Docs

Use [docs/effect-patterns/index.md](../../docs/effect-patterns/index.md) before
reading raw upstream source. The pattern docs summarize the parts of Effect that
Symphony runtime work is expected to use.
