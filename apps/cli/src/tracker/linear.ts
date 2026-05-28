import type { Issue, ServiceConfig } from '../domain/types.js'
import { Context, Effect, Layer, Schema } from 'effect'
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'
import { TrackerError } from '../domain/errors.js'
import { isPlainRecord } from '../domain/types.js'

export interface LinearGraphQLRequest {
  readonly endpoint: string
  readonly apiKey: string
  readonly query: string
  readonly variables?: Record<string, unknown>
}

export interface LinearGraphQLResponse {
  readonly status: number
  readonly body: unknown
}

export interface LinearTransportShape {
  readonly execute: (
    request: LinearGraphQLRequest,
  ) => Effect.Effect<LinearGraphQLResponse, TrackerError>
}

export class LinearTransport extends Context.Service<LinearTransport, LinearTransportShape>()(
  'symphony/LinearTransport',
) {}

const encodeGraphQLRequestBody = Schema.encodeUnknownEffect(Schema.UnknownFromJsonString)

const makeLinearTransport = Effect.fn('LinearTransport.make')(function* () {
  const httpClient = yield* HttpClient.HttpClient

  return {
    execute: Effect.fn('LinearTransport.execute')(function* (request: LinearGraphQLRequest) {
      const body = yield* encodeGraphQLRequestBody({
        query: request.query,
        variables: request.variables ?? {},
      }).pipe(
        Effect.mapError(cause => linearRequestError(cause)),
      )
      const httpRequest = HttpClientRequest.post(request.endpoint).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.setHeader('authorization', request.apiKey),
        HttpClientRequest.bodyText(body, 'application/json'),
      )
      const response = yield* httpClient.execute(httpRequest).pipe(
        Effect.mapError(cause => linearRequestError(cause)),
      )
      const responseBody = yield* response.json.pipe(
        Effect.mapError(cause => linearRequestError(cause)),
      )

      return {
        status: response.status,
        body: responseBody,
      }
    }),
  }
})

export const LinearTransportLive = Layer.effect(LinearTransport)(makeLinearTransport())

