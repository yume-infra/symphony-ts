import { join } from 'node:path'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { describe, expect, it } from '@effect/vitest'
import { Effect, FileSystem, Layer } from 'effect'
import { withFakeWorkspace } from '../../tests/support/fakes/workspace.js'
import { parseWorkflowSource, selectWorkflowPath, WorkflowLoader, WorkflowLoaderLive } from './loader.js'

const workflowLoaderTestLayer = Layer.merge(WorkflowLoaderLive, NodeServices.layer)

describe('workflowLoader', () => {
  it('selects an explicit workflow path or cwd WORKFLOW.md default', () => {
    expect(selectWorkflowPath('workflow/custom.md', '/repo')).toBe('/repo/workflow/custom.md')
    expect(selectWorkflowPath(undefined, '/repo')).toBe('/repo/WORKFLOW.md')
  })

  it.effect('parses Markdown with no front matter as an empty-config workflow', () =>
    Effect.gen(function* () {
      const workflow = yield* parseWorkflowSource('Do {{ issue.identifier }}', '/repo/WORKFLOW.md')

      expect(workflow).toMatchObject({
        path: '/repo/WORKFLOW.md',
        directory: '/repo',
        config: {},
        promptTemplate: 'Do {{ issue.identifier }}',
      })
    }))

  it.effect('parses YAML front matter maps, arrays, and block scalars', () =>
    Effect.gen(function* () {
      const workflow = yield* parseWorkflowSource(`---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: sym
  active_states:
    - Todo
    - In Progress
hooks:
  before_run: |
    echo preparing
    echo done
agent:
  max_concurrent_agents_by_state:
    Todo: 2
    In Progress: 1
---
# Prompt

Handle {{ issue.identifier }}
`, '/repo/WORKFLOW.md')

      expect(workflow.config).toMatchObject({
        tracker: {
          kind: 'linear',
          api_key: '$LINEAR_API_KEY',
          project_slug: 'sym',
          active_states: ['Todo', 'In Progress'],
        },
        hooks: {
          before_run: 'echo preparing\necho done\n',
        },
        agent: {
          max_concurrent_agents_by_state: {
            'Todo': 2,
            'In Progress': 1,
          },
        },
      })
      expect(workflow.promptTemplate).toBe('# Prompt\n\nHandle {{ issue.identifier }}')
    }))

  it.effect('fails non-map front matter with a typed parse error', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseWorkflowSource(`---
- nope
---
Prompt`, '/repo/WORKFLOW.md'))

      expect(error).toMatchObject({
        code: 'workflow_front_matter_not_a_map',
        reason: 'front matter must decode to a map',
      })
    }))

  it.effect('fails invalid YAML front matter with parser diagnostics', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseWorkflowSource(`---
tracker: first
tracker: second
---
Prompt`, '/repo/WORKFLOW.md'))

      expect(error).toMatchObject({
        code: 'workflow_parse_error',
        reason: 'Map keys must be unique',
        line: 2,
      })
    }))

  it.effect('loads a workflow file through the service layer', () =>
    withFakeWorkspace(workspace =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const workflowDirectory = join(workspace.path, 'docs')
        const workflowPath = join(workflowDirectory, 'WORKFLOW.md')

        yield* fs.makeDirectory(workflowDirectory)
        yield* fs.writeFileString(workflowPath, 'Prompt')

        const loader = yield* WorkflowLoader

        const loaded = yield* loader.load(workflowPath)

        expect(loaded.promptTemplate).toBe('Prompt')
      })).pipe(Effect.provide(workflowLoaderTestLayer)))
})
