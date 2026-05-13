#!/usr/bin/env node

import process from 'node:process'
import { Command, Options } from '@effect/cli'
import { NodeContext, NodeRuntime } from '@effect/platform-node'
import { Console, Effect } from 'effect'
import { renderGreeting } from './greeting.js'

export { renderGreeting } from './greeting.js'

const name = Options.text('name').pipe(
  Options.withDefault('world'),
  Options.withDescription('Name to greet'),
)

const command = Command.make(
  'symphony-ts',
  { name },
  ({ name }) => Console.log(renderGreeting(name)),
)

const cli = Command.run(command, {
  name: 'symphony-ts',
  version: '0.0.0',
})

NodeRuntime.runMain(
  cli(process.argv).pipe(Effect.provide(NodeContext.layer)),
)
