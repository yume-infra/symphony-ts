import type { CodexRuntimeEvent } from '../agent-runner/codex.js'
import type { AgentRunResult } from '../agent-runner/runner.js'
import type { Issue, ServiceConfig } from '../domain/types.js'
import type { RunEvidenceAttemptInput } from './service.js'
import { join } from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { describe, expect, it } from '@effect/vitest'
import { Effect, Exit, FileSystem } from 'effect'
import { withFakeWorkspace } from '../../tests/support/fakes/workspace.js'
import { decodeCodexRuntimeEvent, encodeCodexRuntimeEvent } from '../agent-runner/codex.js'
import { CodexError } from '../domain/errors.js'
import { decodeRunEvidenceEventJson, decodeRunSummaryJson } from './schema.js'
import {
  buildRunSummary,
  collectRunEvidenceEvents,
  evidenceDirectoryFor,
  evidenceParentDirectory,
  summarizeExit,
  writeAttempt,
} from './service.js'

describe('run evidence service', () => {
  it('builds deterministic sibling evidence paths', () => {
    const timestampMs = Date.UTC(2026, 4, 28, 1, 2, 3)

    expect(evidenceDirectoryFor('/tmp/symphony/workspaces', 'SAY/9', 0, timestampMs))
      .toBe('/tmp/symphony/evidence/20260528-010203-SAY_9-attempt-1')
    expect(evidenceParentDirectory('/tmp/symphony/workspaces')).toBe('/tmp/symphony/evidence')
  })

  it('classifies success, typed failures, defects, and interruptions', () => {
    expect(summarizeExit(Exit.succeed('ok')).classification).toBe('success')

    const typed = summarizeExit(Exit.fail(new CodexError({
      code: 'turn_failed',
      reason: 'turn failed with lin_api_secret',
    })))
    expect(typed).toMatchObject({
      status: 'failure',
      classification: 'typed_failure',
      typedErrors: [
        {
          tag: 'CodexError',
          code: 'turn_failed',
          reason: 'turn failed with [redacted]',
        },
      ],
    })

    const defect = summarizeExit(Exit.die(new Error('boom')))
    expect(defect).toMatchObject({
      status: 'failure',
      classification: 'defect',
      defects: [
        {
          tag: 'Error',
          reason: 'boom',
        },
      ],
    })

    const interruption = summarizeExit(Exit.interrupt(1))
    expect(interruption).toMatchObject({
      status: 'failure',
      classification: 'interruption',
      message: 'worker interrupted',
      interruptions: [{ fiberId: 1 }],
    })

    const nonJsonDefect = summarizeExit(Exit.die({ value: 1n }))
    expect(nonJsonDefect).toMatchObject({
      status: 'failure',
      classification: 'defect',
      defects: [
        {
          reason: '{"value":"1n"}',
        },
      ],
    })
  })

  it.effect('encodes and decodes the schema-backed Codex runtime event union', () =>
    Effect.gen(function* () {
      const event: CodexRuntimeEvent = {
        type: 'tool_call',
        event: 'item/tool/call',
        timestamp: 1000,
        codexAppServerPid: '1234',
        sessionId: 'thread-1-turn-1',
        message: null,
        usage: null,
        rateLimits: null,
        toolName: 'linear_graphql',
        callId: 'call-1',
        success: true,
        error: null,
        threadId: 'thread-1',
        turnId: 'turn-1',
        details: {
          arguments: {
            query: 'query { viewer { id } }',
          },
        },
      }

      const encoded = yield* encodeCodexRuntimeEvent(event)
      const decoded = yield* decodeCodexRuntimeEvent(encoded)

      expect(decoded).toEqual(event)
    }))

  it('collects tool, protocol, file, token, and final-answer evidence from Codex events', () => {
    const events: ReadonlyArray<CodexRuntimeEvent> = [
      codexEvent({
        type: 'protocol_client_request',
        event: 'turn/start',
        method: 'turn/start',
        protocolId: '3',
        timestamp: 1050,
        details: {
          promptLength: 128,
          promptSha256: 'abc123',
          promptPreview: 'Work on SYM-1',
        },
      }),
      codexEvent({
        timestamp: 1100,
        threadId: null,
        turnId: null,
        usage: {
          inputTokens: 8,
          outputTokens: 3,
          totalTokens: 11,
        },
      }),
      codexEvent({
        type: 'agent_message',
        event: 'agent/message',
        timestamp: 1200,
        text: 'Looking at Bearer secret-token',
      }),
      codexEvent({
        type: 'tool_call',
        event: 'item/tool/call',
        timestamp: 1300,
        toolName: 'linear_graphql',
        callId: 'call-1',
        success: false,
        error: 'lin_api_secret',
        details: {
          input: {
            query: 'mutation IssueUpdate { issueUpdate { issue { identifier state { name type } } } }',
          },
          output: {
            success: true,
            body: {
              data: {
                issueUpdate: {
                  issue: {
                    identifier: 'SYM-1',
                    state: {
                      name: 'Done',
                      type: 'completed',
                    },
                  },
                },
              },
            },
          },
        },
      }),
      codexEvent({
        event: 'symphony/file_change',
        timestamp: 1400,
        details: {
          files: [
            {
              path: 'apps/cli/src/run-evidence/service.ts',
              operation: 'modified',
            },
          ],
        },
      }),
      codexEvent({
        type: 'turn_completed',
        event: 'turn/completed',
        timestamp: 1500,
        status: 'completed',
        finalAnswer: 'Done with sk-secret-secret-secret',
        rawSessionPath: null,
        details: {},
      }),
    ]

    const timeline = collectRunEvidenceEvents(events, 1000, 2000, summarizeExit(Exit.succeed('ok')))
    const summary = buildRunSummary(attemptInput({
      codexEvents: events,
      workerExit: Exit.succeed(agentResult({ usage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 } })),
    }))

    expect(timeline.map(event => event.kind)).toEqual([
      'lifecycle',
      'prompt',
      'codex_protocol',
      'token_usage',
      'codex_protocol',
      'agent_message',
      'tool_call',
      'file_change',
      'codex_protocol',
      'final_answer',
      'codex_protocol',
      'lifecycle',
    ])
    expect(timeline).toContainEqual(expect.objectContaining({
      kind: 'prompt',
      promptLength: 128,
      promptSha256: 'abc123',
      preview: 'Work on SYM-1',
    }))
    expect(summary.tools).toEqual([{
      toolName: 'linear_graphql',
      callId: 'call-1',
      success: false,
      error: '[redacted]',
      timestamp: 1300,
      details: {
        input: {
          query: 'mutation IssueUpdate { issueUpdate { issue { identifier state { name type } } } }',
        },
        output: {
          success: true,
          body: {
            data: {
              issueUpdate: {
                issue: {
                  identifier: 'SYM-1',
                  state: {
                    name: 'Done',
                    type: 'completed',
                  },
                },
              },
            },
          },
        },
      },
    }])
    expect(summary.fileChanges).toEqual([{
      path: 'apps/cli/src/run-evidence/service.ts',
      operation: 'modified',
    }])
    expect(summary.codex.rawSession).toEqual({
      status: 'unavailable',
      reason: 'not provided by Codex app-server protocol/runtime data',
    })
    expect(summary.timeline).toContainEqual(expect.objectContaining({
      kind: 'codex_protocol',
      event: 'thread/tokenUsage/updated',
      threadId: 'thread-1',
      turnId: 'turn-1',
    }))
    expect(summary.timeline).toContainEqual(expect.objectContaining({
      kind: 'agent_message',
      text: 'Looking at [redacted]',
    }))
    expect(summary.timeline).toContainEqual(expect.objectContaining({
      kind: 'final_answer',
      text: 'Done with [redacted]',
    }))
  })

  it('treats completed agent messages as final-answer evidence when turn completion has no text', () => {
    const summary = buildRunSummary(attemptInput({
      codexEvents: [
        codexEvent({
          type: 'agent_message',
          event: 'item/agentMessage/completed',
          text: 'Final response',
        }),
        codexEvent({
          type: 'turn_completed',
          event: 'turn/completed',
          status: 'completed',
          finalAnswer: null,
          rawSessionPath: null,
          details: {},
        }),
      ],
    }))

    expect(summary.timeline).toContainEqual(expect.objectContaining({
      kind: 'final_answer',
      text: 'Final response',
    }))
  })

  it('redacts secret-looking issue titles in generated summaries', () => {
    const summary = buildRunSummary(attemptInput({
      issue: issue({
        title: 'Fix token lin_api_secret',
      }),
    }))

    expect(summary.issue.title).toBe('Fix token [redacted]')
  })

  it.effect('writes markdown, JSON, and JSONL evidence for an attempt', () =>
    withFakeWorkspace(
      root =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          const workspaceRoot = join(root.path, 'workspaces')
          const workspacePath = join(workspaceRoot, 'SYM-1')

          yield* fs.makeDirectory(workspaceRoot, { recursive: true })

          const result = yield* writeAttempt(attemptInput({
            config: serviceConfig(workspaceRoot),
            workspacePath,
            completedAtMs: Date.UTC(2026, 4, 28, 1, 0, 1),
            codexEvents: [
              codexEvent({
                timestamp: Date.UTC(2026, 4, 28, 1, 0, 0, 500),
              }),
            ],
            workerExit: Exit.succeed(agentResult({
              workspacePath,
            })),
          }))
          const markdown = yield* fs.readFileString(result.summaryMarkdownPath)
          const summaryJson = yield* fs.readFileString(result.summaryJsonPath)
          const protocolEventsJsonl = yield* fs.readFileString(result.protocolEventsPath)
          const decodedSummary = yield* decodeRunSummaryJson(summaryJson)
          const protocolEvents = yield* Effect.all(
            protocolEventsJsonl.trim().split('\n').map(line => decodeRunEvidenceEventJson(line)),
          )

          expect(result.directory).toBe(join(root.path, 'evidence', '20260528-010001-SYM-1-attempt-1'))
          expect(markdown).toContain('# Run Summary: SYM-1 attempt 1')
          expect(decodedSummary.issue.identifier).toBe('SYM-1')
          expect(decodedSummary.issue.title).toBe('Implement runtime evidence')
          expect(decodedSummary.workspace.path).toBe(workspacePath)
          expect(protocolEvents[0]).toMatchObject({
            kind: 'lifecycle',
            label: 'worker_attempt_started',
          })
          expect(protocolEvents.at(-1)).toMatchObject({
            kind: 'lifecycle',
            label: 'worker_attempt_completed',
          })
        }),
      'symphony-evidence-',
    ).pipe(Effect.provide(NodeServices.layer)))

  it.effect('rejects symlinked evidence attempt directories before writing artifacts', () =>
    withFakeWorkspace(
      root =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          const workspaceRoot = join(root.path, 'workspaces')
          const outside = join(root.path, 'outside')
          const attemptDirectory = evidenceDirectoryFor(
            workspaceRoot,
            'SYM-1',
            0,
            Date.UTC(2026, 4, 28, 1, 0, 1),
          )

          yield* fs.makeDirectory(join(root.path, 'evidence'), { recursive: true })
          yield* fs.makeDirectory(outside, { recursive: true })
          yield* fs.symlink(outside, attemptDirectory)

          const error = yield* Effect.flip(writeAttempt(attemptInput({
            config: serviceConfig(workspaceRoot),
            completedAtMs: Date.UTC(2026, 4, 28, 1, 0, 1),
          })))

          expect(error).toMatchObject({
            code: 'evidence_path_outside_root',
            path: attemptDirectory,
          })
        }),
      'symphony-evidence-symlink-',
    ).pipe(Effect.provide(NodeServices.layer)))
})

