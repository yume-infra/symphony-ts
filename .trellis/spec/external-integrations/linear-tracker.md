# Linear Tracker

## Required Operations

The tracker client must support:

- `fetchCandidateIssues`
- `fetchIssuesByStates`
- `fetchIssueStatesByIds`

Names may differ locally, but the service boundary must preserve these capabilities.

## Query Rules

For Linear:

- default endpoint is `https://api.linear.app/graphql`
- auth is sent with the configured Linear token
- `tracker.project_slug` maps to Linear project `slugId`
- candidate fetch filters by configured active states and project slug
- candidate fetch must paginate
- state refresh queries by GraphQL issue IDs

## Normalization

Normalize to the project `Issue` model:

- labels are lowercase strings
- priority is integer or null
- timestamps parse as ISO-8601 or become null according to the parser contract
- blockers come from inverse relations of type `blocks`
- missing required issue fields make the issue ineligible for dispatch

## Error Categories

Use typed errors for:

- unsupported tracker kind
- missing API key
- missing project slug
- request failure
- non-200 response
- GraphQL errors
- malformed payload
- pagination integrity failure

## Boundary

Symphony is primarily a tracker reader. Tracker writes usually belong to the coding agent using
tools available in the workflow/runtime environment. Do not add orchestrator-level write business
logic without a project decision.
