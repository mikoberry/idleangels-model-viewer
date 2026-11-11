import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  libraryManifestPath,
  presetsPath,
  publicManifestPath,
  rootDir,
} from './model-utils.mjs'

function allModelsPrepared() {
  try {
    const library = JSON.parse(fs.readFileSync(libraryManifestPath, 'utf8'))
    const publicPackage = JSON.parse(fs.readFileSync(publicManifestPath, 'utf8'))
    if (library.models.length !== publicPackage.models.length) return false

    const libraryIds = new Set(library.models.map((model) => model.id))
    if (!publicPackage.models.every((model) => libraryIds.has(model.id))) {
      return false
    }

    if (fs.existsSync(presetsPath)) {
      const presetMtime = fs.statSync(presetsPath).mtimeMs
      const publicMtime = fs.statSync(publicManifestPath).mtimeMs
      if (publicMtime < presetMtime) return false
    }

    return true
  } catch {
    return false
  }
}

if (!allModelsPrepared()) {
  console.log('[dev:all] preparing all models...')
  const prepare = spawnSync(
    process.execPath,
    [path.join(rootDir, 'scripts', 'prepare-models.mjs'), '--all'],
    { cwd: rootDir, stdio: 'inherit', env: process.env },
  )
  if (prepare.error) throw prepare.error
  if (prepare.status !== 0) process.exit(prepare.status ?? 1)
} else {
  console.log('[dev:all] all models already prepared')
}

const vite = spawnSync(
  process.execPath,
  [path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'), ...process.argv.slice(2)],
  { cwd: rootDir, stdio: 'inherit', env: process.env },
)

if (vite.error) throw vite.error
process.exit(vite.status ?? 1)
