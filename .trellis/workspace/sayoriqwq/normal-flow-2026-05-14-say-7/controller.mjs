import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const evidenceRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(evidenceRoot, '../../../..')
const issueIdentifier = 'SAY-7'
const workflowPath = join(evidenceRoot, 'WORKFLOW.md')
const eventsDir = join(evidenceRoot, 'events')
const workspaceRoot = join(evidenceRoot, 'workspaces')
const stdoutPath = join(evidenceRoot, 'symphony.stdout.log')
const stderrPath = join(evidenceRoot, 'symphony.stderr.log')
const evidencePath = join(evidenceRoot, 'evidence.json')
const maxMs = 7 * 60 * 1000
const pollMs = 3000

await mkdir(eventsDir, { recursive: true })
await resetRunArtifacts()

const env = {
  ...readDotEnv(join(repoRoot, '.env')),
  ...process.env,
}

if (!env.LINEAR_API_KEY) {
  throw new Error('LINEAR_API_KEY missing from environment or repo .env')
}

const evidence = {
  issueIdentifier,
  startedAt: new Date().toISOString(),
  paths: {
    repoRoot,
    evidenceRoot,
    workflowPath,
    workspaceRoot,
    stdoutPath,
    stderrPath,
  },
  initialIssue: null,
  finalIssue: null,
  stateTimeline: [],
  service: {
    pid: null,
    exit: null,
    signal: null,
    stoppedByController: false,
  },
  artifacts: {},
  codexEvents: [],
  checks: {},
  errors: [],
}

const initialIssue = await fetchIssue(issueIdentifier)
evidence.initialIssue = initialIssue
recordState(initialIssue)
await writeEvidence()

const child = spawn(process.execPath, ['apps/cli/dist/index.js', workflowPath], {
  cwd: repoRoot,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
})

evidence.service.pid = child.pid ?? null
await writeEvidence()

const stdoutChunks = []
const stderrChunks = []
child.stdout.on('data', (chunk) => {
  const text = chunk.toString('utf8')
  stdoutChunks.push(text)
  void appendFile(stdoutPath, text)
})
child.stderr.on('data', (chunk) => {
  const text = chunk.toString('utf8')
  stderrChunks.push(text)
  void appendFile(stderrPath, text)
})
child.on('exit', (code, signal) => {
  evidence.service.exit = code
  evidence.service.signal = signal
})

let doneObserved = false
let timeoutObserved = false
const start = Date.now()

while (Date.now() - start < maxMs) {
  await sleep(pollMs)

  try {
    const issue = await fetchIssue(issueIdentifier)
    recordState(issue)
    evidence.finalIssue = issue
    await collectArtifacts()
    await writeEvidence()

    if (issue.state === 'Done') {
      doneObserved = true
      break
    }
  }
  catch (cause) {
    evidence.errors.push({
      phase: 'poll_issue',
      message: cause instanceof Error ? cause.message : String(cause),
      at: new Date().toISOString(),
    })
    await writeEvidence()
  }

  if (child.exitCode !== null || child.signalCode !== null) {
    break
  }
}

if (!doneObserved) {
  timeoutObserved = true
}

if (doneObserved) {
  await waitUntil(async () => {
    await collectArtifacts()
    return evidence.checks.beforeRemoveRan === true && evidence.checks.workspaceCleaned === true
  }, 30000, 1000)
}

await collectArtifacts()
evidence.finalIssue = await fetchIssue(issueIdentifier).catch(() => evidence.finalIssue)
if (evidence.finalIssue !== null) {
  recordState(evidence.finalIssue)
}

await stopChild(child)
await collectArtifacts()
finalizeChecks(timeoutObserved)
evidence.finishedAt = new Date().toISOString()
await writeEvidence()

console.log(JSON.stringify({
  issue: evidence.finalIssue,
  timeline: evidence.stateTimeline,
  checks: evidence.checks,
  evidencePath,
}, null, 2))

if (!evidence.checks.pass) {
  process.exitCode = 1
}

async function gql(query, variables = {}) {
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      authorization: env.LINEAR_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const body = await response.json()

  if (response.status !== 200 || body.errors) {
    throw new Error(JSON.stringify({
      status: response.status,
      errors: body.errors?.map((error) => error.message) ?? null,
    }))
  }

  return body.data
}

