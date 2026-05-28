# Schema Boundaries

Use Effect Schema at external data boundaries where data enters or leaves the runtime as untyped
JSON, JSON strings, or protocol payloads. Passing `tsgo` with plain `JSON.parse` / `JSON.stringify`
is weaker than validating the boundary.

## JSON String Boundaries

For one JSON document represented as a string, define a schema for the decoded value and wrap it with
`Schema.fromJsonString`:

```ts
import { Effect, Schema } from "effect"

const Message = Schema.Struct({
  id: Schema.Union([Schema.Number, Schema.String]),
  method: Schema.String,
  params: Schema.optionalKey(Schema.Unknown)
})

const MessageFromJsonString = Schema.fromJsonString(Message)
const decodeMessage = Schema.decodeUnknownEffect(MessageFromJsonString)
const encodeMessage = Schema.encodeUnknownEffect(MessageFromJsonString)

const send = (message: Schema.Schema.Type<typeof Message>) =>
  encodeMessage(message).pipe(
    Effect.map((line) => `${line}\n`)
  )
```

Map schema failures to the domain error at the integration boundary. Keep the schema error as
`cause` so malformed JSON and shape mismatches remain diagnosable.

## Line-Oriented Protocols

When a process or socket emits newline-delimited JSON, split transport framing from validation:

- use stream tools such as `Stream.decodeText()` and `Stream.splitLines()` for framing;
- use `Schema.fromJsonString(...)` for each line's protocol message;
- put invalid lines into the typed error channel instead of throwing from a stream callback;
- use `effect/unstable/encoding/Ndjson` only when the whole stream is generic NDJSON rather than a
  protocol with custom size limits, event queues, and domain-specific error mapping.

The Codex app-server bridge follows this pattern: process stdout is line-framed with Stream, each
line is decoded through a JSON-RPC schema, and outbound messages are encoded with the same schema.

## Untyped JSON Values

Use `Schema.UnknownFromJsonString` when the runtime intentionally serializes an arbitrary JSON value
instead of a typed domain object. This is appropriate for diagnostic payloads or pass-through tool
results:

```ts
import { Schema } from "effect"

const encodeUnknownJsonString = Schema.encodeUnknownSync(Schema.UnknownFromJsonString)
```

Prefer a narrower schema whenever the protocol shape is known.

Use the same rule in tests when the assertion decodes or encodes a JSON-shaped runtime value. Plain
`JSON.parse` / `JSON.stringify` is only acceptable inside fixture source strings that intentionally
simulate an external JavaScript process.

## Config Boundaries

Use Schema to validate raw workflow config sections before applying defaults, environment expansion,
or domain-specific normalization:

- missing sections and keys may still receive defaults;
- explicitly present values with the wrong shape should fail with a typed config error;
- path expansion, environment variable lookup, and dispatch precondition checks remain domain logic
  after the raw shape has decoded.

This prevents typos such as `polling.interval_ms: 0` or `tracker: linear` from being silently
treated as missing config.

## YAML Front Matter

YAML syntax parsing is not an Effect abstraction. Use a maintained YAML parser for the front matter
syntax, then map its failures into the Effect error channel at the workflow boundary.

The project shape is:

- `WorkflowLoader` reads `WORKFLOW.md` through `FileSystem.FileSystem`;
- `parseWorkflowSource` splits front matter from the Markdown prompt body;
- `parseYamlFrontMatter` uses the `yaml` package for YAML 1.2 core syntax and rejects parser
  diagnostics as `WorkflowParseError`;
- `resolveServiceConfig` uses Effect Schema for known config section shapes after YAML has decoded
  to plain JavaScript values.

Do not reintroduce a hand-written YAML subset parser for workflow config. If the supported syntax
needs to change, adjust parser options and document the workflow config rule.

## References

- `repos/effect/packages/effect/src/Schema.ts`
- `repos/effect/packages/effect/src/SchemaGetter.ts`
- `repos/effect/packages/effect/test/schema/Schema.test.ts`
- `repos/effect/ai-docs/src/02_stream/30_encoding.ts`
