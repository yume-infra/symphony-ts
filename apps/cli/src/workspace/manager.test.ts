import type { HookConfig, WorkspaceConfig } from '../domain/types.js'
import { join } from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { describe, expect, it } from '@effect/vitest'
import { Effect, FileSystem } from 'effect'
import { withFakeWorkspace } from '../../tests/support/fakes/workspace.js'
import {
  assertContained,
  createForIssue,
  isPathInside,
  removeForIssueBestEffort,
  runAfterRunBestEffort,
  runBeforeRun,
  runHook,
  sanitizeWorkspaceKey,
  WorkspaceManager,
  WorkspaceManagerLive,
  workspacePathFor,
} from './manager.js'

const noHooks: HookConfig = {
  afterCreate: null,
  beforeRun: null,
  afterRun: null,
  beforeRemove: null,
  timeoutMs: 60000,
}

describe('workspaceManager', () => {
  it('sanitizes workspace keys and computes deterministic contained paths', () => {
    expect(sanitizeWorkspaceKey('SYM-1')).toBe('SYM-1')
    expect(sanitizeWorkspaceKey('team/issue:1')).toBe('team_issue_1')
    expect(workspacePathFor('/tmp/symphony', 'team/issue:1')).toBe('/tmp/symphony/team_issue_1')
    expect(isPathInside('/tmp/symphony', '/tmp/symphony/SYM-1')).toBe(true)
    expect(isPathInside('/tmp/symphony', '/tmp/symphony-other/SYM-1')).toBe(false)
  })

  it.effect('fails containment checks for paths outside the workspace root', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(assertContained('/tmp/root', '/tmp/root2/SYM-1'))

      expect(error).toMatchObject({
        code: 'workspace_path_outside_root',
      })
    }))

  it.live('creates and reuses workspaces and gates after_create to new directories', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const config: WorkspaceConfig = { root: root.path }
        const hooks: HookConfig = {
          ...noHooks,
          afterCreate: 'printf after_create >> ../hook.log',
        }

        const first = yield* createForIssue('SYM-1', config, hooks)
        const second = yield* createForIssue('SYM-1', config, hooks)
        const hookLog = yield* fs.readFileString(join(root.path, 'hook.log'))

        expect(first).toMatchObject({
          workspaceKey: 'SYM-1',
          createdNow: true,
        })
        expect(second).toMatchObject({
          workspaceKey: 'SYM-1',
          createdNow: false,
        })
        expect(hookLog).toBe('after_create')
      })).pipe(Effect.provide(NodeServices.layer)))

  it.effect('fails safely when the workspace path exists as a non-directory', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        yield* fs.writeFileString(join(root.path, 'SYM-1'), 'not a directory')

        const error = yield* Effect.flip(createForIssue('SYM-1', { root: root.path }, noHooks))

        expect(error).toMatchObject({
          code: 'workspace_existing_non_directory',
        })
      })).pipe(Effect.provide(NodeServices.layer)))

  it.live('runs before_run as fatal and after_run as best effort', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const failures: Array<string> = []
        const workspace = yield* createForIssue('SYM-1', { root: root.path }, noHooks)
        const beforeError = yield* Effect.flip(runBeforeRun(workspace.path, {
          ...noHooks,
          beforeRun: 'exit 7',
        }))
        const afterResult = yield* runAfterRunBestEffort(workspace.path, {
          ...noHooks,
          afterRun: 'exit 7',
        }, failure => Effect.sync(() => {
          failures.push(`${failure.operation}:${failure.error.code}:${failure.error.hook}`)
        }))

        expect(beforeError).toMatchObject({
          code: 'hook_failed',
          hook: 'before_run',
        })
        expect(afterResult).toBeNull()
        expect(failures).toEqual(['after_run:hook_failed:after_run'])
      })).pipe(Effect.provide(NodeServices.layer)))

  it.live('times out hooks with a typed error', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(runHook('before_run', 'sleep 1', root.path, 10))

        expect(error).toMatchObject({
          code: 'hook_timeout',
          hook: 'before_run',
        })
      })).pipe(Effect.provide(NodeServices.layer)))

  it.live('captures hook stdout and stderr through the Effect process bridge', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const result = yield* runHook(
          'before_run',
          'printf stdout-message; printf stderr-message >&2',
          root.path,
          60000,
        )

        expect(result).toMatchObject({
          hook: 'before_run',
          exitCode: 0,
          timedOut: false,
          stdout: 'stdout-message',
          stderr: 'stderr-message',
        })
      })).pipe(Effect.provide(NodeServices.layer)))

  it.live('ignores before_remove hook failures and still removes the workspace', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const failures: Array<string> = []
        const config: WorkspaceConfig = { root: root.path }
        const workspacePath = join(root.path, 'SYM-1')
        yield* createForIssue('SYM-1', config, noHooks)
        yield* removeForIssueBestEffort('SYM-1', config, {
          ...noHooks,
          beforeRemove: 'exit 9',
        }, failure => Effect.sync(() => {
          failures.push(`${failure.operation}:${failure.error.code}:${failure.issueIdentifier}`)
        }))

        const exists = yield* fs.exists(workspacePath)
        expect(exists).toBe(false)
        expect(failures).toEqual(['before_remove:hook_failed:SYM-1'])
      })).pipe(Effect.provide(NodeServices.layer)))

  it.effect('exposes the same behavior through the service layer', () =>
    withFakeWorkspace(root =>
      Effect.gen(function* () {
        const workspace = yield* Effect.gen(function* () {
          const manager = yield* WorkspaceManager

          return yield* manager.createForIssue('SYM-1', { root: root.path }, noHooks)
        }).pipe(Effect.provide(WorkspaceManagerLive))

        expect(workspace.path).toBe(join(root.path, 'SYM-1'))
      })).pipe(Effect.provide(NodeServices.layer)))
})
