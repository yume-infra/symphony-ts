import { WorkflowParseError } from '../domain/errors.js'
import { isPlainRecord } from '../domain/types.js'

interface YamlLine {
  readonly number: number
  readonly raw: string
  readonly indent: number
  readonly text: string
}

interface ParseResult<T> {
  readonly value: T
  readonly next: number
}

export function parseYamlFrontMatter(source: string, path: string): Record<string, unknown> {
  const lines = source.split(/\r?\n/).map((raw, index): YamlLine => ({
    number: index + 1,
    raw,
    indent: raw.match(/^ */)?.[0].length ?? 0,
    text: raw.trim(),
  }))

  const firstMeaningful = lines.find(line => line.text !== '' && !line.text.startsWith('#'))

  if (firstMeaningful === undefined) {
    return {}
  }

  if (firstMeaningful.indent !== 0) {
    throw new WorkflowParseError({
      code: 'workflow_parse_error',
      path,
      reason: 'front matter must start at indentation 0',
      line: firstMeaningful.number,
    })
  }

  if (firstMeaningful.text.startsWith('- ')) {
    throw new WorkflowParseError({
      code: 'workflow_front_matter_not_a_map',
      path,
      reason: 'front matter must decode to a map',
      line: firstMeaningful.number,
    })
  }

  const parsed = parseMap(lines, lines.indexOf(firstMeaningful), 0, path)
  const trailing = nextMeaningful(lines, parsed.next)

  if (trailing !== undefined) {
    throw new WorkflowParseError({
      code: 'workflow_parse_error',
      path,
      reason: 'unexpected trailing front matter content',
      line: trailing.number,
    })
  }

  if (!isPlainRecord(parsed.value)) {
    throw new WorkflowParseError({
      code: 'workflow_front_matter_not_a_map',
      path,
      reason: 'front matter must decode to a map',
    })
  }

  return parsed.value
}

function parseMap(
  lines: ReadonlyArray<YamlLine>,
  start: number,
  indent: number,
  path: string,
): ParseResult<Record<string, unknown>> {
  const output: Record<string, unknown> = {}
  let index = start

  while (index < lines.length) {
    const line = lines[index]

    if (line === undefined || isIgnorable(line)) {
      index += 1
      continue
    }

    if (line.indent < indent) {
      break
    }

    if (line.indent > indent) {
      throw parseError(path, line, `unexpected indentation ${line.indent}; expected ${indent}`)
    }

    if (line.text.startsWith('- ')) {
      break
    }

    const separator = line.text.indexOf(':')

    if (separator <= 0) {
      throw parseError(path, line, 'expected key/value pair')
    }

    const key = line.text.slice(0, separator).trim()
    const rawValue = line.text.slice(separator + 1).trim()

    if (key === '') {
      throw parseError(path, line, 'empty keys are not supported')
    }

    if (rawValue === '') {
      const nested = nextMeaningful(lines, index + 1)

      if (nested === undefined || nested.indent <= indent) {
        output[key] = {}
        index += 1
      }
      else if (nested.text.startsWith('- ')) {
        const parsed = parseArray(lines, index + 1, nested.indent, path)
        output[key] = parsed.value
        index = parsed.next
      }
      else {
        const parsed = parseMap(lines, index + 1, nested.indent, path)
        output[key] = parsed.value
        index = parsed.next
      }

      continue
    }

    if (rawValue === '|' || rawValue === '>') {
      const parsed = parseBlockScalar(lines, index + 1, indent + 2, rawValue)
      output[key] = parsed.value
      index = parsed.next
      continue
    }

    output[key] = parseScalar(rawValue)
    index += 1
  }

  return { value: output, next: index }
}

