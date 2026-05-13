import type { Issue, ServiceConfig } from '../domain/types.js'
import { Context, Effect, Layer } from 'effect'
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

export const LinearTransportLive = Layer.succeed(LinearTransport)({
  execute: request =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(request.endpoint, {
          method: 'POST',
          headers: {
            'authorization': request.apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: request.query,
            variables: request.variables ?? {},
          }),
        })

        return {
          status: response.status,
          body: await response.json(),
        }
      },
      catch: cause => new TrackerError({
        code: 'linear_api_request',
        operation: 'linear_graphql',
        reason: 'Linear GraphQL request failed',
        cause,
      }),
    }),
})

export interface TrackerClientShape {
  readonly fetchCandidateIssues: (
    config: ServiceConfig,
  ) => Effect.Effect<ReadonlyArray<Issue>, TrackerError, LinearTransport>
  readonly fetchIssuesByStates: (
    config: ServiceConfig,
    stateNames: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<Issue>, TrackerError, LinearTransport>
  readonly fetchIssueStatesByIds: (
    config: ServiceConfig,
    issueIds: ReadonlyArray<string>,
  ) => Effect.Effect<ReadonlyArray<Issue>, TrackerError, LinearTransport>
}

export class TrackerClient extends Context.Service<TrackerClient, TrackerClientShape>()(
  'symphony/TrackerClient',
) {}

export const LinearTrackerClientLive = Layer.succeed(TrackerClient)({
  fetchCandidateIssues,
  fetchIssuesByStates,
  fetchIssueStatesByIds,
})

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

export function fetchCandidateIssues(
  config: ServiceConfig,
): Effect.Effect<ReadonlyArray<Issue>, TrackerError, LinearTransport> {
  if (config.tracker.projectSlug === null || config.tracker.projectSlug === '') {
    return missingProjectSlug('fetch_candidate_issues')
  }

  return fetchPagedIssues(config, 'fetch_candidate_issues', CANDIDATE_ISSUES_QUERY, after => ({
    projectSlug: config.tracker.projectSlug as string,
    activeStates: config.tracker.activeStates,
    after,
  }))
}

export function fetchIssuesByStates(
  config: ServiceConfig,
  stateNames: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<Issue>, TrackerError, LinearTransport> {
  if (stateNames.length === 0) {
    return Effect.succeed([])
  }

  if (config.tracker.projectSlug === null || config.tracker.projectSlug === '') {
    return missingProjectSlug('fetch_issues_by_states')
  }

  return fetchPagedIssues(config, 'fetch_issues_by_states', ISSUES_BY_STATES_QUERY, after => ({
    projectSlug: config.tracker.projectSlug as string,
    stateNames,
    after,
  }))
}

export function fetchIssueStatesByIds(
  config: ServiceConfig,
  issueIds: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<Issue>, TrackerError, LinearTransport> {
  if (issueIds.length === 0) {
    return Effect.succeed([])
  }

  return fetchPagedIssues(config, 'fetch_issue_states_by_ids', ISSUE_STATES_BY_IDS_QUERY, after => ({
    ids: issueIds,
    after,
  }))
}

export function executeLinearGraphQL(
  config: ServiceConfig,
  operation: string,
  query: string,
  variables: Record<string, unknown> = {},
): Effect.Effect<LinearGraphQLResponse, TrackerError, LinearTransport> {
  return Effect.gen(function* () {
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
}

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

function fetchPagedIssues(
  config: ServiceConfig,
  operation: string,
  query: string,
  variablesForPage: (after: string | null) => Record<string, unknown>,
): Effect.Effect<ReadonlyArray<Issue>, TrackerError, LinearTransport> {
  return Effect.gen(function* () {
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
}

function requireOkGraphQLResponse(
  response: LinearGraphQLResponse,
  operation: string,
): Effect.Effect<unknown, TrackerError> {
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
}

function issueConnection(body: unknown, operation: string): Effect.Effect<{
  readonly nodes: ReadonlyArray<unknown>
  readonly hasNextPage: boolean
  readonly endCursor: string | null
}, TrackerError> {
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
}

function missingProjectSlug(operation: string): Effect.Effect<never, TrackerError> {
  return Effect.fail(new TrackerError({
    code: 'missing_tracker_project_slug',
    operation,
    reason: 'Linear project slug is missing',
  }))
}

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
