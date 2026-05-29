import type { Issue } from '../domain/types.js'

export interface AttemptOwner {
  readonly issueId: string
  readonly issueIdentifier: string
  readonly attempt: number | null
  readonly attemptId: string
  readonly workspacePath: string
  readonly startedAtMs: number
}

export interface WorkerInterruptionIntent {
  readonly cause: 'stalled' | 'not_active' | 'terminal' | 'manual'
  readonly cleanup: boolean
  readonly reason: string
  readonly issue?: Issue
}

export interface WorkerOwnerKey {
  readonly issueId: string
  readonly attemptId: string
}

export function ownerKey(owner: WorkerOwnerKey): string {
  return `${owner.issueId}:${owner.attemptId}`
}

export function workerOwnersMatch(left: AttemptOwner, right: AttemptOwner): boolean {
  return left.issueId === right.issueId
    && left.issueIdentifier === right.issueIdentifier
    && left.attemptId === right.attemptId
    && left.attempt === right.attempt
    && left.workspacePath === right.workspacePath
    && left.startedAtMs === right.startedAtMs
}
