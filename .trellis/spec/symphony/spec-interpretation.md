# Spec Interpretation

## Source Of Truth Order

Use this order when deciding how to implement behavior:

1. Current `package.json` dependency versions and local project files.
2. `SPEC.md` for Symphony service semantics.
3. Relevant Effect official docs and current API references.
4. Local vendored/reference source when available.
5. `@effect/tsgo` diagnostics and TypeScript errors.
6. Project-local Trellis specs and `AGENTS.md`.

If sources disagree, prefer the highest item that directly applies and record the conflict when it
affects product behavior.

## Baseline Rules From `SPEC.md`

Default to implementing these as written:

- workflow file discovery and front matter parsing
- typed config defaults and validation
- dynamic reload semantics
- issue eligibility and dispatch rules
- per-issue workspace isolation
- workspace root containment and sanitized workspace keys
- coding-agent launch from the workspace path
- no indefinite user-input stalls
- structured logs with issue/session context
- core conformance tests from sections 17 and 18

## Implementation-Defined Areas

These require explicit project decisions before implementation details are locked:

- approval and sandbox posture for coding-agent sessions
- exact workspace population strategy
- status surface or dashboard shape
- whether the optional HTTP server extension is shipped
- whether the `linear_graphql` client-side tool is included in MVP
- whether retry/session metadata is persisted across restarts
- exact real-integration test profile and credentials strategy

## Deviation Format

Record intentional divergence like this:

```md
## Decision: <short title>

- Decision:
- Why:
- Diverges from `SPEC.md`:
- Implementation consequences:
- Tests required:
```

## Current Deviations

No product deviations are approved yet. The current plan is to follow `SPEC.md` by default and defer
MVP deviations to the next planning task.
