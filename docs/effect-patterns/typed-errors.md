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

## Best-Effort Recovery

Best-effort recovery may return `null`, `[]`, or `void` only when the caller can safely continue. If
the recovered error came from an external system or changes operator-visible behavior, log a
structured warning before returning the fallback value:

```ts
const issues = yield* tracker.fetchIssueStatesByIds(config, ids).pipe(
  Effect.catch((error) =>
    logger.warn("running_reconciliation_refresh_failed", {
      operation: "fetch_issue_states_by_ids",
      issue_count: ids.length,
      error_code: error.code,
      reason: error.reason
    }).pipe(
      Effect.andThen(Effect.succeed<ReadonlyArray<Issue>>([]))
    )
  )
)
```

Low-level cleanup services should not depend directly on the runtime logger just to report
best-effort failures. Instead, accept a failure callback that receives a typed error plus stable
operation context. The caller that owns operational context should wire that callback to
`RuntimeLogger`.

Workspace cleanup follows this shape: `WorkspaceManager` keeps `after_run`, `before_remove`, and
remove-directory failures best-effort, while the orchestrator passes callbacks that emit structured
warnings.

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
- Pinned source: `repos/effect/packages/effect/test/Cause.test.ts`
- Pinned source: `repos/effect/packages/effect/test/unstable/cli/fixtures/ComprehensiveCli.ts`
