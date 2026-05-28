import type { Scope } from 'effect'
import { Effect, FileSystem } from 'effect'

export interface FakeWorkspace {
  readonly root: string
  readonly path: string
}

export const makeFakeWorkspace = Effect.fn('makeFakeWorkspace')(function* (
  prefix = 'symphony-ts-test-',
): Effect.fn.Return<FakeWorkspace, never, FileSystem.FileSystem | Scope.Scope> {
  const fs = yield* FileSystem.FileSystem
  const root = yield* fs.makeTempDirectoryScoped({ prefix }).pipe(Effect.orDie)

  return {
    root,
    path: root,
  }
})

export function withFakeWorkspace<A, E, R>(
  use: (workspace: FakeWorkspace) => Effect.Effect<A, E, R>,
  prefix?: string,
): Effect.Effect<A, E, R | FileSystem.FileSystem> {
  return Effect.scoped(Effect.gen(function* () {
    const workspace = yield* makeFakeWorkspace(prefix)

    return yield* use(workspace)
  }))
}
