import type { WorkflowDefinition } from '../domain/types.js'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { runEffect } from '../../tests/support/effect.js'
import { resolveServiceConfig, validateDispatch } from './resolve.js'

describe('resolveServiceConfig', () => {
  it('applies defaults and canonical LINEAR_API_KEY fallback', async () => {
    const config = await runEffect(resolveServiceConfig(workflow({
      tracker: {
        kind: 'linear',
        project_slug: 'symphony',
      },
    }), {
      env: { LINEAR_API_KEY: 'linear-secret' },
      systemTempDirectory: '/tmp',
    }))

    expect(config.tracker).toMatchObject({
      kind: 'linear',
      endpoint: 'https://api.linear.app/graphql',
      apiKey: 'linear-secret',
      projectSlug: 'symphony',
      activeStates: ['Todo', 'In Progress'],
      terminalStates: ['Closed', 'Cancelled', 'Canceled', 'Duplicate', 'Done'],
    })
    expect(config.polling.intervalMs).toBe(30000)
    expect(config.workspace.root).toBe('/tmp/symphony_workspaces')
    expect(config.codex.command).toBe('codex app-server')
  })

  it('resolves $VAR values only when configured and expands workspace paths', async () => {
    const config = await runEffect(resolveServiceConfig(workflow({
      tracker: {
        kind: 'linear',
        api_key: '$CUSTOM_LINEAR_TOKEN',
        project_slug: 'symphony',
      },
      workspace: {
        root: '$WORKSPACE_ROOT',
      },
    }), {
      env: {
        CUSTOM_LINEAR_TOKEN: 'custom-secret',
        WORKSPACE_ROOT: '~/workspaces',
      },
      homeDirectory: '/Users/tester',
    }))

    expect(config.tracker.apiKey).toBe('custom-secret')
    expect(config.workspace.root).toBe('/Users/tester/workspaces')
  })

  it('resolves relative workspace roots relative to WORKFLOW.md directory', async () => {
    const config = await runEffect(resolveServiceConfig(workflow({
      tracker: {
        kind: 'linear',
        project_slug: 'symphony',
      },
      workspace: {
        root: '.symphony/workspaces',
      },
    }), {
      env: { LINEAR_API_KEY: 'linear-secret' },
    }))

    expect(config.workspace.root).toBe('/repo/.symphony/workspaces')
  })

  it('normalizes per-state concurrency and ignores invalid entries', async () => {
    const config = await runEffect(resolveServiceConfig(workflow({
      tracker: {
        kind: 'linear',
        project_slug: 'symphony',
      },
      agent: {
        max_concurrent_agents_by_state: {
          'Todo': 2,
          'In Progress': 1,
          'Done': 0,
          'Broken': 'many',
        },
      },
    }), {
      env: { LINEAR_API_KEY: 'linear-secret' },
    }))

    expect([...config.agent.maxConcurrentAgentsByState.entries()]).toEqual([
      ['todo', 2],
      ['in progress', 1],
    ])
  })

  it('validates dispatch preconditions with typed errors', async () => {
    const missingProjectSlug = await runEffect(resolveServiceConfig(workflow({
      tracker: {
        kind: 'linear',
      },
    }), {
      env: { LINEAR_API_KEY: 'linear-secret' },
    }))

    const error = await runEffect(Effect.flip(validateDispatch(missingProjectSlug)))

    expect(error).toMatchObject({
      code: 'missing_tracker_project_slug',
      field: 'tracker.project_slug',
    })
  })
})

function workflow(config: Record<string, unknown>): WorkflowDefinition {
  return {
    path: '/repo/WORKFLOW.md',
    directory: '/repo',
    config,
    promptTemplate: 'Prompt',
  }
}
