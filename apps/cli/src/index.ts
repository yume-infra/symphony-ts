#!/usr/bin/env node

import * as NodeRuntime from '@effect/platform-node/NodeRuntime'
import * as NodeServices from '@effect/platform-node/NodeServices'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Command from 'effect/unstable/cli/Command'
import * as Flag from 'effect/unstable/cli/Flag'
import { renderGreeting } from './greeting.js'

export { renderGreeting } from './greeting.js'

const name = Flag.string('name').pipe(
  Flag.withDefault('world'),
  Flag.withDescription('Name to greet'),
)

const command = Command.make(
  'symphony-ts',
  { name },
  ({ name }) => Console.log(renderGreeting(name)),
)

const main = Command.run(command, {
  version: '0.0.0',
}).pipe(
  Effect.provide(NodeServices.layer),
)

NodeRuntime.runMain(main)
