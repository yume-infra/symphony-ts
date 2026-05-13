import { Effect, Layer } from 'effect'
import { CodexAppServerClientLive } from './agent-runner/codex.js'
import { AgentRunnerLive } from './agent-runner/runner.js'
import { ConfigResolverLive } from './config/resolve.js'
import { RuntimeLogger, RuntimeLoggerLive } from './observability/logging.js'
import { pollTick, startupTerminalWorkspaceCleanup } from './orchestrator/runtime.js'
import { OrchestratorStateLive } from './orchestrator/state.js'
import { PromptRendererLive } from './prompt/render.js'
import { LinearTrackerClientLive, LinearTransportLive } from './tracker/linear.js'
import { WorkflowLoaderLive } from './workflow/loader.js'
import { WorkflowRuntime, WorkflowRuntimeLive } from './workflow/runtime.js'
import { WorkspaceManagerLive } from './workspace/manager.js'

export function AppLive(workflowPath: string | undefined) {
  const workflowRuntime = WorkflowRuntimeLive(workflowPath).pipe(
    Layer.provide(Layer.mergeAll(WorkflowLoaderLive, ConfigResolverLive)),
  )

  return Layer.mergeAll(
    workflowRuntime,
    ConfigResolverLive,
    RuntimeLoggerLive,
    OrchestratorStateLive,
    WorkspaceManagerLive,
    PromptRendererLive,
    LinearTransportLive,
    LinearTrackerClientLive,
    CodexAppServerClientLive,
    AgentRunnerLive,
  )
}

export function startSymphony() {
  return Effect.gen(function* () {
    const workflow = yield* WorkflowRuntime
    const logger = yield* RuntimeLogger
    const initialConfig = yield* workflow.getConfig

    yield* logger.info('symphony_starting', {
      workflow_path: initialConfig.workflowPath,
      workspace_root: initialConfig.workspace.root,
    })
    yield* startupTerminalWorkspaceCleanup(initialConfig)
    yield* workflow.watch(result =>
      result.applied
        ? logger.info('workflow_reload_applied', { workflow_path: result.config.workflowPath })
        : logger.warn('workflow_reload_rejected', {
            workflow_path: result.config.workflowPath,
            reason: result.error,
          }),
    ).pipe(Effect.forkChild({ startImmediately: true }))

    while (true) {
      const config = yield* workflow.getConfig
      const nowMs = Date.now()
      yield* pollTick(config, { nowMs }).pipe(
        Effect.catch(error => logger.error('poll_tick_failed', {
          reason: 'reason' in error ? error.reason : String(error),
        })),
      )
      yield* Effect.sleep(`${config.polling.intervalMs} millis`)
    }
  })
}
