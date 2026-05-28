# ADR 0007: Effect HTTP Client Boundaries

## Status

Accepted.

## Context

`LinearTransportLive` previously used direct global `fetch` inside
`Effect.tryPromise`. The body was Schema-encoded before the call, but the HTTP
client itself was not an Effect service. That made the Linear network boundary
harder to substitute, inspect, interrupt, and compose through layers.

The pinned Effect v4 beta source provides `effect/unstable/http` and Node client
layers in `@effect/platform-node/NodeHttpClient`.

## Decision

Runtime HTTP clients use Effect HTTP APIs.

`LinearTransportLive` is now a `Layer.effect` that captures
`HttpClient.HttpClient`. Its `execute` method keeps the existing no-requirement
service contract while internally using:

- `HttpClientRequest.post`;
- `HttpClientRequest.acceptJson`;
- `HttpClientRequest.setHeader`;
- `HttpClientRequest.bodyText(..., "application/json")`;
- `HttpClient.execute`;
- `HttpClientResponse.json`.

`AppLive` provides `NodeHttpClient.layerUndici` to the Linear transport layer.
Tests use `HttpClient.make` to verify request construction without global
network access.

## Consequences

- Runtime source no longer calls direct `fetch`.
- Linear transport can be tested by swapping an Effect `HttpClient`.
- HTTP transport and response decode failures still map to `TrackerError` with
  the original error preserved as `cause`.
- A real Linear run on 2026-05-28 showed the installed beta fetch-backed Node
  client forwarding `content-length` in a way Node/undici rejected as
  `invalid content-length header`. `NodeHttpClient.layerUndici` produced normal
  Linear HTTP responses for the same request shape, so it is the live production
  layer for Linear traffic.

## Evidence

- `repos/effect/packages/effect/src/unstable/http/HttpClient.ts`
- `repos/effect/packages/effect/src/unstable/http/HttpClientRequest.ts`
- `repos/effect/packages/effect/src/unstable/http/HttpClientResponse.ts`
- `repos/effect/packages/platform-node/src/NodeHttpClient.ts`
- `repos/effect/packages/platform-node/test/NodeHttpClient.test.ts`
- `apps/cli/src/tracker/linear.ts`
- `apps/cli/src/tracker/linear.test.ts`
- `apps/cli/src/app.ts`
