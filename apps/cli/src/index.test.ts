import { describe, expect, it } from 'vitest'
import { command } from './cli/command.js'

describe('symphony-ts command', () => {
  it('preserves the minimal CLI command name', () => {
    expect(command.name).toBe('symphony-ts')
  })
})
