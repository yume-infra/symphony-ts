# HTTP Boundaries

Use Effect HTTP clients for runtime network boundaries. In this project that
means `effect/unstable/http` request/response APIs and a Node implementation
from `@effect/platform-node/NodeHttpClient`.

Direct `fetch(...)` in runtime source bypasses Effect's service, interruption,
layer, and typed-error model. Use it only in test fixtures or with an explicit
audit entry.

## Client Layers

Construct live services by closing over `HttpClient.HttpClient` in the service
layer:

```ts
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"

const ServiceLive = Layer.effect(Service)(
  Effect.gen(function*() {
    const client = yield* HttpClient.HttpClient

    return {
      execute: Effect.fn("Service.execute")(function*(url: string) {
        const request = HttpClientRequest.get(url)
        return yield* client.execute(request)
      })
    }
  })
)
```

Provide `NodeHttpClient.layerUndici` at application composition for production
Linear traffic. A real run found the installed beta fetch-backed Node client
incompatible with this request body's `content-length` behavior on the current
Node/undici stack. Tests should still substitute the client with
`Layer.succeed`.

## Requests And JSON

Use `HttpClientRequest` combinators for method, headers, URL, and body. For
known or intentionally arbitrary JSON, keep the existing Schema JSON boundary
before constructing the HTTP body, then send the encoded body with
`HttpClientRequest.bodyText(..., "application/json")`.

Use `HttpClientResponse.json` or schema decoders such as
`HttpClientResponse.schemaBodyJson(...)` for response bodies. Map
`HttpClientError` and `SchemaError` into local tagged errors at the integration
boundary and preserve the original error as `cause`.

## Linear GraphQL

`LinearTransportLive` is the reference pattern:

- `Layer.effect` captures `HttpClient.HttpClient`;
- `LinearTransport.execute` remains a no-requirement service method;
- GraphQL request JSON is encoded through Effect Schema;
- request method, headers, and body are built with `HttpClientRequest`;
- response JSON is read through `HttpClientResponse.json`;
- all transport and decode failures map to `TrackerError`.

## Source Evidence

- `repos/effect/ai-docs/src/50_http-client/index.md`
- `repos/effect/packages/effect/src/unstable/http/HttpClient.ts`
- `repos/effect/packages/effect/src/unstable/http/HttpClientRequest.ts`
- `repos/effect/packages/effect/src/unstable/http/HttpClientResponse.ts`
- `repos/effect/packages/platform-node/src/NodeHttpClient.ts`