export interface TrackerClientShape {
  readonly fetchCandidateIssues: (
    config: ServiceConfig,
  ) => Effect.Effect<ReadonlyArray<Issue>, TrackerError>
  readonly fetchIssuesByStates: (
    config: ServiceConfig,
    stateNames: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<Issue>, TrackerError>
  readonly fetchIssueStatesByIds: (
    config: ServiceConfig,
    issueIds: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<Issue>, TrackerError>
}

export class TrackerClient extends Context.Service<TrackerClient, TrackerClientShape>()(
  'symphony/TrackerClient',
) {}

function linearRequestError(cause: unknown): TrackerError {
  return new TrackerError({
    code: 'linear_api_request',
    operation: 'linear_graphql',
    reason: 'Linear GraphQL request failed',
    cause,
  })
}

const CANDIDATE_ISSUES_QUERY = `
query SymphonyCandidateIssues($projectSlug: String!, $activeStates: [String!], $after: String) {
  issues(
    first: 50
    after: $after
    filter: {
      project: { slugId: { eq: $projectSlug } }
      state: { name: { in: $activeStates } }
    }
  ) {
    nodes {
      id
      identifier
      title
      description
      priority
      branchName
      url
      createdAt
      updatedAt
      state { name }
      labels { nodes { name } }
      inverseRelations {
        nodes {
          type
          issue { id identifier state { name } }
          relatedIssue { id identifier state { name } }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`

const ISSUES_BY_STATES_QUERY = `
query SymphonyIssuesByStates($projectSlug: String!, $stateNames: [String!], $after: String) {
  issues(
    first: 50
    after: $after
    filter: {
      project: { slugId: { eq: $projectSlug } }
      state: { name: { in: $stateNames } }
    }
  ) {
    nodes {
      id
      identifier
      title
      description
      priority
      branchName
      url
      createdAt
      updatedAt
      state { name }
      labels { nodes { name } }
      inverseRelations {
        nodes {
          type
          issue { id identifier state { name } }
          relatedIssue { id identifier state { name } }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`

const ISSUE_STATES_BY_IDS_QUERY = `
query SymphonyIssueStatesByIds($ids: [ID!]) {
  issues(filter: { id: { in: $ids } }) {
    nodes {
      id
      identifier
      title
      description
      priority
      branchName
      url
      createdAt
      updatedAt
      state { name }
      labels { nodes { name } }
      inverseRelations {
        nodes {
          type
          issue { id identifier state { name } }
          relatedIssue { id identifier state { name } }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`

export const executeLinearGraphQL = Effect.fn('executeLinearGraphQL')(function* (
  config: ServiceConfig,
  operation: string,
  query: string,
  variables: Record<string, unknown> = {},
): Effect.fn.Return<LinearGraphQLResponse, TrackerError, LinearTransport> {
  if (config.tracker.kind !== 'linear') {
    return yield* new TrackerError({
      code: 'unsupported_tracker_kind',
      operation,
      reason: `unsupported tracker kind: ${config.tracker.kind ?? 'missing'}`,
    })
  }

  if (config.tracker.apiKey === null || config.tracker.apiKey === '') {
    return yield* new TrackerError({
      code: 'missing_tracker_api_key',
      operation,
      reason: 'Linear API key is missing',
    })
  }

  const transport = yield* LinearTransport

  return yield* transport.execute({
    endpoint: config.tracker.endpoint,
    apiKey: config.tracker.apiKey,
    query,
    variables,
  })
})

const requireOkGraphQLResponse = Effect.fn('requireOkGraphQLResponse')((
  response: LinearGraphQLResponse,
  operation: string,
): Effect.Effect<unknown, TrackerError> => {
  if (response.status !== 200) {
    return Effect.fail(new TrackerError({
      code: 'linear_api_status',
      operation,
      status: response.status,
      reason: `Linear GraphQL returned HTTP ${response.status}`,
    }))
  }

  if (isPlainRecord(response.body) && Array.isArray(response.body.errors) && response.body.errors.length > 0) {
    return Effect.fail(new TrackerError({
      code: 'linear_graphql_errors',
      operation,
      reason: 'Linear GraphQL returned top-level errors',
      cause: response.body.errors,
    }))
  }

  return Effect.succeed(response.body)
})

const issueConnection = Effect.fn('issueConnection')((
  body: unknown,
  operation: string,
): Effect.Effect<{
  readonly nodes: ReadonlyArray<unknown>
  readonly hasNextPage: boolean
  readonly endCursor: string | null
}, TrackerError> => {
  const data = isPlainRecord(body) ? body.data : undefined
  const issues = isPlainRecord(data) ? data.issues : undefined
  const nodes = isPlainRecord(issues) && Array.isArray(issues.nodes) ? issues.nodes : null
  const pageInfo = isPlainRecord(issues) && isPlainRecord(issues.pageInfo) ? issues.pageInfo : null

  if (nodes === null || pageInfo === null || typeof pageInfo.hasNextPage !== 'boolean') {
    return Effect.fail(new TrackerError({
      code: 'linear_unknown_payload',
      operation,
      reason: 'Linear payload did not contain issues.nodes and pageInfo',
    }))
  }

  return Effect.succeed({
    nodes,
    hasNextPage: pageInfo.hasNextPage,
    endCursor: nullableString(pageInfo.endCursor),
  })
})

const missingProjectSlug = Effect.fn('missingProjectSlug')((operation: string): Effect.Effect<never, TrackerError> =>
  Effect.fail(new TrackerError({
    code: 'missing_tracker_project_slug',
    operation,
    reason: 'Linear project slug is missing',
  })))

const fetchPagedIssues = Effect.fn('fetchPagedIssues')(function* (
  config: ServiceConfig,
  operation: string,
  query: string,
  variablesForPage: (after: string | null) => Record<string, unknown>,
): Effect.fn.Return<ReadonlyArray<Issue>, TrackerError, LinearTransport> {
  let after: string | null = null
  const issues: Array<Issue> = []

  while (true) {
    const response: LinearGraphQLResponse = yield* executeLinearGraphQL(config, operation, query, variablesForPage(after))
    const body: unknown = yield* requireOkGraphQLResponse(response, operation)
    const connection: {
      readonly nodes: ReadonlyArray<unknown>
      readonly hasNextPage: boolean
      readonly endCursor: string | null
    } = yield* issueConnection(body, operation)
    const pageIssues: ReadonlyArray<Issue> = connection.nodes
      .map(normalizeLinearIssue)
      .filter((issue: Issue | null): issue is Issue => issue !== null)

    issues.push(...pageIssues)

    if (!connection.hasNextPage) {
      return issues
    }

    if (connection.endCursor === null) {
      return yield* new TrackerError({
        code: 'linear_missing_end_cursor',
        operation,
        reason: 'Linear pageInfo.hasNextPage was true but endCursor was missing',
      })
    }

    after = connection.endCursor
  }
})

export const fetchCandidateIssues = Effect.fn('fetchCandidateIssues')(function* (
  config: ServiceConfig,
): Effect.fn.Return<ReadonlyArray<Issue>, TrackerError, LinearTransport> {
  if (config.tracker.projectSlug === null || config.tracker.projectSlug === '') {
    return yield* missingProjectSlug('fetch_candidate_issues')
  }

  return yield* fetchPagedIssues(config, 'fetch_candidate_issues', CANDIDATE_ISSUES_QUERY, after => ({
    projectSlug: config.tracker.projectSlug as string,
    activeStates: config.tracker.activeStates,
    after,
  }))
})

export const fetchIssuesByStates = Effect.fn('fetchIssuesByStates')(function* (
  config: ServiceConfig,
  stateNames: ReadonlyArray<string>,
): Effect.fn.Return<ReadonlyArray<Issue>, TrackerError, LinearTransport> {
  if (stateNames.length === 0) {
    return []
  }

  if (config.tracker.projectSlug === null || config.tracker.projectSlug === '') {
    return yield* missingProjectSlug('fetch_issues_by_states')
  }

  return yield* fetchPagedIssues(config, 'fetch_issues_by_states', ISSUES_BY_STATES_QUERY, after => ({
    projectSlug: config.tracker.projectSlug as string,
    stateNames,
    after,
  }))
})

export const fetchIssueStatesByIds = Effect.fn('fetchIssueStatesByIds')(function* (
  config: ServiceConfig,
  issueIds: ReadonlyArray<string>,
): Effect.fn.Return<ReadonlyArray<Issue>, TrackerError, LinearTransport> {
  if (issueIds.length === 0) {
    return []
  }

  return yield* fetchPagedIssues(config, 'fetch_issue_states_by_ids', ISSUE_STATES_BY_IDS_QUERY, after => ({
    ids: issueIds,
    after,
  }))
})

export function normalizeLinearIssue(value: unknown): Issue | null {
  if (!isPlainRecord(value)) {
    return null
  }

  const id = stringField(value.id)
  const identifier = stringField(value.identifier)
  const title = stringField(value.title)
  const state = normalizeLinearState(value.state)

  if (id === null || identifier === null || title === null || state === null) {
    return null
  }

  return {
    id,
    identifier,
    title,
    description: nullableString(value.description),
    priority: Number.isInteger(value.priority) ? value.priority as number : null,
    state,
    branchName: nullableString(value.branchName),
    url: nullableString(value.url),
    labels: normalizeLabels(value.labels),
    blockedBy: normalizeBlockers(value.inverseRelations),
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt),
  }
}

const makeLinearTrackerClient = Effect.fn('LinearTrackerClient.make')(function* () {
  const transport = yield* LinearTransport
  const provideTransport = <A>(
    effect: Effect.Effect<A, TrackerError, LinearTransport>,
  ): Effect.Effect<A, TrackerError> => effect.pipe(
    Effect.provideService(LinearTransport, transport),
  )

  return TrackerClient.of({
    fetchCandidateIssues: config => provideTransport(fetchCandidateIssues(config)),
    fetchIssuesByStates: (config, stateNames) => provideTransport(fetchIssuesByStates(config, stateNames)),
    fetchIssueStatesByIds: (config, issueIds) => provideTransport(fetchIssueStatesByIds(config, issueIds)),
  })
})

export const LinearTrackerClientLive = Layer.effect(TrackerClient)(makeLinearTrackerClient())

function normalizeLabels(value: unknown): ReadonlyArray<string> {
  if (!isPlainRecord(value) || !Array.isArray(value.nodes)) {
    return []
  }

  return value.nodes
    .map(node => isPlainRecord(node) ? stringField(node.name) : null)
    .filter((name): name is string => name !== null)
    .map(name => name.toLowerCase())
}

function normalizeBlockers(value: unknown): Issue['blockedBy'] {
  if (!isPlainRecord(value) || !Array.isArray(value.nodes)) {
    return []
  }

  return value.nodes.flatMap((relation) => {
    if (!isPlainRecord(relation) || relation.type !== 'blocks') {
      return []
    }

    const blocker = isPlainRecord(relation.issue) ? relation.issue : relation.relatedIssue

    if (!isPlainRecord(blocker)) {
      return []
    }

    return [{
      id: nullableString(blocker.id),
      identifier: nullableString(blocker.identifier),
      state: normalizeLinearState(blocker.state),
    }]
  })
}

function normalizeLinearState(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (isPlainRecord(value)) {
    return stringField(value.name)
  }

  return null
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp = Date.parse(value)

  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString()
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
