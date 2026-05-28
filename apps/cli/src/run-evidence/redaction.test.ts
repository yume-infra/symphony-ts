import { describe, expect, it } from '@effect/vitest'
import { redactText, redactUnknown } from './redaction.js'

describe('run evidence redaction', () => {
  it('redacts secret-looking object keys recursively', () => {
    expect(redactUnknown({
      ok: 'visible',
      nested: {
        apiKey: 'lin_api_secret',
        authorization: 'Bearer secret-token',
      },
      items: [
        { token: 'sk-secret-secret-secret' },
      ],
    })).toEqual({
      ok: 'visible',
      nested: {
        apiKey: '[redacted]',
        authorization: '[redacted]',
      },
      items: [
        { token: '[redacted]' },
      ],
    })
  })

  it('redacts known secret value patterns inside free text', () => {
    expect(redactText('using Bearer abc.def and lin_api_12345 in logs')).toBe('using [redacted] and [redacted] in logs')
  })
})
