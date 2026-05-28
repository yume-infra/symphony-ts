import type { WorkflowReloadResult } from './runtime.js'
import { join } from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { describe, expect, it } from '@effect/vitest'
import { Deferred, Effect, FileSystem, Layer } from 'effect'
import { withFakeWorkspace } from '../../tests/support/fakes/workspace.js'
import { ConfigResolverLive } from '../config/resolve.js'
import { WorkflowLoaderLive } from './loader.js'
import { WorkflowRuntime, WorkflowRuntimeLive } from './runtime.js'

const workflowRuntimeTestDependencies = Layer.mergeAll(
  WorkflowLoaderLive,
  ConfigResolverLive,
  NodeServices.layer,
)

function workflowRuntimeLayer(workflowPath: string) {
  return WorkflowRuntimeLive(workflowPath).pipe(
    Layer.provide(workflowRuntimeTestDependencies),
  )
}

describe('workflowRuntime', () => {
  it.effect('loads the initial workflow config and applies valid reloads', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const workflowPath = join(root.path, 'WORKFLOW.md')
        yield* fs.writeFileString(workflowPath, workflowSource(30000))

        const result = yield* Effect.gen(function* () {
          const runtime = yield* WorkflowRuntime
          const initial = yield* runtime.getConfig
          yield* fs.writeFileString(workflowPath, workflowSource(45000))
          const reload = yield* runtime.reload
          const updated = yield* runtime.getConfig

          return { initial, reload, updated }
        }).pipe(Effect.provide(workflowRuntimeLayer(workflowPath)))

        expect(result.initial.polling.intervalMs).toBe(30000)
        expect(result.reload.applied).toBe(true)
        expect(result.updated.polling.intervalMs).toBe(45000)
      })).pipe(Effect.provide(NodeServices.layer)))

  it.effect('keeps last known good config when reload validation fails', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const workflowPath = join(root.path, 'WORKFLOW.md')
        yield* fs.writeFileString(workflowPath, workflowSource(30000))

        const result = yield* Effect.gen(function* () {
          const runtime = yield* WorkflowRuntime
          yield* fs.writeFileString(workflowPath, `---
tracker:
  kind: linear
  api_key: test-token
  project_slug: symphony
polling:
  interval_ms: 1000
codex:
  command: ""
---
Prompt`)
          const reload = yield* runtime.reload
          const snapshot = yield* runtime.getSnapshot

          return { reload, snapshot }
        }).pipe(Effect.provide(workflowRuntimeLayer(workflowPath)))

        expect(result.reload.applied).toBe(false)
        expect(result.snapshot.config.polling.intervalMs).toBe(30000)
        expect(result.snapshot.lastReloadError).toContain('missing_codex_command')
      })).pipe(Effect.provide(NodeServices.layer)))

  it.live('watches workflow file changes through FileSystem.watch', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const workflowPath = join(root.path, 'WORKFLOW.md')
        yield* fs.writeFileString(workflowPath, workflowSource(30000))

        const reloadApplied = yield* Deferred.make<WorkflowReloadResult>()
        const result = yield* Effect.gen(function* () {
          const runtime = yield* WorkflowRuntime
          yield* runtime.watch(reload =>
            reload.applied
              ? Deferred.succeed(reloadApplied, reload)
              : Effect.void,
          ).pipe(Effect.forkScoped)
          yield* Effect.sleep('50 millis')
          yield* fs.writeFileString(workflowPath, workflowSource(45000))
          const reload = yield* Deferred.await(reloadApplied).pipe(
            Effect.timeout('2 seconds'),
          )
          const updated = yield* runtime.getConfig

          return { reload, updated }
        }).pipe(
          Effect.provide(
            WorkflowRuntimeLive(workflowPath).pipe(
              Layer.provide(workflowRuntimeTestDependencies),
            ),
          ),
        )

        expect(result.reload.config.polling.intervalMs).toBe(45000)
        expect(result.updated.polling.intervalMs).toBe(45000)
      }), 'symphony-watch-').pipe(Effect.provide(NodeServices.layer)))
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
