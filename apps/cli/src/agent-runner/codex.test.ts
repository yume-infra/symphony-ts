import type { Issue, ServiceConfig } from '../domain/types.js'
import type { LinearGraphQLRequest, LinearGraphQLResponse } from '../tracker/linear.js'
import type { CodexRunParams } from './codex.js'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer, Schema } from 'effect'
import { createFakeCodexAppServerScript } from '../../tests/support/fakes/codex-app-server.js'
import { withFakeWorkspace } from '../../tests/support/fakes/workspace.js'
import { LinearTransport } from '../tracker/linear.js'
import { CodexAppServerClient, CodexAppServerClientLive, runCodexScriptTurn } from './codex.js'

const decodeUnknownJsonString = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)

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
  it.effect('starts a JSON-RPC thread and turn, then extracts identities, usage, rate limits, and events', () =>
    Effect.gen(function* () {
      const script = createFakeCodexAppServerScript([
        initializeOk(),
        threadOk(),
        turnStartOk(),
        {
          method: 'thread/tokenUsage/updated',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            tokenUsage: {
              total: {
                inputTokens: 10,
                outputTokens: 5,
                totalTokens: 15,
              },
            },
          },
        },
        {
          method: 'account/rateLimits/updated',
          params: {
            rateLimits: {
              primary: {
                remaining: 1,
              },
            },
          },
        },
        turnCompleted(),
      ])
      const events: Array<string> = []
      const result = yield* runCodexScriptTurn(script, {
        ...baseParams,
        onEvent: event => Effect.sync(() => {
          events.push(event.event)
        }),
      }).pipe(Effect.provide(fakeLinear([]).layer))

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
        'account/rateLimits/updated',
        'turn/completed',
      ])
      expect(recordAt(script.sentMessages, 0)).toMatchObject({
        id: 1,
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'symphony-ts',
            version: '0.0.0',
          },
          capabilities: {
            experimentalApi: true,
          },
        },
      })
      expect(recordAt(script.sentMessages, 1)).toMatchObject({
        id: 2,
        method: 'thread/start',
        params: {
          cwd: '/tmp/symphony/SYM-1',
          approvalPolicy: 'never',
          sandbox: 'workspace-write',
          serviceName: 'symphony-ts',
        },
      })
      expect(recordAt(script.sentMessages, 1).params).not.toHaveProperty('tools')
      expect(recordAt(script.sentMessages, 2)).toMatchObject({
        id: 3,
        method: 'turn/start',
        params: {
          threadId: 'thread-1',
          cwd: '/tmp/symphony/SYM-1',
          approvalPolicy: 'never',
          input: [
            {
              type: 'text',
              text: 'Prompt',
              text_elements: [],
            },
          ],
        },
      })
      expect(recordAt(script.sentMessages, 2).params).not.toHaveProperty('tools')
    }))

  it.effect('resumes an existing thread before starting the next turn', () =>
    Effect.gen(function* () {
      const script = createFakeCodexAppServerScript([
        initializeOk(),
        threadOk(2, 'thread-existing'),
        turnStartOk(3, 'thread-existing', 'turn-2'),
        turnCompleted('thread-existing', 'turn-2'),
      ])

      const result = yield* runCodexScriptTurn(script, {
        ...baseParams,
        threadId: 'thread-existing',
        turnNumber: 2,
      }).pipe(Effect.provide(fakeLinear([]).layer))

      expect(result).toMatchObject({
        sessionId: 'thread-existing-turn-2',
        threadId: 'thread-existing',
        turnId: 'turn-2',
        turnCount: 2,
      })
      expect(recordAt(script.sentMessages, 1)).toMatchObject({
        method: 'thread/resume',
        params: {
          threadId: 'thread-existing',
          cwd: '/tmp/symphony/SYM-1',
        },
      })
    }))

  it.effect('rejects app-server launch when cwd is not the issue workspace', () =>
    Effect.gen(function* () {
      const script = createFakeCodexAppServerScript([])
      const error = yield* runCodexScriptTurn(script, {
        ...baseParams,
        cwd: '/tmp/symphony',
      }).pipe(Effect.flip, Effect.provide(fakeLinear([]).layer))

      expect(error).toMatchObject({
        code: 'invalid_workspace_cwd',
      })
    }))

  it.effect('fails user-input server requests instead of stalling', () =>
    Effect.gen(function* () {
      const script = createFakeCodexAppServerScript([
        initializeOk(),
        threadOk(),
        turnStartOk(),
        {
          id: 'input-1',
          method: 'item/tool/requestUserInput',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            message: 'Need operator input',
          },
        },
      ])
      const error = yield* runCodexScriptTurn(script, baseParams).pipe(
        Effect.flip,
        Effect.provide(fakeLinear([]).layer),
      )

      expect(error).toMatchObject({
        code: 'turn_input_required',
        sessionId: 'thread-1-turn-1',
      })
      expect(recordAt(script.sentMessages, 3)).toMatchObject({
        id: 'input-1',
        error: {
          code: -32000,
        },
      })
    }))

  it.effect('auto-approves MCP elicitation requests so trusted connector tools can run unattended', () =>
    Effect.gen(function* () {
      const script = createFakeCodexAppServerScript([
        initializeOk(),
        threadOk(),
        turnStartOk(),
        {
          id: 'approval-1',
          method: 'mcpServer/elicitation/request',
          params: {
            threadId: 'thread-1',
            turnId: 'turn-1',
            serverName: 'codex_apps',
            mode: 'form',
            message: 'Allow Linear to run tool "linear_save_issue"?',
            requestedSchema: {
              type: 'object',
              properties: {},
            },
          },
        },
        turnCompleted(),
      ])
      const events: Array<string> = []

      yield* runCodexScriptTurn(script, {
        ...baseParams,
        onEvent: event => Effect.sync(() => {
          events.push(event.event)
        }),
      }).pipe(Effect.provide(fakeLinear([]).layer))

      expect(recordAt(script.sentMessages, 3)).toMatchObject({
        id: 'approval-1',
        result: {
          action: 'accept',
          content: {},
        },
      })
      expect(events).toContain('approval_granted')
      expect(events).not.toContain('approval_rejected')
    }))

  it.effect('returns protocol-shaped failures for unsupported dynamic tools and continues', () =>
    Effect.gen(function* () {
      const script = createFakeCodexAppServerScript([
        initializeOk(),
        threadOk(),
        turnStartOk(),
        {
          id: 'tool-1',
          method: 'item/tool/call',
          params: {
            tool: 'unknown_tool',
            arguments: {},
            callId: 'call-1',
            threadId: 'thread-1',
            turnId: 'turn-1',
          },
        },
        turnCompleted(),
      ])

      yield* runCodexScriptTurn(script, baseParams).pipe(Effect.provide(fakeLinear([]).layer))

      expect(recordAt(script.sentMessages, 3)).toMatchObject({
        id: 'tool-1',
        result: {
          success: false,
          contentItems: [
            {
              type: 'inputText',
            },
          ],
        },
      })
      expect(dynamicToolText(script.sentMessages[3])).toContain('unsupported_tool_call')
    }))

  it.effect('routes linear_graphql tool calls through configured Linear auth', () =>
    Effect.gen(function* () {
      const script = createFakeCodexAppServerScript([
        initializeOk(),
        threadOk(),
        turnStartOk(),
        {
          id: 'tool-1',
          method: 'item/tool/call',
          params: {
            tool: 'linear_graphql',
            arguments: { query: 'query Viewer { viewer { id } }' },
            callId: 'call-1',
            threadId: 'thread-1',
            turnId: 'turn-1',
          },
        },
        turnCompleted(),
      ])
      const fake = fakeLinear([{ status: 200, body: { data: { viewer: { id: 'me' } } } }])

      yield* runCodexScriptTurn(script, baseParams).pipe(Effect.provide(fake.layer))

      expect(fake.requests).toHaveLength(1)
      expect(fake.requests[0]).toMatchObject({
        endpoint: 'https://linear.example/graphql',
        apiKey: 'linear-secret',
      })
      expect(recordAt(script.sentMessages, 3)).toMatchObject({
        id: 'tool-1',
        result: {
          success: true,
        },
      })
      expect(decodeUnknownJsonString(dynamicToolText(script.sentMessages[3]))).toMatchObject({
        success: true,
        body: {
          data: {
            viewer: {
              id: 'me',
            },
          },
        },
      })
    }))

  it.live('runs the live JSON-RPC bridge through the Effect child-process adapter', () =>
    withFakeWorkspace(
      workspace =>
        Effect.gen(function* () {
          const events: Array<string> = []
          const processIds: Array<string | null> = []
          const fake = fakeLinear([])
          const result = yield* Effect.gen(function* () {
            const client = yield* CodexAppServerClient

            return yield* client.runTurn({
              ...baseParams,
              command: `${shellQuote(process.execPath)} -e ${shellQuote(fakeAppServerSource())}`,
              cwd: workspace.path,
              workspacePath: workspace.path,
              onEvent: event => Effect.sync(() => {
                events.push(event.event)
                processIds.push(event.codexAppServerPid)
              }),
            })
          }).pipe(Effect.provide(Layer.merge(CodexAppServerClientLive, fake.layer)))

          expect(result).toMatchObject({
            sessionId: 'thread-process-turn-process',
            threadId: 'thread-process',
            turnId: 'turn-process',
            usage: {
              inputTokens: 7,
              outputTokens: 3,
              totalTokens: 10,
            },
          })
          expect(events).toEqual([
            'session_started',
            'thread/tokenUsage/updated',
            'turn/completed',
          ])
          expect(processIds.every(processId => processId !== null)).toBe(true)
          expect(fake.requests).toHaveLength(0)
        }),
      'symphony-codex-',
    ).pipe(Effect.provide(NodeServices.layer)))
})

