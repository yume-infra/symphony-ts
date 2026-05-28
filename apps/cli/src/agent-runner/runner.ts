import type { PromptRenderError, TrackerError, WorkspaceError } from '../domain/errors.js'
import type { Issue, ServiceConfig, Workspace } from '../domain/types.js'
import type { LinearTransport } from '../tracker/linear.js'
import type { WorkspaceBestEffortFailure } from '../workspace/manager.js'
import type { CodexRunResult, CodexRuntimeEvent } from './codex.js'
import { Context, Effect, Layer } from 'effect'
import { CodexError } from '../domain/errors.js'
import { normalizeStateName } from '../domain/types.js'
import { PromptRenderer } from '../prompt/render.js'
import { TrackerClient } from '../tracker/linear.js'
import { WorkspaceManager } from '../workspace/manager.js'
import { CodexAppServerClient } from './codex.js'

export interface AgentRunParams {
  readonly issue: Issue
  readonly attempt: number | null
  readonly config: ServiceConfig
  readonly onCodexEvent?: (event: CodexRuntimeEvent) => Effect.Effect<void>
  readonly onWorkspaceBestEffortFailure?: (failure: WorkspaceBestEffortFailure) => Effect.Effect<unknown>
}

export interface AgentRunResult {
  readonly issue: Issue
  readonly workspace: Workspace
  readonly session: CodexRunResult
  readonly turns: number
}

interface AgentTurnLoopResult {
  readonly issue: Issue
  readonly session: CodexRunResult
}

export interface AgentRunnerShape {
  readonly runAttempt: (
    params: AgentRunParams,
  ) => Effect.Effect<
    AgentRunResult,
    WorkspaceError | PromptRenderError | CodexError | TrackerError,
    WorkspaceManager | PromptRenderer | CodexAppServerClient | TrackerClient | LinearTransport
  >
}

export class AgentRunner extends Context.Service<AgentRunner, AgentRunnerShape>()(
  'symphony/AgentRunner',
) {}

const runCodexTurnLoop = Effect.fn('AgentRunner.runCodexTurnLoop')(function* (
  params: AgentRunParams,
  workspace: Workspace,
): Effect.fn.Return<
  AgentTurnLoopResult,
  PromptRenderError | CodexError | TrackerError,
  PromptRenderer | CodexAppServerClient | TrackerClient | LinearTransport
> {
  const promptRenderer = yield* PromptRenderer
  const codex = yield* CodexAppServerClient
  const tracker = yield* TrackerClient
  let currentIssue = params.issue
  let threadId: string | null = null
  let latestSession: CodexRunResult | null = null

  for (let turnNumber = 1; turnNumber <= params.config.agent.maxTurns; turnNumber += 1) {
    const prompt = turnNumber === 1
      ? yield* promptRenderer.render(params.config.promptTemplate, {
        issue: currentIssue,
        attempt: params.attempt,
      })
      : continuationPrompt(currentIssue, params.attempt, turnNumber)
    latestSession = yield* codex.runTurn({
      command: params.config.codex.command,
      cwd: workspace.path,
      workspacePath: workspace.path,
      prompt,
      issue: currentIssue,
      config: params.config.codex,
      serviceConfig: params.config,
      threadId,
      turnNumber,
      onEvent: params.onCodexEvent,
    })
    threadId = latestSession.threadId

    const refreshed = yield* tracker.fetchIssueStatesByIds(params.config, [currentIssue.id])
    const refreshedIssue = refreshed[0]

    if (refreshedIssue === undefined) {
      break
    }

    currentIssue = refreshedIssue

    if (!isActiveIssue(refreshedIssue, params.config)) {
      break
    }
  }

  if (latestSession === null) {
    return yield* new CodexError({
      code: 'response_error',
      reason: 'agent runner completed without a Codex session',
    })
  }

  return {
    issue: currentIssue,
    session: latestSession,
  }
})

export const runAttempt = Effect.fn('runAttempt')(function* (
  params: AgentRunParams,
): Effect.fn.Return<
  AgentRunResult,
  WorkspaceError | PromptRenderError | CodexError | TrackerError,
  WorkspaceManager | PromptRenderer | CodexAppServerClient | TrackerClient | LinearTransport
> {
  const workspaceManager = yield* WorkspaceManager
  const workspace = yield* workspaceManager.createForIssue(
    params.issue.identifier,
    params.config.workspace,
    params.config.hooks,
  )
  yield* workspaceManager.runBeforeRun(workspace.path, params.config.hooks)

  const runResult = yield* runCodexTurnLoop(params, workspace).pipe(
    Effect.ensuring(workspaceManager.runAfterRunBestEffort(
      workspace.path,
      params.config.hooks,
      params.onWorkspaceBestEffortFailure,
    )),
  )

  return {
    issue: runResult.issue,
    workspace,
    session: runResult.session,
    turns: runResult.session.turnCount,
  }
})

export const AgentRunnerLive = Layer.succeed(AgentRunner)({
  runAttempt: Effect.fn('AgentRunner.runAttempt')(function* (params: AgentRunParams) {
    return yield* runAttempt(params)
  }),
})

function continuationPrompt(issue: Issue, attempt: number | null, turnNumber: number): string {
  const attemptText = attempt === null ? 'first worker session' : `attempt ${attempt}`

  return [
    `Continue working on ${issue.identifier}: ${issue.title}.`,
    `This is turn ${turnNumber} in the same Codex thread for ${attemptText}.`,
    'Do not repeat the original full prompt; continue from thread context and current repository state.',
  ].join('\n')
}

function isActiveIssue(issue: Issue, config: ServiceConfig): boolean {
  const state = normalizeStateName(issue.state)

  return config.tracker.activeStates.some(activeState => normalizeStateName(activeState) === state)
}
