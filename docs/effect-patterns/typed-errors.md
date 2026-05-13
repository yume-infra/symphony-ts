# Typed Errors

Expected runtime failures belong in the Effect error channel. Unexpected
programmer mistakes should remain defects.

## Default Error Shape

Use `Data.TaggedError` for expected boundary errors:

```ts
import { Data } from "effect"

export class WorkflowLoadError extends Data.TaggedError("WorkflowLoadError")<{
  readonly path: string
  readonly reason: string
  readonly cause?: unknown
}> {}

export class TrackerTimeoutError extends Data.TaggedError("TrackerTimeoutError")<{
  readonly issueId: LinearIssueId
}> {}
```

Prefer stable identifiers over huge payloads. For external failures, include
the integration name, operation, and stable entity id.

## Integration Boundaries

Map promise and Node callback failures at the boundary:

```ts
const readWorkflow = (path: string) =>
  Effect.tryPromise({
    try: () => fs.promises.readFile(path, "utf8"),
    catch: (cause) =>
      new WorkflowLoadError({
        path,
        reason: "read-failed",
        cause,
      }),
  })
```

Do not catch unknown errors deep inside business logic and convert everything to
`Error`. The typed error should explain the operation that failed.

## Error Categories

Use distinct tagged errors for the main Symphony boundaries:

- config and workflow parsing
- tracker and Linear requests
- workspace path, worktree, and hook execution
- Codex app-server startup, turn execution, and protocol handling
- prompt rendering
- timeout, stall, and retry exhaustion
- observability sink failures when they affect runtime guarantees

## Defects

Use defects for impossible states and programmer mistakes:

```ts
const assertKnownState = (state: WorkerState) =>
  state._tag === "Running"
    ? Effect.succeed(state)
    : Effect.dieMessage(`unexpected worker state: ${state._tag}`)
```

Do not use defects for external API failures, invalid user config, unavailable
workspaces, or timeouts.

## References

- Official docs: <https://effect.website/docs/error-management/expected-errors/>
- Official docs: <https://effect.website/docs/error-management/two-error-types/>
- Official docs: <https://effect.website/docs/data-types/data/>
- Pinned source: `reference/effect/source/packages/effect/test/Effect/error.test.ts`
- Pinned source: `reference/effect/source/packages/cli/examples/naval-fate/domain.ts`
