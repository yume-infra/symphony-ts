import type { AttemptOwner, WorkerInterruptionIntent } from './attempt-owner.js'
import type { WorkerExitObserved } from './worker-supervisor.js'
import { describe, expect, it } from '@effect/vitest'
import { Deferred, Effect, Exit } from 'effect'
import { WorkerSupervisor, WorkerSupervisorLive } from './worker-supervisor.js'

const issueId = 'issue-1'
const issueIdentifier = 'SYM-1'

function awaitDeferred<A>(deferred: Deferred.Deferred<A>, step: string) {
  return Deferred.await(deferred).pipe(
    Effect.timeoutOrElse({
      duration: '1 second',
      orElse: () => Effect.fail({ _tag: 'timed_out' as const, step }),
    }),
  )
}

function makeOwner(attemptId: string, startedAtMs: number = 1700): AttemptOwner {
  return {
    issueId,
    issueIdentifier,
    attempt: null,
    attemptId,
    workspacePath: '/tmp/workspaces/SYM-1',
    startedAtMs,
  }
}

describe('worker supervisor lifecycle', () => {
  it.effect('observes worker exits and reports owner metadata', () =>
    Effect.gen(function* () {
      const observed = yield* Deferred.make<WorkerExitObserved>()
      const owner = makeOwner('attempt-start')

      const completion = yield* Effect.gen(function* () {
        const supervisor = yield* WorkerSupervisor
        yield* supervisor.start({
          owner,
          worker: Effect.succeed({ ok: true }),
          onExit: output => Deferred.succeed(observed, output),
        })

        return yield* Deferred.await(observed)
      }).pipe(Effect.provide(WorkerSupervisorLive))

      expect(completion.owner).toEqual(owner)
      expect(Exit.isSuccess(completion.exit)).toBe(true)
      expect(completion.interruptionIntent).toBeNull()
    }))

  it.effect('interrupts a worker and retains the interruption intent on watcher output', () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>()
      const never = yield* Deferred.make<void>()
      const observed = yield* Deferred.make<WorkerExitObserved>()
      const owner = makeOwner('attempt-interrupt')
      const intent: WorkerInterruptionIntent = {
        cause: 'manual',
        cleanup: false,
        reason: 'manual restart',
      }

      const completion = yield* Effect.gen(function* () {
        const supervisor = yield* WorkerSupervisor

        yield* supervisor.start({
          owner,
          worker: Effect.gen(function* () {
            yield* Deferred.succeed(started, void 0)
            yield* Deferred.await(never)
          }),
          onExit: output => Deferred.succeed(observed, output),
        })

        yield* Deferred.await(started)
        yield* supervisor.interrupt(owner, intent)

        return yield* Deferred.await(observed)
      }).pipe(Effect.provide(WorkerSupervisorLive))

      expect(completion.interruptionIntent).toEqual(intent)
      expect(Exit.isFailure(completion.exit)).toBe(true)
    }))

  it.effect('does not interrupt a newer attempt when interrupting stale owner key', () =>
    Effect.gen(function* () {
      const oldStarted = yield* Deferred.make<void>()
      const newStarted = yield* Deferred.make<void>()
      const oldNever = yield* Deferred.make<void>()
      const newNever = yield* Deferred.make<void>()
      const oldObserved = yield* Deferred.make<WorkerExitObserved>()
      const newObserved = yield* Deferred.make<WorkerExitObserved>()
      const oldOwner = makeOwner('attempt-old', 1000)
      const newOwner = makeOwner('attempt-new', 2000)
      const staleIntent: WorkerInterruptionIntent = {
        cause: 'manual',
        cleanup: true,
        reason: 'stale owner interruption',
      }

      const completion = yield* Effect.gen(function* () {
        const supervisor = yield* WorkerSupervisor

        yield* supervisor.start({
          owner: oldOwner,
          worker: Effect.gen(function* () {
            yield* Deferred.succeed(oldStarted, void 0)
            yield* Deferred.await(oldNever)
          }),
          onExit: output => Deferred.succeed(oldObserved, output),
        })

        yield* supervisor.start({
          owner: newOwner,
          worker: Effect.gen(function* () {
            yield* Deferred.succeed(newStarted, void 0)
            yield* Deferred.await(newNever)
          }),
          onExit: output => Deferred.succeed(newObserved, output),
        })

        yield* awaitDeferred(oldStarted, 'old_started')
        yield* awaitDeferred(newStarted, 'new_started')
        yield* supervisor.interrupt(oldOwner, staleIntent)

        const oldCompletion = yield* awaitDeferred(oldObserved, 'old_exit')
        const newCompleted = (yield* Deferred.poll(newObserved))._tag === 'Some'

        expect(newCompleted).toBe(false)

        yield* supervisor.shutdownAll
        const newCompletion = yield* awaitDeferred(newObserved, 'new_exit_after_shutdown')

        return {
          oldCompletion,
          newCompletion,
        }
      }).pipe(Effect.provide(WorkerSupervisorLive))

      expect(completion.oldCompletion.interruptionIntent).toEqual(staleIntent)
      expect(completion.newCompletion.interruptionIntent).toBeNull()
    }))

  it.effect('shutdownAll interrupts every owned worker', () =>
    Effect.gen(function* () {
      const ownerA = makeOwner('attempt-a', 3000)
      const ownerB = makeOwner('attempt-b', 4000)
      const startedA = yield* Deferred.make<void>()
      const startedB = yield* Deferred.make<void>()
      const neverA = yield* Deferred.make<void>()
      const neverB = yield* Deferred.make<void>()
      const exitA = yield* Deferred.make<WorkerExitObserved>()
      const exitB = yield* Deferred.make<WorkerExitObserved>()

      const completion = yield* Effect.gen(function* () {
        const supervisor = yield* WorkerSupervisor

        yield* supervisor.start({
          owner: ownerA,
          worker: Effect.gen(function* () {
            yield* Deferred.succeed(startedA, void 0)
            yield* Deferred.await(neverA)
          }),
          onExit: output => Deferred.succeed(exitA, output),
        })

        yield* supervisor.start({
          owner: ownerB,
          worker: Effect.gen(function* () {
            yield* Deferred.succeed(startedB, void 0)
            yield* Deferred.await(neverB)
          }),
          onExit: output => Deferred.succeed(exitB, output),
        })

        yield* Deferred.await(startedA)
        yield* Deferred.await(startedB)
        yield* supervisor.shutdownAll

        return yield* Effect.all([Deferred.await(exitA), Deferred.await(exitB)])
      }).pipe(Effect.provide(WorkerSupervisorLive))

      expect(completion[0].interruptionIntent).toBeNull()
      expect(completion[1].interruptionIntent).toBeNull()
      expect(Exit.isFailure(completion[0].exit)).toBe(true)
      expect(Exit.isFailure(completion[1].exit)).toBe(true)
    }))
})
