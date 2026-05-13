import type { Issue } from '../domain/types.js'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { runEffect } from '../../tests/support/effect.js'
import { renderPrompt } from './render.js'

const sampleIssue: Issue = {
  id: 'issue-1',
  identifier: 'SYM-1',
  title: 'Implement runtime',
  description: 'Build the service',
  priority: 1,
  state: 'Todo',
  branchName: 'sayori/sym-1',
  url: 'https://linear.app/sym/issue/SYM-1',
  labels: ['backend', 'urgent'],
  blockedBy: [
    {
      id: 'issue-0',
      identifier: 'SYM-0',
      state: 'Done',
    },
  ],
  createdAt: '2026-05-14T00:00:00.000Z',
  updatedAt: '2026-05-14T00:05:00.000Z',
}

describe('renderPrompt', () => {
  it('renders strict issue and attempt variables', async () => {
    const rendered = await runEffect(renderPrompt(
      'Work on {{ issue.identifier }}: {{ issue.title }} attempt={{ attempt }}',
      { issue: sampleIssue, attempt: 2 },
    ))

    expect(rendered).toBe('Work on SYM-1: Implement runtime attempt=2')
  })

  it('preserves arrays for simple loops', async () => {
    const rendered = await runEffect(renderPrompt(
      'Labels:{% for label in issue.labels %} {{ label }}{% endfor %}',
      { issue: sampleIssue, attempt: null },
    ))

    expect(rendered).toBe('Labels: backend urgent')
  })

  it('uses the fallback prompt for an empty body', async () => {
    const rendered = await runEffect(renderPrompt('', { issue: sampleIssue, attempt: null }))

    expect(rendered).toBe('You are working on an issue from Linear.')
  })

  it('fails unknown variables', async () => {
    const error = await runEffect(Effect.flip(
      renderPrompt('Bad {{ issue.missing }}', { issue: sampleIssue, attempt: null }),
    ))

    expect(error).toMatchObject({
      reason: 'unknown template variable',
      expression: 'issue.missing',
    })
  })

  it('fails unsupported filters instead of silently rendering', async () => {
    const error = await runEffect(Effect.flip(
      renderPrompt('Bad {{ issue.title | upcase }}', { issue: sampleIssue, attempt: null }),
    ))

    expect(error).toMatchObject({
      code: 'template_parse_error',
      reason: 'filters are not supported unless explicitly implemented',
    })
  })
})
