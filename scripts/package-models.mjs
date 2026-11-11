import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { rootDir } from './model-utils.mjs'

const args = process.argv.slice(2)
const selectAll = args.includes('--all')
const requestedIds = []

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--model') {
    const value = args[i + 1]
    if (!value) throw new Error('--model requires a model id')
    requestedIds.push(...value.split(',').map((id) => id.trim()).filter(Boolean))
    i += 1
  } else if (!arg.startsWith('-')) {
    requestedIds.push(...arg.split(',').map((id) => id.trim()).filter(Boolean))
  }
}

if (!selectAll && requestedIds.length === 0) {
  throw new Error('usage: npm run package:model -- <model-id> | npm run package:all')
}

if (selectAll && requestedIds.length > 0) {
  throw new Error('use either --all or explicit model ids, not both')
}

function runNode(script, scriptArgs) {
  const result = spawnSync(process.execPath, [path.join(rootDir, script), ...scriptArgs], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${script} failed with exit code ${result.status}`)
  }
}

runNode(
  'scripts/prepare-models.mjs',
  selectAll ? ['--all'] : ['--model', requestedIds.join(',')],
)

runNode('node_modules/vite/bin/vite.js', ['build'])
runNode('scripts/copy-to-we.mjs', [])
