import fs from 'node:fs'
import path from 'node:path'
import {
  formatBytes,
  libraryDir,
  libraryManifestPath,
  publicManifestPath,
  publicModelsDir,
  readAtlasPages,
  readJson,
  readPngSize,
  rescaleAtlasText,
  writeJson,
} from './model-utils.mjs'

const args = process.argv.slice(2)
let selectAll = false
const requestedIds = []

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--all') {
    selectAll = true
  } else if (arg === '--model') {
    const value = args[i + 1]
    if (!value) throw new Error('--model requires a model id')
    requestedIds.push(...value.split(',').map((id) => id.trim()).filter(Boolean))
    i += 1
  } else if (!arg.startsWith('-')) {
    requestedIds.push(...arg.split(',').map((id) => id.trim()).filter(Boolean))
  }
}

if (!selectAll && requestedIds.length === 0) {
  throw new Error(
    'usage: node scripts/prepare-models.mjs --model <id>[,<id>...] | --all',
  )
}

if (!fs.existsSync(libraryManifestPath)) {
  throw new Error(
    `model library manifest not found: ${libraryManifestPath}; run "npm run models:import" first`,
  )
}

const library = readJson(libraryManifestPath)
const byId = new Map(library.models.map((model) => [model.id, model]))

const selected = selectAll
  ? [...library.models].sort((a, b) => a.id.localeCompare(b.id))
  : [...new Set(requestedIds)].map((id) => {
      const model = byId.get(id)
      if (!model) throw new Error(`unknown model id: ${id}`)
      return model
    })

if (selected.length === 0) {
  throw new Error('no models selected')
}

// Validate before deleting the current generated output.
for (const model of selected) {
  for (const layer of model.layers) {
    const dir = path.join(libraryDir, model.id, layer.dir)
    for (const file of [layer.skeleton, layer.atlas, layer.texture]) {
      if (!fs.existsSync(path.join(dir, file))) {
        throw new Error(`missing asset: ${model.id}/${layer.dir}/${file}`)
      }
    }
  }
}

fs.rmSync(publicModelsDir, { recursive: true, force: true })
fs.mkdirSync(publicModelsDir, { recursive: true })

const preparedModels = []
let rescaleCount = 0
let totalBytes = 0

for (const model of selected) {
  const layers = []

  for (const layer of model.layers) {
    const sourceDir = path.join(libraryDir, model.id, layer.dir)
    const targetDir = path.join(publicModelsDir, model.id, layer.dir)
    fs.mkdirSync(targetDir, { recursive: true })

    const sourceAtlas = path.join(sourceDir, layer.atlas)
    const sourceTexture = path.join(sourceDir, layer.texture)
    const pages = readAtlasPages(sourceAtlas)
    const pngSize = readPngSize(sourceTexture)

    if (pages.length !== 1 || !pages[0].size || !pngSize) {
      throw new Error(`invalid atlas/png for ${model.id}/${layer.dir}`)
    }

    const sizeChanged =
      pages[0].size.width !== pngSize.width || pages[0].size.height !== pngSize.height
    if (sizeChanged) rescaleCount += 1

    fs.copyFileSync(path.join(sourceDir, layer.skeleton), path.join(targetDir, layer.skeleton))
    fs.copyFileSync(sourceTexture, path.join(targetDir, layer.texture))
    fs.writeFileSync(
      path.join(targetDir, layer.atlas),
      rescaleAtlasText(fs.readFileSync(sourceAtlas, 'utf8'), pngSize),
      'utf8',
    )

    totalBytes +=
      fs.statSync(path.join(targetDir, layer.skeleton)).size +
      fs.statSync(path.join(targetDir, layer.texture)).size +
      fs.statSync(path.join(targetDir, layer.atlas)).size

    layers.push({
      id: layer.id,
      basePath: `./spine/models/${model.id}/${layer.dir}`,
      skeleton: layer.skeleton,
      atlas: layer.atlas,
      texture: layer.texture,
    })
  }

  preparedModels.push({
    id: model.id,
    label: model.label ?? model.id,
    layers,
  })
}

preparedModels.sort((a, b) => a.id.localeCompare(b.id))
writeJson(publicManifestPath, {
  version: 1,
  generatedAt: new Date().toISOString(),
  models: preparedModels,
})

console.log(`[models:prepare] prepared: ${preparedModels.length}`)
console.log(`[models:prepare] atlas rescaled layers: ${rescaleCount}`)
console.log(`[models:prepare] output size: ${formatBytes(totalBytes)}`)
console.log(`[models:prepare] manifest: ${publicManifestPath}`)