async function fetchIssue(identifier) {
  const data = await gql(`
    query AcceptanceIssue($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        url
        createdAt
        updatedAt
        startedAt
        completedAt
        state { id name type }
        project { id name slugId }
        team { id name key }
      }
    }
  `, { id: identifier })

  if (!data.issue) {
    throw new Error(`Linear issue not found: ${identifier}`)
  }

  return {
    id: data.issue.id,
    identifier: data.issue.identifier,
    title: data.issue.title,
    url: data.issue.url,
    state: data.issue.state.name,
    stateId: data.issue.state.id,
    stateType: data.issue.state.type,
    updatedAt: data.issue.updatedAt,
    startedAt: data.issue.startedAt,
    completedAt: data.issue.completedAt,
    project: data.issue.project,
    team: data.issue.team,
  }
}

function recordState(issue) {
  const last = evidence.stateTimeline[evidence.stateTimeline.length - 1]

  if (last?.state === issue.state) {
    return
  }

  evidence.stateTimeline.push({
    state: issue.state,
    stateId: issue.stateId,
    stateType: issue.stateType,
    observedAt: new Date().toISOString(),
    linearUpdatedAt: issue.updatedAt,
  })
}

async function collectArtifacts() {
  const stdout = await readOptional(stdoutPath)
  const stderr = await readOptional(stderrPath)
  const hooks = await readOptional(join(eventsDir, 'hooks.jsonl'))
  const launches = await readOptional(join(eventsDir, 'codex-launches.jsonl'))
  const protocolIn = await readOptional(join(eventsDir, 'codex-protocol-in.jsonl'))
  const protocolOut = await readOptional(join(eventsDir, 'codex-protocol-out.jsonl'))
  const acceptanceResult = await readOptional(join(eventsDir, 'acceptance-result.txt'))
  const acceptanceBeforeRemove = await readOptional(join(eventsDir, 'acceptance-result.before-remove.txt'))
  const workspaceEntries = await readdir(workspaceRoot).catch(() => [])
  const issueWorkspace = join(workspaceRoot, issueIdentifier)
  const issueWorkspaceExists = await exists(issueWorkspace)

  evidence.artifacts = {
    stdoutTail: tail(stdout, 12000),
    stderrTail: tail(stderr, 12000),
    hooks,
    codexLaunches: launches,
    codexProtocolInTail: tail(protocolIn, 12000),
    codexProtocolOutTail: tail(protocolOut, 12000),
    acceptanceResult,
    acceptanceBeforeRemove,
    workspaceEntries,
    issueWorkspace,
    issueWorkspaceExists,
  }
  evidence.codexEvents = parseCodexEvents(stdout)
  evidence.checks = {
    ...evidence.checks,
    createdFromTodo: evidence.initialIssue?.state === 'Todo',
    sawInProgress: evidence.stateTimeline.some((entry) => entry.state === 'In Progress'),
    sawDone: evidence.stateTimeline.some((entry) => entry.state === 'Done'),
    symphonyStarted: stdout.includes('message=symphony_starting'),
    codexLaunched: launches.trim().length > 0,
    sawSessionStarted: evidence.codexEvents.some((event) => event.codex_event === 'session_started'),
    sawTurnCompleted: evidence.codexEvents.some((event) => event.codex_event === 'turn/completed'),
    afterCreateRan: hooks.includes('"hook":"after_create"'),
    beforeRunRan: hooks.includes('"hook":"before_run"'),
    afterRunRan: hooks.includes('"hook":"after_run"'),
    beforeRemoveRan: hooks.includes('"hook":"before_remove"'),
    acceptanceResultCopied: acceptanceResult.trim() === 'SYMPHONY_NORMAL_FLOW_ACCEPTANCE_OK'
      || acceptanceBeforeRemove.trim() === 'SYMPHONY_NORMAL_FLOW_ACCEPTANCE_OK',
    workspaceCleaned: !issueWorkspaceExists,
    noPollFailures: !stdout.includes('message=poll_tick_failed') && !stderr.includes('poll_tick_failed'),
    noUnsupportedToolCall: !stdout.includes('codex_event=unsupported_tool_call'),
    noApprovalRejected: !stdout.includes('codex_event=approval_rejected'),
    noUserInputRequest: !stdout.includes('turn_input_required') && !stderr.includes('turn_input_required'),
  }
}

