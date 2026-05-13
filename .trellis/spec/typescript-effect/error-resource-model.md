# Error And Resource Model

## Expected Errors

Use typed errors for expected failures:

- workflow read/parse errors
- config validation errors
- tracker request/errors
- workspace path and hook failures
- Codex startup/turn/protocol failures
- timeout and stall conditions
- prompt render errors

`Data.TaggedError` is the default style unless a more specific Effect API fits better.

## Unexpected Defects

Unexpected defects should remain defects. Do not hide programmer errors behind broad catch-all
handlers. When catching unknown errors from Promise/Node APIs, map them to typed expected errors at
the integration boundary.

## Resource Safety

Use scopes/finalizers/acquire-release patterns for:

- file watchers
- subprocesses
- timers/fibers
- log sinks
- temporary resources

Cancellation must not leave active Codex app-server processes or workspace hooks running
unobserved.

## Error Visibility

Operator-visible errors should include stable category, concise reason, and relevant identifiers.
Avoid logging full secrets, raw tokens, or large protocol payloads by default.
