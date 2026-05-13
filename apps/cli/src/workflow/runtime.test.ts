import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { runEffect } from '../../tests/support/effect.js'
import { createFakeWorkspace } from '../../tests/support/fakes/workspace.js'
import { ConfigResolverLive } from '../config/resolve.js'
import { WorkflowLoaderLive } from './loader.js'
import { WorkflowRuntime, WorkflowRuntimeLive } from './runtime.js'

describe('workflowRuntime', () => {
  it('loads the initial workflow config and applies valid reloads', async () => {
    const root = await createFakeWorkspace()

    try {
      const workflowPath = join(root.path, 'WORKFLOW.md')
      await writeFile(workflowPath, workflowSource(30000))

      const result = await runEffect(Effect.gen(function* () {
        const runtime = yield* WorkflowRuntime
        const initial = yield* runtime.getConfig
        yield* Effect.promise(() => writeFile(workflowPath, workflowSource(45000)))
        const reload = yield* runtime.reload
        const updated = yield* runtime.getConfig

        return { initial, reload, updated }
      }), {
        layer: WorkflowRuntimeLive(workflowPath).pipe(
          Layer.provide(Layer.mergeAll(WorkflowLoaderLive, ConfigResolverLive)),
        ),
      })

      expect(result.initial.polling.intervalMs).toBe(30000)
      expect(result.reload.applied).toBe(true)
      expect(result.updated.polling.intervalMs).toBe(45000)
    }
    finally {
      await root.cleanup()
    }
  })

  it('keeps last known good config when reload validation fails', async () => {
    const root = await createFakeWorkspace()

    try {
      const workflowPath = join(root.path, 'WORKFLOW.md')
      await writeFile(workflowPath, workflowSource(30000))

      const result = await runEffect(Effect.gen(function* () {
        const runtime = yield* WorkflowRuntime
        yield* Effect.promise(() => writeFile(workflowPath, `---
tracker:
  kind: linear
  api_key: test-token
  project_slug: symphony
polling:
  interval_ms: 1000
codex:
  command: ""
---
Prompt`))
        const reload = yield* runtime.reload
        const snapshot = yield* runtime.getSnapshot

        return { reload, snapshot }
      }), {
        layer: WorkflowRuntimeLive(workflowPath).pipe(
          Layer.provide(Layer.mergeAll(WorkflowLoaderLive, ConfigResolverLive)),
        ),
      })

      expect(result.reload.applied).toBe(false)
      expect(result.snapshot.config.polling.intervalMs).toBe(30000)
      expect(result.snapshot.lastReloadError).toContain('missing_codex_command')
    }
    finally {
      await root.cleanup()
    }
  })
})

function workflowSource(intervalMs: number): string {
  return `---
tracker:
  kind: linear
  api_key: test-token
  project_slug: symphony
polling:
  interval_ms: ${intervalMs}
workspace:
  root: .workspaces
codex:
  command: codex app-server
---
Prompt`
}
