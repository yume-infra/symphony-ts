import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const packageName = '@sayoriqwq/symphony-ts'
const packageDir = 'apps/cli'
const packageJsonPath = join(packageDir, 'package.json')
const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\dA-Za-z.-]+)?(?:\+[\dA-Za-z.-]+)?$/u
const distTagPattern = /^\w[\w.-]*$/u

const help = `Usage:
  node scripts/publish-npm.mjs --version 0.1.0 [--tag latest] [--dry-run]

In GitHub Actions the script reads workflow_dispatch and release payloads
automatically. For a real publish, provide NODE_AUTH_TOKEN through the
NPM_TOKEN repository secret.
`

try {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    console.log(help)
  }
  else {
    publishNpm(options)
  }
}
catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}

function publishNpm(options) {
  const config = resolveConfig(options)
  const originalPackageJson = readFileSync(packageJsonPath, 'utf8')

  if (!config.dryRun && !process.env.NODE_AUTH_TOKEN) {
    throw new Error('NODE_AUTH_TOKEN is required. Configure the GitHub repository secret NPM_TOKEN.')
  }

  console.log(`Publishing ${packageName}@${config.version} with npm tag "${config.npmTag}".`)
  if (config.dryRun) {
    console.log('Dry run enabled; npm will not publish the package.')
  }

  let shouldRestorePackageJson = false

  try {
    run('pnpm', ['verify'])
    writeFileSync(packageJsonPath, packageJsonWithVersion(originalPackageJson, config.version))
    shouldRestorePackageJson = true
    const tarball = packPackage(config.packDestination)
    publishTarball(tarball, config)
  }
  finally {
    if (shouldRestorePackageJson) {
      writeFileSync(packageJsonPath, originalPackageJson)
    }
  }
}

function resolveConfig(options) {
  const eventConfig = readGitHubEventConfig()
  const rawVersion = options.version ?? process.env.PUBLISH_VERSION ?? eventConfig.version
  const version = normalizeVersion(rawVersion)
  const npmTag = options.npmTag ?? process.env.NPM_TAG ?? eventConfig.npmTag ?? 'latest'
  const dryRun = options.dryRun ?? parseBoolean(process.env.DRY_RUN) ?? eventConfig.dryRun ?? false
  const packRoot = process.env.RUNNER_TEMP ?? tmpdir()
  const packDestination = options.packDestination ?? process.env.PUBLISH_PACK_DIR ?? mkdtempSync(join(packRoot, 'sayoriqwq-symphony-ts-npm-pack-'))
  const provenance = options.provenance ?? parseBoolean(process.env.NPM_PROVENANCE) ?? process.env.GITHUB_ACTIONS === 'true'

  if (!distTagPattern.test(npmTag)) {
    throw new Error(`Invalid npm dist-tag: ${npmTag}`)
  }

  return {
    dryRun,
    npmTag,
    packDestination,
    provenance,
    version,
  }
}

function readGitHubEventConfig() {
  const eventName = process.env.GITHUB_EVENT_NAME
  const eventPath = process.env.GITHUB_EVENT_PATH

  if (!eventName || !eventPath || !existsSync(eventPath)) {
    return {}
  }

  const event = JSON.parse(readFileSync(eventPath, 'utf8'))

  if (eventName === 'workflow_dispatch') {
    return {
      dryRun: parseBoolean(event.inputs?.dry_run),
      npmTag: event.inputs?.npm_tag,
      version: event.inputs?.version,
    }
  }

  if (eventName === 'release') {
    return {
      dryRun: false,
      npmTag: event.release?.prerelease ? 'next' : 'latest',
      version: event.release?.tag_name,
    }
  }

  return {}
}

function normalizeVersion(rawVersion) {
  if (!rawVersion) {
    throw new Error('A publish version is required. Pass --version, set PUBLISH_VERSION, or run from the publish workflow.')
  }

  const version = String(rawVersion).trim().replace(/^v/iu, '')

  if (!semverPattern.test(version)) {
    throw new Error(`Invalid semver version: ${rawVersion}`)
  }

  return version
}

function packageJsonWithVersion(source, version) {
  const packageJson = JSON.parse(source)

  if (packageJson.name !== packageName) {
    throw new Error(`Expected ${packageJsonPath} to describe package "${packageName}".`)
  }

  packageJson.version = version
  return `${JSON.stringify(packageJson, null, 2)}\n`
}

