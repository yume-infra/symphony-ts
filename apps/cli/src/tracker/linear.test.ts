import type { ServiceConfig } from '../domain/types.js'
import type { LinearGraphQLRequest, LinearGraphQLResponse } from './linear.js'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { runEffect } from '../../tests/support/effect.js'
import {
  fetchCandidateIssues,
  fetchIssuesByStates,
  fetchIssueStatesByIds,
  LinearTransport,
  normalizeLinearIssue,
} from './linear.js'

const config: ServiceConfig = {
  workflowPath: '/repo/WORKFLOW.md',
  workflowDirectory: '/repo',
  promptTemplate: 'Prompt',
  tracker: {
    kind: 'linear',
    endpoint: 'https://linear.example/graphql',
    apiKey: 'linear-secret',
    projectSlug: 'symphony',
    activeStates: ['Todo', 'In Progress'],
    terminalStates: ['Done'],
  },
  polling: { intervalMs: 30000 },
  workspace: { root: '/tmp/symphony' },
  hooks: {
    afterCreate: null,
    beforeRun: null,
    afterRun: null,
    beforeRemove: null,
    timeoutMs: 60000,
  },
  agent: {
    maxConcurrentAgents: 10,
    maxTurns: 20,
    maxRetryBackoffMs: 300000,
    maxConcurrentAgentsByState: new Map(),
  },
  codex: {
    command: 'codex app-server',
    approvalPolicy: null,
    threadSandbox: null,
    turnSandboxPolicy: null,
    turnTimeoutMs: 3600000,
    readTimeoutMs: 5000,
    stallTimeoutMs: 300000,
  },
}

describe('linear tracker', () => {
  it('fetches candidate issues with project slug filter and pagination', async () => {
    const fake = createFakeTransport([
      response({
        nodes: [linearIssue({ id: 'issue-1', identifier: 'SYM-1', priority: 1 })],
        pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
      }),
      response({
        nodes: [linearIssue({ id: 'issue-2', identifier: 'SYM-2', priority: 2 })],
        pageInfo: { hasNextPage: false, endCursor: null },
      }),
    ])

    const issues = await runEffect(fetchCandidateIssues(config), { layer: fake.layer })

    expect(issues.map(issue => issue.identifier)).toEqual(['SYM-1', 'SYM-2'])
    expect(fake.requests).toHaveLength(2)
    expect(fake.requests[0]?.query).toContain('slugId')
    expect(fake.requests[0]?.variables).toMatchObject({
      projectSlug: 'symphony',
      activeStates: ['Todo', 'In Progress'],
      after: null,
    })
    expect(fake.requests[1]?.variables).toMatchObject({
      after: 'cursor-1',
    })
  })

  it('normalizes labels, blockers, priority, timestamps, and missing optional fields', () => {
    const issue = normalizeLinearIssue(linearIssue({
      labels: [{ name: 'Backend' }, { name: 'URGENT' }],
      blockerState: 'Done',
      createdAt: '2026-05-14T00:00:00Z',
      updatedAt: 'not-a-date',
    }))

    expect(issue).toMatchObject({
      labels: ['backend', 'urgent'],
      blockedBy: [
        {
          id: 'blocker-1',
          identifier: 'SYM-0',
          state: 'Done',
        },
      ],
      createdAt: '2026-05-14T00:00:00.000Z',
      updatedAt: null,
    })
  })

  it('skips API calls for empty state lists', async () => {
    const fake = createFakeTransport([])

    const issues = await runEffect(fetchIssuesByStates(config, []), { layer: fake.layer })

    expect(issues).toEqual([])
    expect(fake.requests).toEqual([])
  })

  it('uses GraphQL ID typing for state refresh by ids', async () => {
    const fake = createFakeTransport([
      response({
        nodes: [linearIssue({ id: 'issue-1', identifier: 'SYM-1', state: 'In Progress' })],
        pageInfo: { hasNextPage: false, endCursor: null },
      }),
    ])

    const issues = await runEffect(fetchIssueStatesByIds(config, ['issue-1']), { layer: fake.layer })

    expect(issues).toHaveLength(1)
    expect(fake.requests[0]?.query).toContain('$ids: [ID!]')
    expect(fake.requests[0]?.variables).toMatchObject({
      ids: ['issue-1'],
    })
  })

  it('maps GraphQL errors and non-200 responses to typed tracker errors', async () => {
    const graphQLError = createFakeTransport([
      { status: 200, body: { errors: [{ message: 'bad query' }] } },
    ])
    const statusError = createFakeTransport([
      { status: 500, body: { error: 'server' } },
    ])

    const graphQLErrorResult = await runEffect(Effect.flip(fetchCandidateIssues(config)), {
      layer: graphQLError.layer,
    })
    const statusErrorResult = await runEffect(Effect.flip(fetchCandidateIssues(config)), {
      layer: statusError.layer,
    })

    expect(graphQLErrorResult).toMatchObject({
      code: 'linear_graphql_errors',
    })
    expect(statusErrorResult).toMatchObject({
      code: 'linear_api_status',
      status: 500,
    })
  })
})

function createFakeTransport(responses: ReadonlyArray<LinearGraphQLResponse>): {
  readonly requests: Array<LinearGraphQLRequest>
  readonly layer: Layer.Layer<LinearTransport>
} {
  const requests: Array<LinearGraphQLRequest> = []
  const queue = [...responses]

  return {
    requests,
    layer: Layer.succeed(LinearTransport)({
      execute: request =>
        Effect.sync(() => {
          requests.push(request)

          const response = queue.shift()

          if (response === undefined) {
            throw new Error('no fake Linear response queued')
          }

          return response
        }),
    }),
  }
}

function response(options: {
  readonly nodes: ReadonlyArray<unknown>
  readonly pageInfo: { readonly hasNextPage: boolean, readonly endCursor: string | null }
}): LinearGraphQLResponse {
  return {
    status: 200,
    body: {
      data: {
        issues: {
          nodes: options.nodes,
          pageInfo: options.pageInfo,
        },
      },
    },
  }
}

function linearIssue(options: {
  readonly id?: string
  readonly identifier?: string
  readonly title?: string
  readonly state?: string
  readonly priority?: number | string | null
  readonly labels?: ReadonlyArray<{ readonly name: string }>
  readonly blockerState?: string
  readonly createdAt?: string
  readonly updatedAt?: string
}): Record<string, unknown> {
  return {
    id: options.id ?? 'issue-1',
    identifier: options.identifier ?? 'SYM-1',
    title: options.title ?? 'Implement runtime',
    description: 'Build Symphony',
    priority: options.priority ?? 1,
    branchName: 'sayori/sym',
    url: 'https://linear.app/sym/issue/SYM-1',
    createdAt: options.createdAt ?? '2026-05-14T00:00:00Z',
    updatedAt: options.updatedAt ?? '2026-05-14T00:01:00Z',
    state: { name: options.state ?? 'Todo' },
    labels: { nodes: options.labels ?? [] },
    inverseRelations: {
      nodes: [
        {
          type: 'blocks',
          issue: {
            id: 'blocker-1',
            identifier: 'SYM-0',
            state: { name: options.blockerState ?? 'Done' },
          },
        },
      ],
    },
  }
}
