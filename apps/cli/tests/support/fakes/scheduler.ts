export interface FakeScheduledTask {
  readonly id: number
  readonly dueAtMs: number
  readonly run: () => void
}

export interface FakeScheduler {
  readonly now: () => number
  readonly pending: () => ReadonlyArray<FakeScheduledTask>
  readonly schedule: (delayMs: number, run: () => void) => number
  readonly advanceBy: (durationMs: number) => number
  readonly clear: (id: number) => boolean
}

export function createFakeScheduler(initialNowMs = 0): FakeScheduler {
  let nowMs = initialNowMs
  let nextId = 1
  const tasks: Array<FakeScheduledTask> = []

  return {
    now() {
      return nowMs
    },
    pending() {
      return [...tasks]
    },
    schedule(delayMs, run) {
      const id = nextId
      nextId += 1

      tasks.push({
        id,
        dueAtMs: nowMs + delayMs,
        run,
      })

      return id
    },
    advanceBy(durationMs) {
      nowMs += durationMs

      const dueTasks = tasks
        .filter(task => task.dueAtMs <= nowMs)
        .sort((left, right) => left.dueAtMs - right.dueAtMs)

      for (const task of dueTasks) {
        const index = tasks.findIndex(candidate => candidate.id === task.id)

        if (index >= 0) {
          tasks.splice(index, 1)
        }

        task.run()
      }

      return dueTasks.length
    },
    clear(id) {
      const index = tasks.findIndex(task => task.id === id)

      if (index < 0) {
        return false
      }

      tasks.splice(index, 1)

      return true
    },
  }
}
