import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { runEffect } from '../../tests/support/effect.js'
import { createFakeWorkspace } from '../../tests/support/fakes/workspace.js'
import { parseWorkflowSource, selectWorkflowPath, WorkflowLoader, WorkflowLoaderLive } from './loader.js'

describe('workflowLoader', () => {
  it('selects an explicit workflow path or cwd WORKFLOW.md default', () => {
    expect(selectWorkflowPath('workflow/custom.md', '/repo')).toBe('/repo/workflow/custom.md')
    expect(selectWorkflowPath(undefined, '/repo')).toBe('/repo/WORKFLOW.md')
  })

  it('parses Markdown with no front matter as an empty-config workflow', async () => {
    const workflow = await runEffect(parseWorkflowSource('Do {{ issue.identifier }}', '/repo/WORKFLOW.md'))

    expect(workflow).toMatchObject({
      path: '/repo/WORKFLOW.md',
      directory: '/repo',
      config: {},
      promptTemplate: 'Do {{ issue.identifier }}',
    })
  })

  it('parses YAML front matter maps, arrays, and block scalars', async () => {
    const workflow = await runEffect(parseWorkflowSource(`---
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
`, '/repo/WORKFLOW.md'))

    expect(workflow.config).toMatchObject({
      tracker: {
        kind: 'linear',
        api_key: '$LINEAR_API_KEY',
        project_slug: 'sym',
        active_states: ['Todo', 'In Progress'],
      },
      hooks: {
        before_run: 'echo preparing\necho done',
      },
      agent: {
        max_concurrent_agents_by_state: {
          'Todo': 2,
          'In Progress': 1,
        },
      },
    })
    expect(workflow.promptTemplate).toBe('# Prompt\n\nHandle {{ issue.identifier }}')
  })

  it('fails non-map front matter with a typed parse error', async () => {
    const error = await runEffect(Effect.flip(parseWorkflowSource(`---
- nope
---
Prompt`, '/repo/WORKFLOW.md')))

    expect(error).toMatchObject({
      code: 'workflow_front_matter_not_a_map',
      reason: 'front matter must decode to a map',
    })
  })

  it('loads a workflow file through the service layer', async () => {
    const workspace = await createFakeWorkspace()

    try {
      await mkdir(join(workspace.path, 'docs'))
      await writeFile(join(workspace.path, 'docs', 'WORKFLOW.md'), 'Prompt')

      const loaded = await runEffect(
        Effect.gen(function* () {
          const loader = yield* WorkflowLoader

          return yield* loader.load(join(workspace.path, 'docs', 'WORKFLOW.md'))
        }),
        { layer: WorkflowLoaderLive },
      )

      expect(loaded.promptTemplate).toBe('Prompt')
    }
    finally {
      await workspace.cleanup()
    }
  })
})
