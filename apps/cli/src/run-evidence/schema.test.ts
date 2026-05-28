import type { RunEvidenceEvent, RunSummary } from './schema.js'
import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import {
  decodeRunEvidenceEventJson,
  decodeRunSummaryJson,
  encodeRunEvidenceEventJson,
  encodeRunSummaryJson,
} from './schema.js'

describe('run evidence schemas', () => {
  it.effect('round-trips run-summary.json through Effect Schema', () =>
    Effect.gen(function* () {
      const summary: RunSummary = {
        schemaVersion: 'run-summary.v1',
        issue: {
          id: 'issue-1',
          identifier: 'SYM-1',
          title: 'Implement runtime evidence',
          finalState: 'Done',
          stateType: 'completed',
        },
        attempt: 1,
        startedAt: '2026-05-28T01:00:00.000Z',
        completedAt: '2026-05-28T01:00:01.000Z',
        durationMs: 1000,
        workspace: {
          path: '/tmp/symphony/SYM-1',
          cleanup: {
            outcome: 'removed',
            reason: null,
          },
        },
        codex: {
          sessionId: 'thread-1-turn-1',
          threadId: 'thread-1',
          turnId: 'turn-1',
          rawSession: {
            status: 'unavailable',
            reason: 'not provided by runtime',
          },
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
        },
        lifecycle: {
          exit: {
            status: 'success',
            classification: 'success',
            message: 'worker completed successfully',
            pretty: null,
            typedErrors: [],
            defects: [],
            interruptions: [],
          },
        },
        tools: [],
        fileChanges: [],
        hooks: [],
        timeline: [],
      }

      const encoded = yield* encodeRunSummaryJson(summary)
      const decoded = yield* decodeRunSummaryJson(encoded)

      expect(encoded).toContain('"schemaVersion":"run-summary.v1"')
      expect(decoded).toEqual(summary)
    }))

  it.effect('round-trips protocol-events.jsonl entries through Effect Schema', () =>
    Effect.gen(function* () {
      const event: RunEvidenceEvent = {
        kind: 'codex_protocol',
        timestamp: Date.UTC(2026, 4, 28, 1, 0, 0),
        event: 'turn/start',
        direction: 'client_request',
        method: 'turn/start',
        protocolId: '3',
        sessionId: 'thread-1-turn-1',
        threadId: 'thread-1',
        turnId: 'turn-1',
        details: {
          promptBytes: 120,
        },
      }

      const encoded = yield* encodeRunEvidenceEventJson(event)
      const decoded = yield* decodeRunEvidenceEventJson(encoded)

      expect(encoded).toContain('"kind":"codex_protocol"')
      expect(encoded).toContain('"method":"turn/start"')
      expect(decoded).toEqual(event)
    }))
})
