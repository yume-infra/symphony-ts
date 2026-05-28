import type { Issue } from '../domain/types.js'
import { Context, Effect, Layer, Schema } from 'effect'
import { PromptRenderError } from '../domain/errors.js'
import { DEFAULT_PROMPT } from '../domain/types.js'

export interface PromptInput {
  readonly issue: Issue
  readonly attempt: number | null
}

export interface PromptRendererShape {
  readonly render: (
    template: string,
    input: PromptInput,
  ) => Effect.Effect<string, PromptRenderError>
}

export class PromptRenderer extends Context.Service<PromptRenderer, PromptRendererShape>()(
  'symphony/PromptRenderer',
) {}

const encodeUnknownJsonString = Schema.encodeUnknownSync(Schema.UnknownFromJsonString)

export const renderPrompt = Effect.fn('renderPrompt')((
  template: string,
  input: PromptInput,
): Effect.Effect<string, PromptRenderError> =>
  Effect.try({
    try: () => renderTemplate(template.trim() === '' ? DEFAULT_PROMPT : template, {
      issue: issueTemplateValue(input.issue),
      attempt: input.attempt,
    }),
    catch: (cause) => {
      if (cause instanceof PromptRenderError) {
        return cause
      }

      return new PromptRenderError({
        code: 'template_render_error',
        reason: cause instanceof Error ? cause.message : String(cause),
      })
    },
  }))

export const PromptRendererLive = Layer.succeed(PromptRenderer)({
  render: Effect.fn('PromptRenderer.render')((template: string, input: PromptInput) => renderPrompt(template, input)),
})

function renderTemplate(template: string, variables: Record<string, unknown>): string {
  const expandedLoops = template.replace(
    /\{%\s*for\s+([A-Za-z_]\w*)\s+in\s+([A-Za-z_][\w.]*)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
    (_match, localName: string, collectionExpression: string, body: string) => {
      const collection = resolveExpression(collectionExpression, variables)

      if (!Array.isArray(collection)) {
        throw new PromptRenderError({
          code: 'template_render_error',
          reason: 'for-loop expression did not resolve to an array',
          expression: collectionExpression,
        })
      }

      return collection
        .map(item => renderTemplate(body, { ...variables, [localName]: item }))
        .join('')
    },
  )

  return expandedLoops.replace(/\{\{([^}]*)\}\}/g, (_match, rawExpression: string) => {
    const expression = rawExpression.trim()

    if (expression.includes('|')) {
      throw new PromptRenderError({
        code: 'template_parse_error',
        reason: 'filters are not supported unless explicitly implemented',
        expression,
      })
    }

    const value = resolveExpression(expression, variables)

    return stringifyValue(value)
  })
}

function resolveExpression(expression: string, variables: Record<string, unknown>): unknown {
  if (!/^[A-Z_][\w.]*$/i.test(expression)) {
    throw new PromptRenderError({
      code: 'template_parse_error',
      reason: 'invalid template expression',
      expression,
    })
  }

  const parts = expression.split('.')
  let current: unknown = variables

  for (const part of parts) {
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      const value = current[Number.parseInt(part, 10)]

      if (value === undefined) {
        throw unknownExpression(expression)
      }

      current = value
      continue
    }

    if (typeof current === 'object' && current !== null && part in current) {
      current = (current as Record<string, unknown>)[part]
      continue
    }

    throw unknownExpression(expression)
  }

  return current
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return encodeUnknownJsonString(value)
}

function unknownExpression(expression: string): PromptRenderError {
  return new PromptRenderError({
    code: 'template_render_error',
    reason: 'unknown template variable',
    expression,
  })
}

function issueTemplateValue(issue: Issue): Record<string, unknown> {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    state: issue.state,
    branch_name: issue.branchName,
    url: issue.url,
    labels: issue.labels,
    blocked_by: issue.blockedBy.map(blocker => ({
      id: blocker.id,
      identifier: blocker.identifier,
      state: blocker.state,
    })),
    created_at: issue.createdAt,
    updated_at: issue.updatedAt,
  }
}