function initializeOk(id = 1): Record<string, unknown> {
  return {
    id,
    result: {
      userAgent: 'symphony-ts/0.0.0',
      codexHome: '/Users/example/.codex',
      platformFamily: 'unix',
      platformOs: 'macos',
    },
  }
}

function threadOk(id = 2, threadId = 'thread-1'): Record<string, unknown> {
  return {
    id,
    result: {
      thread: {
        id: threadId,
      },
    },
  }
}

function turnStartOk(id = 3, threadId = 'thread-1', turnId = 'turn-1'): Record<string, unknown> {
  return {
    id,
    result: {
      turn: {
        id: turnId,
        status: 'inProgress',
      },
      threadId,
    },
  }
}

function turnCompleted(threadId = 'thread-1', turnId = 'turn-1'): Record<string, unknown> {
  return {
    method: 'turn/completed',
    params: {
      threadId,
      turn: {
        id: turnId,
        status: 'completed',
      },
    },
  }
}

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

function fakeAppServerSource(): string {
  return `
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");

rl.on("line", (line) => {
  const message = JSON.parse(line);

  if (message.method === "initialize") {
    send({
      id: message.id,
      result: {
        userAgent: "fake-codex",
        codexHome: "/tmp/fake-codex",
        platformFamily: "unix",
        platformOs: "macos"
      }
    });
    return;
  }

  if (message.method === "thread/start") {
    send({
      id: message.id,
      result: {
        thread: {
          id: "thread-process"
        }
      }
    });
    return;
  }

  if (message.method === "turn/start") {
    send({
      id: message.id,
      result: {
        threadId: "thread-process",
        turn: {
          id: "turn-process",
          status: "inProgress"
        }
      }
    });
    send({
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "thread-process",
        turnId: "turn-process",
        tokenUsage: {
          total: {
            inputTokens: 7,
            outputTokens: 3,
            totalTokens: 10
          }
        }
      }
    });
    send({
      method: "turn/completed",
      params: {
        threadId: "thread-process",
        turn: {
          id: "turn-process",
          status: "completed"
        }
      }
    });
  }
});
`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function dynamicToolText(message: unknown): string {
  const result = recordAt([recordAt([message], 0).result], 0)
  const items = result.contentItems

  if (!Array.isArray(items)) {
    throw new TypeError('dynamic tool response did not include contentItems')
  }

  const first = items[0]

  if (!isRecord(first) || typeof first.text !== 'string') {
    throw new TypeError('dynamic tool response did not include text')
  }

  return first.text
}

function recordAt(values: ReadonlyArray<unknown>, index: number): Record<string, unknown> {
  const value = values[index]

  if (!isRecord(value)) {
    throw new TypeError(`expected record at index ${index}`)
  }

  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
