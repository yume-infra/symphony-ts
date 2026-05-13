import { Context, Data, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import { EffectTestError, runEffect } from './effect.js'

class TestService extends Context.Tag('TestService')<
  TestService,
  { readonly value: string }
>() {}

class ExpectedTestFailure extends Data.TaggedError('ExpectedTestFailure')<{
  readonly message: string
}> {}

describe('runEffect', () => {
  it('runs a successful Effect and returns the value', async () => {
    await expect(runEffect(Effect.succeed(42))).resolves.toBe(42)
  })

  it('provides an explicit test layer', async () => {
    const program = Effect.gen(function* () {
      const service = yield* TestService

      return service.value
    })

    await expect(
      runEffect(program, {
        layer: Layer.succeed(TestService, { value: 'provided' }),
      }),
    ).resolves.toBe('provided')
  })

  it('throws readable Effect cause details on failure', async () => {
    expect.assertions(3)

    try {
      await runEffect(Effect.fail(new ExpectedTestFailure({
        message: 'expected test failure',
      })))
    }
    catch (error) {
      expect(error).toBeInstanceOf(EffectTestError)
      expect(error).toHaveProperty('causeText')
      expect(error).toMatchObject({
        message: expect.stringContaining('expected test failure'),
      })
    }
  })
})
