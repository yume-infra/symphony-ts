#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'repos/effect.subtree.json')

const mode = process.argv[2] ?? 'verify'

if (!['verify', 'update'].includes(mode)) {
  console.error(`Unknown mode: ${mode}`)
  console.error('Usage: node scripts/effect-source-subtree.mjs <verify|update>')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function latestSubtreeSplit(prefix) {
  const log = git([
    'log',
    '--all',
    '--format=%B%x1e',
    `--grep=git-subtree-dir: ${prefix}`,
  ])

  for (const entry of log.split('\x1E')) {
    if (!entry.includes(`git-subtree-dir: ${prefix}`)) {
      continue
    }

    const match = entry.match(/git-subtree-split:\s*([0-9a-f]{40})/u)
    if (match) {
      return match[1]
    }
  }

  return undefined
}

function trackedFiles() {
  return git(['ls-files']).split('\n').filter(Boolean)
}

function treeEntry(path) {
  return git(['ls-tree', 'HEAD', path])
}

function isApplicationSource(file) {
  const sourceRoot = file.startsWith('apps/') || file.startsWith('libs/')
  const sourceExtension = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']
    .some(extension => file.endsWith(extension))

  return sourceRoot && sourceExtension && !file.startsWith(`${manifest.prefix}/`)
}

function hasVendoredImport(text) {
  return text
    .split('\n')
    .some((line) => {
      const trimmed = line.trim()
      const importsModule = trimmed.startsWith('import ')
        || trimmed.startsWith('export ')
        || trimmed.includes('import(')
        || trimmed.includes('require(')

      return importsModule && trimmed.includes('repos/effect')
    })
}

function assertNoVendoredImports(errors) {
  const sourceFiles = trackedFiles().filter(isApplicationSource)

  for (const file of sourceFiles) {
    const text = readFileSync(join(root, file), 'utf8')
    if (hasVendoredImport(text)) {
      errors.push(`${file} imports from ${manifest.prefix}; use package dependencies instead.`)
    }
  }
}

function verify() {
  const errors = []

  if (!existsSync(join(root, manifest.prefix))) {
    errors.push(`Missing vendored source directory: ${manifest.prefix}`)
  }

  const entry = treeEntry(manifest.prefix)
  if (entry.startsWith('160000 ')) {
    errors.push(`${manifest.prefix} is a gitlink submodule; expected a git subtree directory.`)
  }
  else if (!entry.startsWith('040000 tree ')) {
    errors.push(`${manifest.prefix} is not recorded as a Git tree entry.`)
  }

  if (!existsSync(join(root, manifest.llmDocument))) {
    errors.push(`Missing Effect LLM document: ${manifest.llmDocument}`)
  }

  const split = latestSubtreeSplit(manifest.prefix)
  if (!split) {
    errors.push(`No git subtree split found for ${manifest.prefix}`)
  }
  else if (split !== manifest.split) {
    errors.push(
      `Subtree split mismatch for ${manifest.prefix}: manifest expects ${manifest.split}, git history has ${split}`,
    )
  }

  const gitmodules = join(root, '.gitmodules')
  if (existsSync(gitmodules) && readFileSync(gitmodules, 'utf8').includes(manifest.prefix)) {
    errors.push(`${manifest.prefix} must be a git subtree, not a git submodule.`)
  }

  assertNoVendoredImports(errors)

  if (errors.length > 0) {
    console.error('Effect source subtree verification failed:')
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exit(1)
  }

  console.log(`Effect source subtree verified: ${manifest.prefix} @ git-subtree-split ${manifest.split}`)
}

function assertCleanWorktree() {
  const status = git(['status', '--porcelain'])
  if (status.length > 0) {
    console.error('Refusing to update the Effect subtree with a dirty working tree:')
    console.error(status)
    process.exit(1)
  }
}

function update() {
  assertCleanWorktree()

  const result = spawnSync(
    'git',
    [
      'subtree',
      'pull',
      `--prefix=${manifest.prefix}`,
      manifest.repository,
      manifest.branch,
      '--squash',
    ],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  const split = latestSubtreeSplit(manifest.prefix)
  console.log('')
  console.log(`Effect subtree updated. New git-subtree-split: ${split ?? '<unknown>'}`)
  console.log(`Update ${manifestPath} and docs/effect-patterns/index.md before committing.`)
}

if (mode === 'verify') {
  verify()
}
else {
  update()
}
