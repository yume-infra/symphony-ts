import type { Layer } from 'effect'
import { Cause, Effect, Exit } from 'effect'

export interface RunEffectOptions {
  readonly signal?: AbortSignal
}

export interface RunEffectLayerOptions<R, E> extends RunEffectOptions {
  readonly layer: Layer.Layer<R, E, never>
}

export class EffectTestError extends Error {
  readonly causeText: string
  readonly effectCause: Cause.Cause<unknown>

  constructor(effectCause: Cause.Cause<unknown>) {
    const causeText = Cause.pretty(effectCause)

    super(`Effect test failed\n\n${causeText}`)

    this.name = 'EffectTestError'
    this.causeText = causeText
    this.effectCause = effectCause
  }
}

export async function runEffect<A, E>(
  effect: Effect.Effect<A, E, never>,
  options?: RunEffectOptions,
): Promise<A>
export async function runEffect<A, E, R, E2>(
  effect: Effect.Effect<A, E, R>,
  options: RunEffectLayerOptions<R, E2>,
): Promise<A>
export async function runEffect<A, E, R, E2>(
  effect: Effect.Effect<A, E, R>,
  options?: RunEffectOptions | RunEffectLayerOptions<R, E2>,
): Promise<A> {
  const runnable: Effect.Effect<A, E | E2, never> = hasLayer(options)
    ? Effect.provide(effect, options.layer)
    : effect as Effect.Effect<A, E | E2, never>

  const exit = await Effect.runPromise(Effect.exit(runnable), {
    signal: options?.signal,
  })

  if (Exit.isSuccess(exit)) {
    return exit.value
  }

  throw new EffectTestError(exit.cause)
}

function hasLayer<R, E>(
  options: RunEffectOptions | RunEffectLayerOptions<R, E> | undefined,
): options is RunEffectLayerOptions<R, E> {
  return options !== undefined && 'layer' in options
}
