import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Argument from 'effect/unstable/cli/Argument'
import * as Command from 'effect/unstable/cli/Command'
import { AppLive, startSymphony } from '../app.js'

const workflowPath = Argument.path('workflow-path').pipe(
  Argument.optional,
  Argument.withDescription('Path to WORKFLOW.md'),
)

export const command = Command.make(
  'symphony-ts',
  { workflowPath },
  ({ workflowPath }) => {
    const selectedWorkflowPath = Option.getOrUndefined(workflowPath)

    return startSymphony().pipe(
      Effect.provide(AppLive(selectedWorkflowPath)),
    )
  },
)
