import type { ServiceConfig } from '../domain/types.js'
import type { LinearTransport } from '../tracker/linear.js'
import { Effect } from 'effect'
import { isPlainRecord } from '../domain/types.js'
import { executeLinearGraphQL } from '../tracker/linear.js'

interface LinearGraphQLToolSuccess {
  readonly success: true
  readonly body: unknown
}

interface LinearGraphQLToolFailure {
  readonly success: false
  readonly error: {
    readonly code: string
    readonly message: string
  }
  readonly body?: unknown
}

export type LinearGraphQLToolResult = LinearGraphQLToolSuccess | LinearGraphQLToolFailure

interface LinearGraphQLToolInput {
  readonly query: string
  readonly variables?: Record<string, unknown>
}

export function executeLinearGraphQLTool(
  config: ServiceConfig,
  input: unknown,
): Effect.Effect<LinearGraphQLToolResult, never, LinearTransport> {
  const parsed = parseLinearGraphQLToolInput(input)

  if (parsed.success === false) {
    return Effect.succeed(parsed)
  }

  if (config.tracker.kind !== 'linear' || config.tracker.apiKey === null || config.tracker.apiKey === '') {
    return Effect.succeed({
      success: false,
      error: {
        code: 'missing_auth',
        message: 'linear_graphql requires Linear tracker auth',
      },
    })
  }

  return executeLinearGraphQL(
    config,
    'linear_graphql_tool',
    parsed.value.query,
    parsed.value.variables ?? {},
  ).pipe(
    Effect.map((response): LinearGraphQLToolResult => {
      if (response.status !== 200) {
        return {
          success: false,
          error: {
            code: 'http_status',
            message: `Linear GraphQL returned HTTP ${response.status}`,
          },
          body: response.body,
        }
      }

      if (isPlainRecord(response.body) && Array.isArray(response.body.errors) && response.body.errors.length > 0) {
        return {
          success: false,
          error: {
            code: 'graphql_errors',
            message: 'Linear GraphQL returned top-level errors',
          },
          body: response.body,
        }
      }

      return {
        success: true,
        body: response.body,
      }
    }),
    Effect.catch(error => Effect.succeed<LinearGraphQLToolResult>({
      success: false as const,
      error: {
        code: error.code,
        message: error.reason,
      },
    })),
  )
}

function parseLinearGraphQLToolInput(input: unknown): {
  readonly success: true
  readonly value: LinearGraphQLToolInput
} | LinearGraphQLToolFailure {
  const query = typeof input === 'string'
    ? input
    : isPlainRecord(input) && typeof input.query === 'string'
      ? input.query
      : null

  if (query === null || query.trim() === '') {
    return invalidInput('empty_query', 'linear_graphql query must be a non-empty string')
  }

  if (countGraphQLOperations(query) !== 1) {
    return invalidInput('invalid_operation_count', 'linear_graphql accepts exactly one GraphQL operation')
  }

  const variables = isPlainRecord(input) && 'variables' in input
    ? input.variables
    : undefined

  if (variables !== undefined && !isPlainRecord(variables)) {
    return invalidInput('invalid_variables', 'linear_graphql variables must be an object when provided')
  }

  return {
    success: true,
    value: {
      query,
      variables: variables as Record<string, unknown> | undefined,
    },
  }
}

function invalidInput(code: string, message: string): LinearGraphQLToolFailure {
  return {
    success: false,
    error: {
      code,
      message,
    },
  }
}

function countGraphQLOperations(query: string): number {
  const withoutComments = query.replace(/#.*/g, '').trim()

  if (withoutComments.startsWith('{')) {
    return 1
  }

  return withoutComments.match(/\b(query|mutation|subscription)\b/g)?.length ?? 0
}
