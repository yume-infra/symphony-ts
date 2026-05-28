import { parseDocument, YAMLError } from 'yaml'
import { WorkflowParseError } from '../domain/errors.js'
import { isPlainRecord } from '../domain/types.js'

export function parseYamlFrontMatter(source: string, path: string): Record<string, unknown> {
  const document = parseDocument(source, {
    logLevel: 'silent',
    prettyErrors: false,
    schema: 'core',
    stringKeys: true,
    uniqueKeys: true,
  })

  const error = document.errors[0]

  if (error !== undefined) {
    throw yamlParseError(path, source, error)
  }

  const value = toPlainYamlValue(document, path, source)

  if (value === null) {
    return {}
  }

  if (!isPlainRecord(value)) {
    throw new WorkflowParseError({
      code: 'workflow_front_matter_not_a_map',
      path,
      reason: 'front matter must decode to a map',
    })
  }

  return value
}

function toPlainYamlValue(document: ReturnType<typeof parseDocument>, path: string, source: string): unknown {
  try {
    return document.toJS({ maxAliasCount: 0 }) as unknown
  }
  catch (cause) {
    throw new WorkflowParseError({
      code: 'workflow_parse_error',
      path,
      reason: cause instanceof Error ? cause.message : String(cause),
      line: yamlErrorLine(source, cause),
      cause,
    })
  }
}

function yamlParseError(path: string, source: string, cause: YAMLError): WorkflowParseError {
  return new WorkflowParseError({
    code: 'workflow_parse_error',
    path,
    reason: cause.message,
    line: yamlErrorLine(source, cause),
    cause,
  })
}

function yamlErrorLine(source: string, cause: unknown): number | undefined {
  if (!(cause instanceof YAMLError)) {
    return undefined
  }

  const linePosition = cause.linePos?.[0]?.line

  if (linePosition !== undefined) {
    return linePosition
  }

  const offset = cause.pos[0]

  return offset < 0 ? undefined : source.slice(0, offset).split('\n').length
}
