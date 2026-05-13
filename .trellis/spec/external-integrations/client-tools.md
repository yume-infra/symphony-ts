# Client Tools

## Tool Policy

Client-side tools exposed to coding-agent sessions are optional extensions. Add them only when the
runtime can advertise, validate, execute, and report failures without stalling the agent session.

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

## Security Boundary

Do not create shell helpers that expose raw Linear tokens. Coding agents should use the tool surface,
not read secrets from disk.

## Current Status

No client-side tools are implemented yet. This layer records the expected shape for future work.