function parseArray(
  lines: ReadonlyArray<YamlLine>,
  start: number,
  indent: number,
  path: string,
): ParseResult<ReadonlyArray<unknown>> {
  const output: Array<unknown> = []
  let index = start

  while (index < lines.length) {
    const line = lines[index]

    if (line === undefined || isIgnorable(line)) {
      index += 1
      continue
    }

    if (line.indent < indent) {
      break
    }

    if (line.indent > indent) {
      throw parseError(path, line, `unexpected indentation ${line.indent}; expected ${indent}`)
    }

    if (!line.text.startsWith('- ')) {
      break
    }

    const rawValue = line.text.slice(2).trim()

    if (rawValue === '') {
      const nested = nextMeaningful(lines, index + 1)

      if (nested === undefined || nested.indent <= indent) {
        output.push(null)
        index += 1
      }
      else if (nested.text.startsWith('- ')) {
        const parsed = parseArray(lines, index + 1, nested.indent, path)
        output.push(parsed.value)
        index = parsed.next
      }
      else {
        const parsed = parseMap(lines, index + 1, nested.indent, path)
        output.push(parsed.value)
        index = parsed.next
      }

      continue
    }

    if (rawValue.includes(':') && !rawValue.startsWith('"') && !rawValue.startsWith('\'')) {
      const separator = rawValue.indexOf(':')
      const key = rawValue.slice(0, separator).trim()
      const value = rawValue.slice(separator + 1).trim()
      output.push({ [key]: value === '' ? {} : parseScalar(value) })
      index += 1
      continue
    }

    output.push(parseScalar(rawValue))
    index += 1
  }

  return { value: output, next: index }
}

function parseBlockScalar(
  lines: ReadonlyArray<YamlLine>,
  start: number,
  indent: number,
  style: '|' | '>',
): ParseResult<string> {
  const output: Array<string> = []
  let index = start

  while (index < lines.length) {
    const line = lines[index]

    if (line === undefined) {
      break
    }

    if (line.text === '') {
      output.push('')
      index += 1
      continue
    }

    if (line.indent < indent) {
      break
    }

    output.push(line.raw.slice(Math.min(indent, line.raw.length)))
    index += 1
  }

  return {
    value: style === '>' ? output.join(' ').trimEnd() : output.join('\n').trimEnd(),
    next: index,
  }
}

function parseScalar(raw: string): unknown {
  const value = stripInlineComment(raw).trim()

  if (value === 'null' || value === '~') {
    return null
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  if (/^-?\d+$/.test(value)) {
    return Number.parseInt(value, 10)
  }

  if (/^-?\d+\.\d+$/.test(value)) {
    return Number.parseFloat(value)
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()

    if (inner === '') {
      return []
    }

    return splitInlineArray(inner).map(item => parseScalar(item))
  }

  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith('\'') && value.endsWith('\''))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function splitInlineArray(value: string): ReadonlyArray<string> {
  const output: Array<string> = []
  let current = ''
  let quote: '"' | '\'' | null = null

  for (const character of value) {
    if ((character === '"' || character === '\'') && quote === null) {
      quote = character
      current += character
      continue
    }

    if (character === quote) {
      quote = null
      current += character
      continue
    }

    if (character === ',' && quote === null) {
      output.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  output.push(current.trim())

  return output
}

function stripInlineComment(value: string): string {
  let quote: '"' | '\'' | null = null

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]

    if ((character === '"' || character === '\'') && quote === null) {
      quote = character
      continue
    }

    if (character === quote) {
      quote = null
      continue
    }

    if (character === '#' && quote === null && /\s/.test(value[index - 1] ?? ' ')) {
      return value.slice(0, index)
    }
  }

  return value
}

function nextMeaningful(lines: ReadonlyArray<YamlLine>, start: number): YamlLine | undefined {
  return lines.slice(start).find(line => !isIgnorable(line))
}

function isIgnorable(line: YamlLine): boolean {
  return line.text === '' || line.text.startsWith('#')
}

function parseError(path: string, line: YamlLine, reason: string): WorkflowParseError {
  return new WorkflowParseError({
    code: 'workflow_parse_error',
    path,
    reason,
    line: line.number,
  })
}
