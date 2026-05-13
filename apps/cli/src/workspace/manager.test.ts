import type { HookConfig, WorkspaceConfig } from '../domain/types.js'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { runEffect } from '../../tests/support/effect.js'
import { createFakeWorkspace } from '../../tests/support/fakes/workspace.js'
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

  it('fails containment checks for paths outside the workspace root', async () => {
    const error = await runEffect(Effect.flip(assertContained('/tmp/root', '/tmp/root2/SYM-1')))

    expect(error).toMatchObject({
      code: 'workspace_path_outside_root',
    })
  })

  it('creates and reuses workspaces and gates after_create to new directories', async () => {
    const root = await createFakeWorkspace()

    try {
      const config: WorkspaceConfig = { root: root.path }
      const hooks: HookConfig = {
        ...noHooks,
        afterCreate: 'printf after_create >> ../hook.log',
      }

      const first = await runEffect(createForIssue('SYM-1', config, hooks))
      const second = await runEffect(createForIssue('SYM-1', config, hooks))
      const hookLog = await readFile(join(root.path, 'hook.log'), 'utf8')

      expect(first).toMatchObject({
        workspaceKey: 'SYM-1',
        createdNow: true,
      })
      expect(second).toMatchObject({
        workspaceKey: 'SYM-1',
        createdNow: false,
      })
      expect(hookLog).toBe('after_create')
    }
    finally {
      await root.cleanup()
    }
  })

  it('fails safely when the workspace path exists as a non-directory', async () => {
    const root = await createFakeWorkspace()

    try {
      await writeFile(join(root.path, 'SYM-1'), 'not a directory')

      const error = await runEffect(Effect.flip(createForIssue('SYM-1', { root: root.path }, noHooks)))

      expect(error).toMatchObject({
        code: 'workspace_existing_non_directory',
      })
    }
    finally {
      await root.cleanup()
    }
  })

  it('runs before_run as fatal and after_run as best effort', async () => {
    const root = await createFakeWorkspace()

    try {
      const workspace = await runEffect(createForIssue('SYM-1', { root: root.path }, noHooks))
      const beforeError = await runEffect(Effect.flip(runBeforeRun(workspace.path, {
        ...noHooks,
        beforeRun: 'exit 7',
      })))
      const afterResult = await runEffect(runAfterRunBestEffort(workspace.path, {
        ...noHooks,
        afterRun: 'exit 7',
      }))

      expect(beforeError).toMatchObject({
        code: 'hook_failed',
        hook: 'before_run',
      })
      expect(afterResult).toBeNull()
    }
    finally {
      await root.cleanup()
    }
  })

  it('times out hooks with a typed error', async () => {
    const root = await createFakeWorkspace()

    try {
      const error = await runEffect(Effect.flip(runHook('before_run', 'sleep 1', root.path, 10)))

      expect(error).toMatchObject({
        code: 'hook_timeout',
        hook: 'before_run',
      })
    }
    finally {
      await root.cleanup()
    }
  })

  it('ignores before_remove hook failures and still removes the workspace', async () => {
    const root = await createFakeWorkspace()

    try {
      const config: WorkspaceConfig = { root: root.path }
      await runEffect(createForIssue('SYM-1', config, noHooks))
      await runEffect(removeForIssueBestEffort('SYM-1', config, {
        ...noHooks,
        beforeRemove: 'exit 9',
      }))

      await expect(readFile(join(root.path, 'SYM-1'), 'utf8')).rejects.toThrow()
    }
    finally {
      await root.cleanup()
    }
  })

  it('exposes the same behavior through the service layer', async () => {
    const root = await createFakeWorkspace()

    try {
      const workspace = await runEffect(
        Effect.gen(function* () {
          const manager = yield* WorkspaceManager

          return yield* manager.createForIssue('SYM-1', { root: root.path }, noHooks)
        }),
        { layer: WorkspaceManagerLive },
      )

      expect(workspace.path).toBe(join(root.path, 'SYM-1'))
    }
    finally {
      await root.cleanup()
    }
  })
})
