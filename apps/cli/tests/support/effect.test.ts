import { describe, expect, it } from '@effect/vitest'
import { Effect, Fiber } from 'effect'
import { TestClock } from 'effect/testing'

describe('@effect/vitest harness', () => {
  it.effect('supports native Effect tests with the test clock', () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        Effect.sleep('1 minute').pipe(Effect.as('done' as const)),
      )

      yield* TestClock.adjust('1 minute')

      const value = yield* Fiber.join(fiber)
      expect(value).toBe('done')
    }))
})
