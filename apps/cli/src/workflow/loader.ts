import type { WorkflowDefinition } from '../domain/types.js'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { Context, Effect, Layer } from 'effect'
import { WorkflowLoadError, WorkflowParseError } from '../domain/errors.js'
import { parseYamlFrontMatter } from './yaml.js'

export interface WorkflowLoaderShape {
  readonly selectPath: (workflowPath: string | undefined, cwd?: string) => string
  readonly parse: (
    source: string,
    path: string,
  ) => Effect.Effect<WorkflowDefinition, WorkflowParseError>
  readonly load: (
    workflowPath: string | undefined,
  ) => Effect.Effect<WorkflowDefinition, WorkflowLoadError | WorkflowParseError>
}

export class WorkflowLoader extends Context.Service<WorkflowLoader, WorkflowLoaderShape>()(
  'symphony/WorkflowLoader',
) {}

export const WorkflowLoaderLive = Layer.succeed(WorkflowLoader)({
  selectPath: selectWorkflowPath,
  parse: parseWorkflowSource,
  load: workflowPath =>
    Effect.gen(function* () {
      const path = selectWorkflowPath(workflowPath)
      const source = yield* readWorkflowFile(path)

      return yield* parseWorkflowSource(source, path)
    }),
})

export function selectWorkflowPath(workflowPath: string | undefined, cwd = process.cwd()): string {
  return resolve(cwd, workflowPath ?? 'WORKFLOW.md')
}

export function parseWorkflowSource(
  source: string,
  path: string,
): Effect.Effect<WorkflowDefinition, WorkflowParseError> {
  return Effect.try({
    try: () => {
      const normalized = source.replace(/\r\n/g, '\n')

      if (!normalized.startsWith('---\n') && normalized.trim() !== '---') {
        return makeWorkflowDefinition(path, {}, normalized)
      }

      const lines = normalized.split('\n')
      const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')

      if (endIndex < 0) {
        throw new WorkflowParseError({
          code: 'workflow_parse_error',
          path,
          reason: 'front matter opening marker has no closing marker',
        })
      }

      const frontMatter = lines.slice(1, endIndex).join('\n')
      const body = lines.slice(endIndex + 1).join('\n')
      const config = parseYamlFrontMatter(frontMatter, path)

      return makeWorkflowDefinition(path, config, body)
    },
    catch: (cause) => {
      if (cause instanceof WorkflowParseError) {
        return cause
      }

      return new WorkflowParseError({
        code: 'workflow_parse_error',
        path,
        reason: cause instanceof Error ? cause.message : String(cause),
        cause,
      })
    },
  })
}

function makeWorkflowDefinition(
  path: string,
  config: Record<string, unknown>,
  body: string,
): WorkflowDefinition {
  return {
    path,
    directory: dirname(path),
    config,
    promptTemplate: body.trim(),
  }
}

function readWorkflowFile(path: string): Effect.Effect<string, WorkflowLoadError> {
  return Effect.tryPromise({
    try: async () => {
      const { readFile } = await import('node:fs/promises')

      return readFile(path, 'utf8')
    },
    catch: cause => new WorkflowLoadError({
      code: isMissingFileError(cause) ? 'missing_workflow_file' : 'workflow_read_error',
      path,
      reason: isMissingFileError(cause) ? 'workflow file does not exist' : 'workflow file could not be read',
      cause,
    }),
  })
}

function isMissingFileError(cause: unknown): boolean {
  return typeof cause === 'object'
    && cause !== null
    && 'code' in cause
    && cause.code === 'ENOENT'
}
