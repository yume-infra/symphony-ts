# ADR 0003: Effect Schema JSON Boundaries

## Status

Accepted.

## Context

Symphony exchanges untyped JSON at several integration boundaries: Linear GraphQL HTTP requests,
Codex app-server JSON-RPC stdin/stdout, dynamic tool result payloads, workflow/config files, and
future Codex/Linear connector data.

The pinned Effect v4 beta source provides `Schema.fromJsonString`, `Schema.UnknownFromJsonString`,
`Schema.decodeUnknownEffect`, and `Schema.encodeUnknownEffect`. The Effect language-service
diagnostics also flags plain `JSON.parse` / `JSON.stringify` in source code and recommends Schema
APIs for JSON parsing and stringifying.

## Decision

Runtime source should use Effect Schema for external JSON boundaries when the shape is known or the
value is intentionally arbitrary JSON.

Known protocol shapes should define explicit schemas and use `Schema.fromJsonString(...)` for JSON
string decode/encode. The Codex app-server bridge uses a JSON-RPC message schema for inbound stdout
lines and outbound stdin messages.

Intentional arbitrary JSON values should use `Schema.UnknownFromJsonString`; Linear GraphQL request
bodies and Codex dynamic tool result text use this shape.

Parsed workflow config should be decoded with Schema before defaults, environment expansion, path
resolution, and dispatch validation. Missing sections may still default, but explicitly invalid
section shapes or non-positive integer fields fail as typed config errors.

Plain `JSON.parse` / `JSON.stringify` may remain in tests, fixtures, or short local assertions. In
runtime source, a plain JSON call needs an audit entry explaining why Schema is not a fit.

## Consequences

- Malformed JSON and protocol-shape mismatches now enter typed domain errors with the Schema error
  preserved as `cause`.
- The Codex process bridge no longer emits `tsgo` JSON-boundary suggestions.
- Future protocol work has a concrete pattern for line-framed JSON: Stream handles framing, Schema
  handles message validation.
- Workflow config typos such as `tracker: linear` or `polling.interval_ms: 0` no longer silently
  fall through to defaults.
- Schema definitions add some ceremony at boundaries, but keep validation close to the integration
  contract instead of scattering ad hoc guards.

## Evidence

- `repos/effect/packages/effect/src/Schema.ts`
- `repos/effect/packages/effect/src/SchemaGetter.ts`
- `repos/effect/packages/effect/test/schema/Schema.test.ts`
- `repos/effect/ai-docs/src/02_stream/30_encoding.ts`
- `apps/cli/src/agent-runner/codex.ts`
- `apps/cli/src/config/resolve.ts`
- `apps/cli/src/tracker/linear.ts`
