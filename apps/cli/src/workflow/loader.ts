import type { PlatformError } from 'effect'
import type { WorkflowDefinition } from '../domain/types.js'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import * as NodeServices from '@effect/platform-node/NodeServices'
import { Context, Effect, FileSystem, Layer } from 'effect'
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

export function selectWorkflowPath(workflowPath: string | undefined, cwd = process.cwd()): string {
  return resolve(cwd, workflowPath ?? 'WORKFLOW.md')
}

export const parseWorkflowSource = Effect.fn('parseWorkflowSource')((
  source: string,
  path: string,
): Effect.Effect<WorkflowDefinition, WorkflowParseError> =>
  Effect.try({
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
  }))

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

const readWorkflowFileWithFileSystem = Effect.fn('readWorkflowFile.fileSystem')(function* (
  path: string,
): Effect.fn.Return<string, WorkflowLoadError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem

  return yield* fs.readFileString(path).pipe(
    Effect.mapError(cause => workflowFileSystemError(cause, path)),
  )
})

const readWorkflowFile = Effect.fn('readWorkflowFile')((path: string): Effect.Effect<string, WorkflowLoadError> =>
  readWorkflowFileWithFileSystem(path).pipe(
    Effect.provide(NodeServices.layer),
  ))

export const WorkflowLoaderLive = Layer.succeed(WorkflowLoader)({
  selectPath: selectWorkflowPath,
  parse: Effect.fn('WorkflowLoader.parse')((source: string, path: string) => parseWorkflowSource(source, path)),
  load: Effect.fn('WorkflowLoader.load')(function* (workflowPath: string | undefined) {
    const path = selectWorkflowPath(workflowPath)
    const source = yield* readWorkflowFile(path)

    return yield* parseWorkflowSource(source, path)
  }),
})

function workflowFileSystemError(cause: PlatformError.PlatformError, path: string): WorkflowLoadError {
  const missing = cause.reason._tag === 'NotFound'

  return new WorkflowLoadError({
    code: missing ? 'missing_workflow_file' : 'workflow_read_error',
    path,
    reason: missing ? 'workflow file does not exist' : 'workflow file could not be read',
    cause,
  })
}
