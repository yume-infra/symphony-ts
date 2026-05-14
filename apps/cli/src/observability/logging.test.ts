import { describe, expect, it } from 'vitest'
import { formatStructuredLog } from './logging.js'

describe('formatStructuredLog', () => {
  it('formats stable key=value logs and redacts secrets', () => {
    expect(formatStructuredLog('info', 'dispatch_started', {
      issue_id: 'issue-1',
      issue_identifier: 'SYM-1',
      session_id: 'thread-1-turn-1',
      api_key: 'secret',
      codex_total_tokens: 12,
    })).toBe(
      'level=info message=dispatch_started issue_id=issue-1 issue_identifier=SYM-1 session_id=thread-1-turn-1 api_key=[redacted] codex_total_tokens=12',
    )
  })
})
