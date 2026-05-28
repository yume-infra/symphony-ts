import type { WorkflowDefinition } from '../domain/types.js'
import { join } from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { describe, expect, it } from '@effect/vitest'
import { Effect, FileSystem } from 'effect'
import { withFakeWorkspace } from '../../tests/support/fakes/workspace.js'
import { resolveServiceConfig, validateDispatch } from './resolve.js'

describe('resolveServiceConfig', () => {
  it.effect('applies defaults and canonical LINEAR_API_KEY fallback', () =>
    Effect.gen(function* () {
      const config = yield* resolveServiceConfig(workflow({
        tracker: {
          kind: 'linear',
          project_slug: 'symphony',
        },
      }), {
        env: { LINEAR_API_KEY: 'linear-secret' },
        systemTempDirectory: '/tmp',
      })

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
    }))

  it.effect('resolves $VAR values only when configured and expands workspace paths', () =>
    Effect.gen(function* () {
      const config = yield* resolveServiceConfig(workflow({
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
      })

      expect(config.tracker.apiKey).toBe('custom-secret')
      expect(config.workspace.root).toBe('/Users/tester/workspaces')
    }))

  it.effect('resolves relative workspace roots relative to WORKFLOW.md directory', () =>
    Effect.gen(function* () {
      const config = yield* resolveServiceConfig(workflow({
        tracker: {
          kind: 'linear',
          project_slug: 'symphony',
        },
        workspace: {
          root: '.symphony/workspaces',
        },
      }), {
        env: { LINEAR_API_KEY: 'linear-secret' },
      })

      expect(config.workspace.root).toBe('/repo/.symphony/workspaces')
    }))

  it.effect('loads .env values through the Effect FileSystem service', () =>
    withFakeWorkspace(
      workspace =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem

          yield* fs.writeFileString(
            join(workspace.path, '.env'),
            'SYMPHONY_TS_DOTENV_TEST_TOKEN="dotenv-secret"\n',
          )

          const config = yield* resolveServiceConfig({
            ...workflow({
              tracker: {
                kind: 'linear',
                api_key: '$SYMPHONY_TS_DOTENV_TEST_TOKEN',
                project_slug: 'symphony',
              },
            }),
            directory: workspace.path,
            path: join(workspace.path, 'WORKFLOW.md'),
          })

          expect(config.tracker.apiKey).toBe('dotenv-secret')
        }),
      'symphony-config-',
    ).pipe(Effect.provide(NodeServices.layer)))

  it.effect('normalizes per-state concurrency and ignores invalid entries', () =>
    Effect.gen(function* () {
      const config = yield* resolveServiceConfig(workflow({
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
      })

      expect([...config.agent.maxConcurrentAgentsByState.entries()]).toEqual([
        ['todo', 2],
        ['in progress', 1],
      ])
    }))

  it.effect('fails invalid workflow config section shapes instead of silently defaulting', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(resolveServiceConfig(workflow({
        tracker: 'linear',
      })))

      expect(error).toMatchObject({
        code: 'invalid_config_value',
        field: 'workflow.config',
      })
      expect(error.reason).toContain('workflow config failed schema validation')
    }))

  it.effect('fails explicitly invalid positive integer config values', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(resolveServiceConfig(workflow({
        polling: {
          interval_ms: 0,
        },
      })))

      expect(error).toMatchObject({
        code: 'invalid_config_value',
        field: 'workflow.config',
      })
    }))

  it.effect('validates dispatch preconditions with typed errors', () =>
    Effect.gen(function* () {
      const missingProjectSlug = yield* resolveServiceConfig(workflow({
        tracker: {
          kind: 'linear',
        },
      }), {
        env: { LINEAR_API_KEY: 'linear-secret' },
      })

      const error = yield* Effect.flip(validateDispatch(missingProjectSlug))

      expect(error).toMatchObject({
        code: 'missing_tracker_project_slug',
        field: 'tracker.project_slug',
      })
    }))
})

function workflow(config: Record<string, unknown>): WorkflowDefinition {
  return {
    path: '/repo/WORKFLOW.md',
    directory: '/repo',
    config,
    promptTemplate: 'Prompt',
  }
}