function finalizeChecks(timeoutObserved) {
  evidence.checks.timedOut = timeoutObserved
  evidence.checks.pass = evidence.checks.createdFromTodo === true
    && evidence.checks.sawInProgress === true
    && evidence.checks.sawDone === true
    && evidence.checks.symphonyStarted === true
    && evidence.checks.codexLaunched === true
    && evidence.checks.sawSessionStarted === true
    && evidence.checks.sawTurnCompleted === true
    && evidence.checks.afterCreateRan === true
    && evidence.checks.beforeRunRan === true
    && evidence.checks.afterRunRan === true
    && evidence.checks.beforeRemoveRan === true
    && evidence.checks.acceptanceResultCopied === true
    && evidence.checks.workspaceCleaned === true
    && evidence.checks.noPollFailures === true
    && evidence.checks.noUnsupportedToolCall === true
    && evidence.checks.noApprovalRejected === true
    && evidence.checks.noUserInputRequest === true
    && timeoutObserved === false
}

function parseCodexEvents(stdout) {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.includes('message=codex_event'))
    .map((line) => Object.fromEntries(line
      .match(/(?:^| )([A-Za-z0-9_]+)=("(?:\\.|[^"\\])*"|[^ ]+)/g)
      ?.map((field) => {
        const trimmed = field.trim()
        const separator = trimmed.indexOf('=')
        const key = trimmed.slice(0, separator)
        const raw = trimmed.slice(separator + 1)
        return [key, raw.startsWith('"') ? parseQuotedLogValue(raw) : raw]
      }) ?? []))
}

function parseQuotedLogValue(raw) {
  try {
    return JSON.parse(raw)
  }
  catch {
    return raw.slice(1, -1)
  }
}

async function stopChild(childProcess) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return
  }

  evidence.service.stoppedByController = true
  childProcess.kill('SIGINT')

  const exited = await waitForExit(childProcess, 5000)

  if (!exited) {
    childProcess.kill('SIGTERM')
    await waitForExit(childProcess, 5000)
  }
}

async function waitForExit(childProcess, timeoutMs) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return true
  }

  return await new Promise((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise(false), timeoutMs)
    childProcess.once('exit', () => {
      clearTimeout(timer)
      resolvePromise(true)
    })
  })
}

async function waitUntil(predicate, timeoutMs, intervalMs) {
  const startMs = Date.now()

  while (Date.now() - startMs < timeoutMs) {
    if (await predicate()) {
      return true
    }

    await sleep(intervalMs)
  }

  return false
}

async function writeEvidence() {
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
}

async function appendFile(path, text) {
  await mkdir(dirname(path), { recursive: true })
  const { appendFile: append } = await import('node:fs/promises')
  await append(path, text)
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8')
  }
  catch {
    return ''
  }
}

async function exists(path) {
  try {
    await stat(path)
    return true
  }
  catch {
    return false
  }
}

function readDotEnv(path) {
  if (!existsSync(path)) {
    return {}
  }

  const output = {}
  const source = readFileSync(path, 'utf8')

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue
    }

    const separator = trimmed.indexOf('=')

    if (separator <= 0) {
      continue
    }

    const key = trimmed.slice(0, separator).trim()
    const raw = trimmed.slice(separator + 1).trim()
    output[key] = raw.replace(/^['"]|['"]$/g, '')
  }

  return output
}

function tail(text, maxLength) {
  return text.length > maxLength ? text.slice(text.length - maxLength) : text
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function resetRunArtifacts() {
  await rm(join(workspaceRoot, issueIdentifier), { recursive: true, force: true })
  await rm(stdoutPath, { force: true })
  await rm(stderrPath, { force: true })
  await rm(join(eventsDir, 'hooks.jsonl'), { force: true })
  await rm(join(eventsDir, 'codex-launches.jsonl'), { force: true })
  await rm(join(eventsDir, 'codex-protocol-in.jsonl'), { force: true })
  await rm(join(eventsDir, 'codex-protocol-out.jsonl'), { force: true })
  await rm(join(eventsDir, 'acceptance-result.txt'), { force: true })
  await rm(join(eventsDir, 'acceptance-result.before-remove.txt'), { force: true })
}
