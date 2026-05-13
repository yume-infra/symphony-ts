import { chmod, readFile, writeFile } from 'node:fs/promises'

const entry = new URL('../dist/index.js', import.meta.url)
const shebang = '#!/usr/bin/env node\n'
const source = await readFile(entry, 'utf8')

if (!source.startsWith(shebang)) {
  await writeFile(entry, `${shebang}${source.replace(/^#!.*\n/u, '')}`)
}

await chmod(entry, 0o755)
