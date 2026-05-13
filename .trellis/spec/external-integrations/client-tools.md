# Client Tools

## Tool Policy

Client-side tools exposed to coding-agent sessions are optional extensions. First-pass scope includes
`linear_graphql`; add any other tool only when the runtime can advertise, validate, execute, and
report failures without stalling the agent session.

Unsupported dynamic tool calls must return structured tool failure results rather than blocking.

## `linear_graphql`

`linear_graphql` is the preferred first optional tool when the runtime needs to let coding agents
query or mutate Linear using Symphony's configured tracker auth.

Requirements if implemented:

- only available when tracker kind is Linear and auth is configured
- accepts one GraphQL operation per tool call
- accepts `{ query, variables }` input
- rejects missing or empty query strings
- rejects multiple operations
- requires variables to be an object when present
- reuses configured Linear endpoint and auth
- preserves GraphQL error payloads for debugging
- returns structured success/failure output
- returns `success=false` for top-level GraphQL errors while preserving the response body
- returns structured failures for invalid input, missing auth, and transport errors
- never exposes raw tokens to the coding agent

## Security Boundary

Do not create shell helpers that expose raw Linear tokens. Coding agents should use the tool surface,
not read secrets from disk.

## Current Status

`linear_graphql` is first-pass implementation scope. Other client-side tools are out of scope until
a project decision adds them.
