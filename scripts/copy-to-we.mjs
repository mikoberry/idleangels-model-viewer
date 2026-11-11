import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(rootDir, 'dist')
const defaultTargetDir =
  'F:/SteamLibrary/steamapps/common/wallpaper_engine/projects/myprojects/spine-react-test'
const targetDir = path.resolve(process.env.WE_TARGET_DIR ?? defaultTargetDir)

function fail(message) {
  console.error(`[copy-to-we] ${message}`)
  process.exit(1)
}

function copyDirectoryContents(source, destination) {
  fs.mkdirSync(destination, { recursive: true })

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    fs.cpSync(
      path.join(source, entry.name),
      path.join(destination, entry.name),
      { recursive: true },
    )
  }
}

const comparePath = (value) =>
  process.platform === 'win32' ? value.toLowerCase() : value
const comparableRoot = comparePath(rootDir)
const comparableDist = comparePath(distDir)
const comparableTarget = comparePath(targetDir)

const distIndex = path.join(distDir, 'index.html')
if (!fs.existsSync(distIndex)) {
  fail(`missing ${distIndex}; run "npm run build" first`)
}

if (comparableTarget === comparableRoot || comparableTarget === comparableDist) {
  fail(`refusing to replace project directory: ${targetDir}`)
}

if (comparableTarget.startsWith(comparableRoot + path.sep)) {
  fail(`target must be outside the project directory: ${targetDir}`)
}

if (comparableTarget === comparePath(path.parse(targetDir).root)) {
  fail(`refusing to replace a drive root: ${targetDir}`)
}

fs.mkdirSync(path.dirname(targetDir), { recursive: true })

const stagingDir = `${targetDir}.tmp-${process.pid}`

try {
  fs.rmSync(stagingDir, { recursive: true, force: true })
  copyDirectoryContents(distDir, stagingDir)

  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.renameSync(stagingDir, targetDir)

  console.log(`[copy-to-we] copied dist -> ${targetDir}`)
} catch (error) {
  fs.rmSync(stagingDir, { recursive: true, force: true })
  fail(error instanceof Error ? error.message : String(error))
}
