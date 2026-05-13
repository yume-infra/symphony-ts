import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface FakeWorkspace {
  readonly root: string
  readonly path: string
  readonly cleanup: () => Promise<void>
}

export async function createFakeWorkspace(
  prefix = 'symphony-ts-test-',
): Promise<FakeWorkspace> {
  const root = await mkdtemp(join(tmpdir(), prefix))

  return {
    root,
    path: root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}
