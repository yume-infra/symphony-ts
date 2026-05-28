# Linear Integration Debug Playbook

Use this when Linear candidate fetch, state refresh, normalization, auth, fake/real tests, or the
`linear_graphql` client tool fails.

## Sources Of Truth

Use local specs first:

- `.trellis/spec/external-integrations/linear-tracker.md`
- `.trellis/spec/external-integrations/client-tools.md`
- `.trellis/spec/testing-conformance/fakes-and-integration.md`
- `.trellis/spec/quality-operations/safety-invariants.md`

For real Linear behavior, inspect current Linear GraphQL documentation or schema. Do not assume
query shape from memory.

## Investigation Order

1. Classify the failure as fake transport, real transport, normalization, auth, pagination, state
   refresh, or client-tool routing.
2. Confirm no raw Linear token is printed in prompts, logs, errors, or shell helpers.
3. Verify required config exists without printing secret values.
4. Verify the endpoint is the configured Linear GraphQL endpoint, defaulting to
   `https://api.linear.app/graphql`.
5. Verify `tracker.project_slug` maps to Linear project `slugId`.
6. For candidate fetch, verify active-state and project filters, pagination, and blocker filtering.
7. For state refresh, verify GraphQL issue IDs are used.
8. Normalize labels to lowercase strings.
9. Parse timestamps as ISO-8601 or null according to the parser contract.
10. Derive blockers from inverse relations of type `blocks`.
11. Treat missing required issue fields as ineligible for dispatch.
12. Preserve GraphQL error payloads for debugging while keeping tokens redacted.

## Fake First

Use deterministic fakes for normal development:

- fake Linear GraphQL transport
- narrow named fixtures for query responses
- explicit malformed payload fixtures
- pagination fixtures
- auth-missing fixtures that do not include real tokens

Real integration profiles should be explicit and skip clearly when credentials are unavailable. An
unrun real integration test is not proof that the integration works.

## `linear_graphql` Tool Boundary

If implemented, `linear_graphql` is a client-side tool exposed through the agent runner. It should:

- be available only for Linear tracker config with auth
- accept `{ query, variables }`
- reject empty queries
- reject multiple operations
- require variables to be an object when present
- reuse configured endpoint and auth
- return structured success or failure output
- preserve top-level GraphQL errors in the response body
- never expose raw tokens

If a real worker tries to discover `LINEAR_API_KEY`, call `curl`, or look for a local
`linear_graphql` executable, debug the Codex app-server dynamic tool advertisement first. The
worker should see `linear_graphql` as an app-server client-side tool; the raw key stays in the
Symphony runtime process.

Do not move tracker write business logic into the orchestrator without a project decision.

## Required Evidence For Updates

When updating this playbook, include:

- fake or real profile
- query or operation name, redacted if needed
- failure category
- normalized field that changed
- fixture or test added
- whether `linear_graphql` or tracker service owns the fix
