#!/usr/bin/env node

import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import * as Effect from 'effect/Effect'
import * as Command from 'effect/unstable/cli/Command'
import { command } from './cli/command.js'

const main = Command.run(command, {
  version: '0.0.0',
}).pipe(
  Effect.provide(NodeServices.layer),
)

NodeRuntime.runMain(main)