function packPackage(packDestination) {
  mkdirSync(packDestination, { recursive: true })

  // The publish artifact needs a temporary version; dependencies are unchanged.
  const packEnv = {
    ...process.env,
    npm_config_verify_deps_before_run: 'false',
  }

  const output = runForOutput('pnpm', [
    '--filter',
    packageName,
    'pack',
    '--pack-destination',
    packDestination,
    '--json',
  ], { env: packEnv })
  const parsed = parseJsonFromOutput(output)
  const packed = Array.isArray(parsed) ? parsed[0] : parsed
  const tarball = packed?.filename

  if (!tarball) {
    throw new Error(`Could not find tarball filename in pnpm pack output:\n${output}`)
  }

  console.log(`Packed ${tarball}`)
  return tarball
}

function publishTarball(tarball, config) {
  const args = ['publish', tarball, '--access', 'public', '--tag', config.npmTag]

  if (config.provenance) {
    args.push('--provenance')
  }

  if (config.dryRun) {
    args.push('--dry-run')
  }

  run('npm', args)
}

function parseJsonFromOutput(output) {
  const trimmed = output.trim()

  if (!trimmed) {
    throw new Error('pnpm pack did not return JSON output.')
  }

  for (const index of jsonStartIndexes(trimmed)) {
    try {
      return JSON.parse(trimmed.slice(index))
    }
    catch {
      // Keep looking. Some package managers print lifecycle logs before --json output.
    }
  }

  throw new Error(`Could not parse pnpm pack JSON output:\n${output}`)
}

function jsonStartIndexes(input) {
  const indexes = [0]

  for (let index = 1; index < input.length; index += 1) {
    if (input[index] === '[' || input[index] === '{') {
      indexes.push(index)
    }
  }

  return indexes
}

function run(command, args, options = {}) {
  console.log(`\n> ${formatCommand(command, args)}`)

  const result = spawnSync(command, args, {
    env: options.env ?? process.env,
    stdio: 'inherit',
  })

  assertCommandSucceeded(command, result)
}

function runForOutput(command, args, options = {}) {
  console.log(`\n> ${formatCommand(command, args)}`)

  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  assertCommandSucceeded(command, result)
  return result.stdout
}

function assertCommandSucceeded(command, result) {
  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`)
  }
}

function parseArgs(args) {
  const options = {}

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '-h' || arg === '--help') {
      options.help = true
    }
    else if (arg === '--version') {
      options.version = readArgValue(args, ++index, arg)
    }
    else if (arg.startsWith('--version=')) {
      options.version = arg.slice('--version='.length)
    }
    else if (arg === '--tag' || arg === '--npm-tag') {
      options.npmTag = readArgValue(args, ++index, arg)
    }
    else if (arg.startsWith('--tag=')) {
      options.npmTag = arg.slice('--tag='.length)
    }
    else if (arg.startsWith('--npm-tag=')) {
      options.npmTag = arg.slice('--npm-tag='.length)
    }
    else if (arg === '--dry-run') {
      options.dryRun = true
    }
    else if (arg === '--no-dry-run') {
      options.dryRun = false
    }
    else if (arg === '--pack-destination') {
      options.packDestination = readArgValue(args, ++index, arg)
    }
    else if (arg.startsWith('--pack-destination=')) {
      options.packDestination = arg.slice('--pack-destination='.length)
    }
    else if (arg === '--provenance') {
      options.provenance = true
    }
    else if (arg === '--no-provenance') {
      options.provenance = false
    }
    else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function readArgValue(args, index, flag) {
  const value = args[index]

  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}`)
  }

  return value
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  if (value === true || value === 'true' || value === '1') {
    return true
  }

  if (value === false || value === 'false' || value === '0') {
    return false
  }

  throw new Error(`Invalid boolean value: ${value}`)
}

function formatCommand(command, args) {
  return [command, ...args].map(shellQuote).join(' ')
}

function shellQuote(value) {
  if (/^[\w./:=@-]+$/u.test(value)) {
    return value
  }

  return `'${value.replaceAll('\'', '\'\\\'\'')}'`
}