function attemptInput(overrides: Partial<RunEvidenceAttemptInput> = {}): RunEvidenceAttemptInput {
  return {
    issue: issue(),
    attempt: 0,
    config: serviceConfig('/tmp/symphony/workspaces'),
    workspacePath: '/tmp/symphony/workspaces/SYM-1',
    startedAtMs: Date.UTC(2026, 4, 28, 1, 0, 0),
    completedAtMs: Date.UTC(2026, 4, 28, 1, 0, 1),
    workerExit: Exit.succeed(agentResult()),
    codexEvents: [],
    workspaceFailures: [],
    cleanup: {
      outcome: 'removed',
      reason: null,
    },
    ...overrides,
  }
}

function agentResult(overrides: {
  readonly issue?: Issue
  readonly workspacePath?: string
  readonly usage?: AgentRunResult['session']['usage']
} = {}): AgentRunResult {
  const resultIssue = overrides.issue ?? issue({ state: 'Done', stateType: 'completed' })

  return {
    issue: resultIssue,
    workspace: {
      path: overrides.workspacePath ?? '/tmp/symphony/workspaces/SYM-1',
      workspaceKey: resultIssue.identifier,
      createdNow: true,
    },
    session: {
      sessionId: 'thread-1-turn-1',
      threadId: 'thread-1',
      turnId: 'turn-1',
      turnCount: 1,
      usage: overrides.usage ?? {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
      rateLimits: {
        primary: {
          remaining: 1,
        },
      },
    },
    turns: 1,
  }
}

function codexEvent(overrides: Partial<CodexRuntimeEvent> = {}): CodexRuntimeEvent {
  const base: CodexRuntimeEvent = {
    type: 'protocol_notification',
    event: 'thread/tokenUsage/updated',
    timestamp: 1000,
    codexAppServerPid: null,
    sessionId: 'thread-1-turn-1',
    message: null,
    usage: null,
    rateLimits: null,
    method: 'thread/tokenUsage/updated',
    threadId: 'thread-1',
    turnId: 'turn-1',
    details: {},
  }

  return {
    ...base,
    ...overrides,
  } as CodexRuntimeEvent
}

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    identifier: 'SYM-1',
    title: 'Implement runtime evidence',
    description: null,
    priority: 1,
    state: 'Todo',
    stateType: 'unstarted',
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    createdAt: '2026-05-28T00:00:00.000Z',
    updatedAt: '2026-05-28T00:01:00.000Z',
    ...overrides,
  }
}

function serviceConfig(workspaceRoot: string): ServiceConfig {
  return {
    workflowPath: '/repo/WORKFLOW.md',
    workflowDirectory: '/repo',
    promptTemplate: 'Prompt',
    tracker: {
      kind: 'linear',
      endpoint: 'https://linear.example/graphql',
      apiKey: 'linear-secret',
      projectSlug: 'symphony',
      activeStates: ['Todo', 'In Progress'],
      terminalStates: ['Done', 'Closed'],
    },
    polling: {
      intervalMs: 30000,
    },
    workspace: {
      root: workspaceRoot,
    },
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
}
