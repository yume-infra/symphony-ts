import type { Issue, ServiceConfig } from '../domain/types.js'
import type { LinearGraphQLRequest, LinearGraphQLResponse } from '../tracker/linear.js'
import type { CodexRunParams } from './codex.js'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { runEffect } from '../../tests/support/effect.js'
import { createFakeCodexAppServerScript } from '../../tests/support/fakes/codex-app-server.js'
import { LinearTransport } from '../tracker/linear.js'
import { runCodexScriptTurn } from './codex.js'

const issue: Issue = {
  id: 'issue-1',
  identifier: 'SYM-1',
  title: 'Implement runtime',
  description: null,
  priority: 1,
  state: 'Todo',
  branchName: null,
  url: null,
  labels: [],
  blockedBy: [],
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:01:00.000Z',
}

const serviceConfig: ServiceConfig = {
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
    approvalPolicy: 'never',
    threadSandbox: 'workspace-write',
    turnSandboxPolicy: null,
    turnTimeoutMs: 3600000,
    readTimeoutMs: 5000,
    stallTimeoutMs: 300000,
  },
}

const baseParams: CodexRunParams = {
  command: 'codex app-server',
  cwd: '/tmp/symphony/SYM-1',
  workspacePath: '/tmp/symphony/SYM-1',
  prompt: 'Prompt',
  issue,
  config: serviceConfig.codex,
  serviceConfig,
  threadId: null,
  turnNumber: 1,
}

describe('codex app-server boundary', () => {
  it('extracts thread and turn identities, usage, rate limits, and emitted events', async () => {
    const script = createFakeCodexAppServerScript([
      { event: 'session_started', payload: { thread_id: 'thread-1', turn_id: 'turn-1', pid: '123' } },
      { event: 'thread/tokenUsage/updated', payload: { total_token_usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } },
      { event: 'rate_limits', payload: { primary: { remaining: 1 } } },
      { event: 'turn_completed', payload: { thread_id: 'thread-1', turn_id: 'turn-1' } },
    ])
    const events: Array<string> = []
    const result = await runEffect(runCodexScriptTurn(script, {
      ...baseParams,
      onEvent: event => Effect.sync(() => {
        events.push(event.event)
      }),
    }), { layer: fakeLinear([]).layer })

    expect(result).toMatchObject({
      sessionId: 'thread-1-turn-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
      rateLimits: {
        primary: {
          remaining: 1,
        },
      },
    })
    expect(events).toEqual([
      'session_started',
      'thread/tokenUsage/updated',
      'rate_limits',
      'turn_completed',
    ])
    expect(script.sentMessages[0]).toMatchObject({
      type: 'turn_start',
      cwd: '/tmp/symphony/SYM-1',
      prompt: 'Prompt',
      tools: ['linear_graphql'],
    })
  })

  it('rejects app-server launch when cwd is not the issue workspace', async () => {
    const script = createFakeCodexAppServerScript([])
    const error = await runEffect(Effect.flip(runCodexScriptTurn(script, {
      ...baseParams,
      cwd: '/tmp/symphony',
    })), { layer: fakeLinear([]).layer })

    expect(error).toMatchObject({
      code: 'invalid_workspace_cwd',
    })
  })

  it('fails user-input-required events instead of stalling', async () => {
    const script = createFakeCodexAppServerScript([
      { event: 'session_started', payload: { thread_id: 'thread-1', turn_id: 'turn-1' } },
      { event: 'turn_input_required', payload: { message: 'Need approval' } },
    ])
    const error = await runEffect(Effect.flip(runCodexScriptTurn(script, baseParams)), {
      layer: fakeLinear([]).layer,
    })

    expect(error).toMatchObject({
      code: 'turn_input_required',
      sessionId: 'thread-1-turn-1',
    })
  })

  it('returns structured failures for unsupported dynamic tools and continues', async () => {
    const script = createFakeCodexAppServerScript([
      { event: 'session_started', payload: { thread_id: 'thread-1', turn_id: 'turn-1' } },
      { event: 'tool_call', payload: { name: 'unknown_tool', input: {} } },
      { event: 'turn_completed', payload: { thread_id: 'thread-1', turn_id: 'turn-1' } },
    ])

    await runEffect(runCodexScriptTurn(script, baseParams), { layer: fakeLinear([]).layer })

    expect(script.sentMessages[1]).toMatchObject({
      type: 'tool_result',
      name: 'unknown_tool',
      result: {
        success: false,
        error: {
          code: 'unsupported_tool_call',
        },
      },
    })
  })

  it('routes linear_graphql tool calls through configured Linear auth', async () => {
    const script = createFakeCodexAppServerScript([
      { event: 'session_started', payload: { thread_id: 'thread-1', turn_id: 'turn-1' } },
      { event: 'tool_call', payload: { name: 'linear_graphql', input: { query: 'query Viewer { viewer { id } }' } } },
      { event: 'turn_completed', payload: { thread_id: 'thread-1', turn_id: 'turn-1' } },
    ])
    const fake = fakeLinear([{ status: 200, body: { data: { viewer: { id: 'me' } } } }])

    await runEffect(runCodexScriptTurn(script, baseParams), { layer: fake.layer })

    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0]).toMatchObject({
      endpoint: 'https://linear.example/graphql',
      apiKey: 'linear-secret',
    })
    expect(script.sentMessages[1]).toMatchObject({
      type: 'tool_result',
      name: 'linear_graphql',
      result: {
        success: true,
      },
    })
  })
})

function fakeLinear(responses: ReadonlyArray<LinearGraphQLResponse>): {
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
