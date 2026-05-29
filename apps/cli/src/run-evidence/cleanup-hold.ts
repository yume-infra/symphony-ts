import type { PlatformError } from 'effect'
import type { CleanupHold } from './schema.js'
import { join } from 'node:path'
import { Data, Effect, FileSystem } from 'effect'
import { decodeCleanupHoldJson, encodeCleanupHoldJson } from './schema.js'

const CLEANUP_HOLD_PATH = '.symphony/cleanup-hold.json'

export interface CleanupHoldInput {
  readonly issueId: string
  readonly issueIdentifier: string
  readonly attempt: number
  readonly reason: string
  readonly workspacePath: string
  readonly createdAtMs?: number
}

type CleanupHoldErrorCode
  = | 'cleanup_hold_read_failed'
    | 'cleanup_hold_decode_failed'
    | 'cleanup_hold_encode_failed'
    | 'cleanup_hold_write_failed'

export class CleanupHoldError extends Data.TaggedError('CleanupHoldError')<{
  readonly code: CleanupHoldErrorCode
  readonly workspacePath: string
  readonly path: string
  readonly reason: string
  readonly cause?: unknown
}> {}

export function cleanupHoldPath(workspacePath: string): string {
  return join(workspacePath, CLEANUP_HOLD_PATH)
}

export function writeCleanupHold(input: CleanupHoldInput): Effect.Effect<CleanupHold, CleanupHoldError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const createdAtMs = input.createdAtMs ?? Date.now()
    const path = cleanupHoldPath(input.workspacePath)
    const directory = join(input.workspacePath, '.symphony')
    const marker: CleanupHold = {
      version: 'cleanup-hold.v1',
      issueId: input.issueId,
      issueIdentifier: input.issueIdentifier,
      attempt: input.attempt,
      reason: input.reason,
      createdAtMs,
      createdAtIso: new Date(createdAtMs).toISOString(),
      workspacePath: input.workspacePath,
    }
    const encoded = yield* encodeCleanupHoldJson(marker).pipe(
      Effect.mapError(cause => new CleanupHoldError({
        code: 'cleanup_hold_encode_failed',
        workspacePath: input.workspacePath,
        path,
        reason: 'failed to encode cleanup hold marker JSON',
        cause,
      })),
    )

    yield* fs.makeDirectory(directory, { recursive: true }).pipe(
      Effect.mapError(cause => new CleanupHoldError({
        code: 'cleanup_hold_write_failed',
        workspacePath: input.workspacePath,
        path: directory,
        reason: `failed to create cleanup hold directory ${directory}`,
        cause,
      })),
    )

    yield* fs.writeFileString(path, encoded).pipe(
      Effect.mapError(cause => new CleanupHoldError({
        code: 'cleanup_hold_write_failed',
        workspacePath: input.workspacePath,
        path,
        reason: `failed to write cleanup hold marker ${path}`,
        cause,
      })),
    )

    return marker
  })
}

export function readCleanupHold(workspacePath: string): Effect.Effect<CleanupHold | null, CleanupHoldError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = cleanupHoldPath(workspacePath)
    const text = yield* fs.readFileString(path).pipe(
      Effect.catchTag('PlatformError', cause =>
        recoverReadMissingOrFailure(cause, workspacePath, path)),
    )

    if (text === null) {
      return null
    }

    return yield* decodeCleanupHoldJson(text).pipe(
      Effect.mapError(cause => new CleanupHoldError({
        code: 'cleanup_hold_decode_failed',
        workspacePath,
        path,
        reason: 'failed to decode cleanup-hold marker JSON',
        cause,
      })),
    )
  })
}

export function hasCleanupHold(workspacePath: string): Effect.Effect<boolean, CleanupHoldError, FileSystem.FileSystem> {
  return readCleanupHold(workspacePath).pipe(Effect.map(hold => hold !== null))
}

function recoverReadMissingOrFailure(
  cause: PlatformError.PlatformError,
  workspacePath: string,
  path: string,
): Effect.Effect<string | null, CleanupHoldError> {
  if (isNotFoundError(cause)) {
    return Effect.succeed(null)
  }

  return Effect.fail(new CleanupHoldError({
    code: 'cleanup_hold_read_failed',
    workspacePath,
    path,
    reason: `failed to read cleanup hold marker ${path}`,
    cause,
  }))
}

function isNotFoundError(cause: unknown): cause is PlatformError.PlatformError {
  return (
    typeof cause === 'object'
    && cause !== null
    && '_tag' in cause
    && cause._tag === 'PlatformError'
    && 'reason' in cause
    && typeof cause.reason === 'object'
    && cause.reason !== null
    && '_tag' in cause.reason
    && cause.reason._tag === 'NotFound'
  )
}
