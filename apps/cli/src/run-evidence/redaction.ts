const SECRET_KEY_PATTERN = /api[_-]?key|authorization|bearer|credential|password|secret|token/i
const SECRET_VALUE_PATTERNS: ReadonlyArray<RegExp> = [
  /Bearer\s+[\w.~+/=-]+/gi,
  /lin_api_[\w.-]+/gi,
  /sk-[\w.-]{12,}/gi,
]

export function redactUnknown(value: unknown): unknown {
  return redactUnknownAtDepth(value, 0)
}

export function redactText(value: string): string {
  return SECRET_VALUE_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, '[redacted]'),
    value,
  )
}

function redactUnknownAtDepth(value: unknown, depth: number): unknown {
  if (depth > 20) {
    return '[redacted:depth-limit]'
  }

  if (typeof value === 'string') {
    return redactText(value)
  }

  if (typeof value !== 'object' || value === null) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(item => redactUnknownAtDepth(item, depth + 1))
  }

  const output: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(value)) {
    output[key] = SECRET_KEY_PATTERN.test(key)
      ? '[redacted]'
      : redactUnknownAtDepth(entry, depth + 1)
  }

  return output
}
