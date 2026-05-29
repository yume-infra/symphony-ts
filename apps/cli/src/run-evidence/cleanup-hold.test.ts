import type { CleanupHold } from './schema.js'
import { join } from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { describe, expect, it } from '@effect/vitest'
import { Effect, FileSystem } from 'effect'
import { withFakeWorkspace } from '../../tests/support/fakes/workspace.js'
import {
  cleanupHoldPath,
  hasCleanupHold,
  readCleanupHold,
  writeCleanupHold,
} from './cleanup-hold.js'
import {
  decodeCleanupHoldJson,
  encodeCleanupHoldJson,
} from './schema.js'

describe('cleanup hold schema', () => {
  it.effect('round-trips cleanup hold JSON through Effect Schema', () =>
    Effect.gen(function* () {
      const hold: CleanupHold = {
        version: 'cleanup-hold.v1',
        issueId: 'issue-1',
        issueIdentifier: 'SYM-1',
        attempt: 3,
        reason: 'run evidence write failed',
        createdAtMs: 1_720_000_000_000,
        createdAtIso: '2024-07-14T10:13:20.000Z',
        workspacePath: '/tmp/symphony/workspaces/SYM-1',
      }
      const encoded = yield* encodeCleanupHoldJson(hold)
      const decoded = yield* decodeCleanupHoldJson(encoded)

      expect(decoded).toEqual(hold)
    }))
})

describe('cleanup hold storage', () => {
  it.effect('writes and reads a cleanup hold marker in the workspace metadata directory', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const workspacePath = join(root.path, 'SYM-1')
        yield* fs.makeDirectory(workspacePath, { recursive: true })

        const marker = yield* writeCleanupHold({
          issueId: 'issue-1',
          issueIdentifier: 'SYM-1',
          attempt: 2,
          reason: 'run-evidence write failed',
          workspacePath,
          createdAtMs: 1_720_000_000_100,
        })
        const readBack = yield* readCleanupHold(workspacePath)
        const has = yield* hasCleanupHold(workspacePath)
        const rawFile = yield* fs.readFileString(cleanupHoldPath(workspacePath))
        const fileMarker = yield* decodeCleanupHoldJson(rawFile)

        expect(readBack).toEqual(marker)
        expect(readBack).toEqual(fileMarker)
        expect(has).toBe(true)
      }), 'symphony-cleanup-hold-').pipe(Effect.provide(NodeServices.layer)))

  it.effect('returns none/false when no cleanup hold marker exists', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const workspacePath = join(root.path, 'SYM-1')

        const read = yield* readCleanupHold(workspacePath)
        const has = yield* hasCleanupHold(workspacePath)

        expect(read).toBeNull()
        expect(has).toBe(false)
      }), 'symphony-cleanup-hold-missing-').pipe(Effect.provide(NodeServices.layer)))

  it.effect('returns typed failure when the marker file contains invalid JSON', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const workspacePath = join(root.path, 'SYM-1')
        const markerPath = cleanupHoldPath(workspacePath)

        yield* fs.makeDirectory(join(root.path, 'SYM-1', '.symphony'), { recursive: true })
        yield* fs.writeFileString(markerPath, '{"version":"cleanup-hold.v1","issueId":')

        const readError = yield* Effect.flip(readCleanupHold(workspacePath))
        const hasError = yield* Effect.flip(hasCleanupHold(workspacePath))

        expect(readError).toMatchObject({
          code: 'cleanup_hold_decode_failed',
        })
        expect(hasError).toMatchObject({
          code: 'cleanup_hold_decode_failed',
        })
      }), 'symphony-cleanup-hold-bad-').pipe(Effect.provide(NodeServices.layer)))
})
