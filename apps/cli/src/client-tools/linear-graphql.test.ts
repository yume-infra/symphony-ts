import type { ServiceConfig } from '../domain/types.js'
import type { LinearGraphQLRequest, LinearGraphQLResponse } from '../tracker/linear.js'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer, Schema } from 'effect'
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

const encodeUnknownJsonString = Schema.encodeUnknownSync(Schema.UnknownFromJsonString)

describe('linear_graphql client tool', () => {
  it.effect('executes a valid operation with configured Linear auth', () =>
    Effect.gen(function* () {
      const fake = createFakeTransport([{ status: 200, body: { data: { viewer: { id: 'me' } } } }])
      const result = yield* executeLinearGraphQLTool(config, {
        query: 'query Viewer { viewer { id } }',
        variables: {},
      }).pipe(Effect.provide(fake.layer))

      expect(result).toMatchObject({
        success: true,
        body: { data: { viewer: { id: 'me' } } },
      })
      expect(fake.requests[0]).toMatchObject({
        endpoint: 'https://linear.example/graphql',
        apiKey: 'linear-secret',
      })
    }))

  it.effect('preserves GraphQL error payloads as success=false', () =>
    Effect.gen(function* () {
      const fake = createFakeTransport([{ status: 200, body: { errors: [{ message: 'bad' }] } }])
      const result = yield* executeLinearGraphQLTool(config, 'query Viewer { viewer { id } }').pipe(
        Effect.provide(fake.layer),
      )

      expect(result).toMatchObject({
        success: false,
        error: { code: 'graphql_errors' },
        body: { errors: [{ message: 'bad' }] },
      })
    }))

  it.effect('rejects invalid input without calling Linear', () =>
    Effect.gen(function* () {
      const fake = createFakeTransport([])
      const empty = yield* executeLinearGraphQLTool(config, { query: '' }).pipe(
        Effect.provide(fake.layer),
      )
      const multiple = yield* executeLinearGraphQLTool(
        config,
        'query A { viewer { id } } query B { viewer { name } }',
      ).pipe(Effect.provide(fake.layer))
      const variables = yield* executeLinearGraphQLTool(config, {
        query: 'query Viewer { viewer { id } }',
        variables: [],
      }).pipe(Effect.provide(fake.layer))

      expect(empty).toMatchObject({ success: false, error: { code: 'empty_query' } })
      expect(multiple).toMatchObject({ success: false, error: { code: 'invalid_operation_count' } })
      expect(variables).toMatchObject({ success: false, error: { code: 'invalid_variables' } })
      expect(fake.requests).toEqual([])
    }))

  it.effect('returns structured missing-auth failures without exposing tokens', () =>
    Effect.gen(function* () {
      const fake = createFakeTransport([])
      const result = yield* executeLinearGraphQLTool({
        ...config,
        tracker: {
          ...config.tracker,
          apiKey: null,
        },
      }, 'query Viewer { viewer { id } }').pipe(Effect.provide(fake.layer))

      expect(result).toMatchObject({
        success: false,
        error: {
          code: 'missing_auth',
        },
      })
      expect(encodeUnknownJsonString(result)).not.toContain('linear-secret')
      expect(fake.requests).toEqual([])
    }))
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
