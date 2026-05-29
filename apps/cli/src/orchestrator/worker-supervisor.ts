import type * as Exit from 'effect/Exit'
import type { Fiber as RuntimeFiber } from 'effect/Fiber'
import type * as Scope from 'effect/Scope'
import type { AttemptOwner, WorkerInterruptionIntent } from './attempt-owner.js'
import { Context, Effect, Fiber, FiberMap, Layer, Ref } from 'effect'
import { workerOwnersMatch as ownersMatch, ownerKey as resolveOwnerKey } from './attempt-owner.js'

export interface WorkerExitObserved<A = unknown, E = unknown> {
  readonly owner: AttemptOwner
  readonly exit: Exit.Exit<A, E>
  readonly interruptionIntent: WorkerInterruptionIntent | null
}

interface StartWorkerInput<A = unknown, E = unknown, R = never, R2 = never> {
  readonly owner: AttemptOwner
  readonly worker: Effect.Effect<A, E, R>
  readonly onExit: (observed: WorkerExitObserved<A, E>) => Effect.Effect<void, unknown, R2>
}

export interface WorkerSupervisorShape {
  readonly start: <A, E, R, R2>(
    input: StartWorkerInput<A, E, R, R2>,
  ) => Effect.Effect<AttemptOwner, never, R | R2>
  readonly interrupt: (owner: AttemptOwner, intent: WorkerInterruptionIntent) => Effect.Effect<void, never>
  readonly shutdownAll: Effect.Effect<void, never>
}

export class WorkerSupervisor extends Context.Service<WorkerSupervisor, WorkerSupervisorShape>()(
  'symphony/WorkerSupervisor',
) {}

interface TrackedWorker {
  readonly owner: AttemptOwner
  readonly fiber: RuntimeFiber<unknown, unknown>
  readonly interruptionIntent: WorkerInterruptionIntent | null
}

const ownerKeyByInput = (input: AttemptOwner): string => resolveOwnerKey(input)

function removeTracked(workers: Ref.Ref<Map<string, TrackedWorker>>, key: string, expectedFiber: RuntimeFiber<unknown, unknown>): Effect.Effect<TrackedWorker | null> {
  return Ref.modify(workers, (state) => {
    const current = state.get(key)

    if (current === undefined || current.fiber !== expectedFiber) {
      return [null, state]
    }

    const next = new Map(state)

    next.delete(key)

    return [current, next]
  })
}

function makeWorkerSupervisor(workerFibers: FiberMap.FiberMap<string, unknown, unknown>, trackedWorkers: Ref.Ref<Map<string, TrackedWorker>>, supervisorScope: Scope.Scope): WorkerSupervisorShape {
  return {
    start: <A, E, R, R2>(input: StartWorkerInput<A, E, R, R2>) => Effect.gen(function* () {
      const key = ownerKeyByInput(input.owner)
      const workerFiber = yield* input.worker.pipe(
        Effect.forkIn(supervisorScope, { startImmediately: true }),
      )
      yield* FiberMap.set(workerFibers, key, workerFiber)

      yield* Ref.update(
        trackedWorkers,
        state => new Map(state).set(key, {
          owner: input.owner,
          fiber: workerFiber,
          interruptionIntent: null,
        }),
      )

      yield* Effect.forkIn(Effect.gen(function* () {
        const exit = yield* Fiber.await(workerFiber)
        const tracked = yield* removeTracked(trackedWorkers, key, workerFiber)
        const observed: WorkerExitObserved<A, E> = {
          owner: tracked?.owner ?? input.owner,
          exit,
          interruptionIntent: tracked?.interruptionIntent ?? null,
        }

        yield* input.onExit(observed)
      }), supervisorScope, { startImmediately: true })

      return input.owner
    }),

    interrupt: (owner, intent) => Effect.gen(function* () {
      const key = ownerKeyByInput(owner)
      const tracked = yield* Ref.modify(trackedWorkers, (state) => {
        const current = state.get(key)

        if (current === undefined || !ownersMatch(current.owner, owner)) {
          return [null, state]
        }

        const updated: TrackedWorker = {
          ...current,
          interruptionIntent: intent,
        }

        return [updated, new Map(state).set(key, updated)]
      })

      if (tracked === null) {
        return
      }

      yield* Fiber.interrupt(tracked.fiber)
    }),

    shutdownAll: Effect.gen(function* () {
      const workers = yield* Ref.get(trackedWorkers)

      yield* FiberMap.clear(workerFibers)

      for (const worker of workers.values()) {
        yield* Fiber.interrupt(worker.fiber)
      }
    }),
  }
}

export const WorkerSupervisorLive = Layer.effect(WorkerSupervisor)(
  Effect.gen(function* () {
    const fiberMap = yield* FiberMap.make<string, unknown, unknown>()
    const trackedWorkers = yield* Ref.make(new Map<string, TrackedWorker>())
    const supervisorScope = yield* Effect.scope

    return makeWorkerSupervisor(fiberMap, trackedWorkers, supervisorScope)
  }),
)
