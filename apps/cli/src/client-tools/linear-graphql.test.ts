import type { ServiceConfig } from '../domain/types.js'
import type { LinearGraphQLRequest, LinearGraphQLResponse } from '../tracker/linear.js'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { runEffect } from '../../tests/support/effect.js'
import { LinearTransport } from '../tracker/linear.js'
import { executeLinearGraphQLTool } from './linear-graphql.js'

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

describe('linear_graphql client tool', () => {
  it('executes a valid operation with configured Linear auth', async () => {
    const fake = createFakeTransport([{ status: 200, body: { data: { viewer: { id: 'me' } } } }])
    const result = await runEffect(executeLinearGraphQLTool(config, {
      query: 'query Viewer { viewer { id } }',
      variables: {},
    }), { layer: fake.layer })

    expect(result).toMatchObject({
      success: true,
      body: { data: { viewer: { id: 'me' } } },
    })
    expect(fake.requests[0]).toMatchObject({
      endpoint: 'https://linear.example/graphql',
      apiKey: 'linear-secret',
    })
  })

  it('preserves GraphQL error payloads as success=false', async () => {
    const fake = createFakeTransport([{ status: 200, body: { errors: [{ message: 'bad' }] } }])
    const result = await runEffect(executeLinearGraphQLTool(config, 'query Viewer { viewer { id } }'), {
      layer: fake.layer,
    })

    expect(result).toMatchObject({
      success: false,
      error: { code: 'graphql_errors' },
      body: { errors: [{ message: 'bad' }] },
    })
  })

  it('rejects invalid input without calling Linear', async () => {
    const fake = createFakeTransport([])
    const empty = await runEffect(executeLinearGraphQLTool(config, { query: '' }), { layer: fake.layer })
    const multiple = await runEffect(executeLinearGraphQLTool(config, 'query A { viewer { id } } query B { viewer { name } }'), {
      layer: fake.layer,
    })
    const variables = await runEffect(executeLinearGraphQLTool(config, {
      query: 'query Viewer { viewer { id } }',
      variables: [],
    }), { layer: fake.layer })

    expect(empty).toMatchObject({ success: false, error: { code: 'empty_query' } })
    expect(multiple).toMatchObject({ success: false, error: { code: 'invalid_operation_count' } })
    expect(variables).toMatchObject({ success: false, error: { code: 'invalid_variables' } })
    expect(fake.requests).toEqual([])
  })

  it('returns structured missing-auth failures without exposing tokens', async () => {
    const fake = createFakeTransport([])
    const result = await runEffect(executeLinearGraphQLTool({
      ...config,
      tracker: {
        ...config.tracker,
        apiKey: null,
      },
    }, 'query Viewer { viewer { id } }'), { layer: fake.layer })

    expect(result).toMatchObject({
      success: false,
      error: {
        code: 'missing_auth',
      },
    })
    expect(JSON.stringify(result)).not.toContain('linear-secret')
    expect(fake.requests).toEqual([])
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
