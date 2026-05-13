import { describe, expect, it } from 'vitest'
import { renderGreeting } from './greeting.js'

describe('renderGreeting', () => {
  it('renders the current CLI greeting', () => {
    expect(renderGreeting('Symphony')).toBe('Hello, Symphony!')
  })
})
