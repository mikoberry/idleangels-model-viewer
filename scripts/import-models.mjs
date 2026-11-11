import fs from 'node:fs'
import path from 'node:path'
import { spine } from '../src/spine-webgl.js'
import {
  defaultSourceDir,
  formatBytes,
  libraryDir,
  libraryManifestPath,
  readAtlasPages,
  readPngSize,
  writeJson,
} from './model-utils.mjs'

const sourceDir = path.resolve(process.env.MODEL_SOURCE_DIR ?? defaultSourceDir)
const sourceInfo = fs.statSync(sourceDir, { throwIfNoEntry: false })

if (!sourceInfo?.isDirectory()) {
  throw new Error(`model source directory not found: ${sourceDir}`)
}

function makeRegion() {
  const region = new spine.TextureAtlasRegion()
  region.name = 'fake'
  region.degrees = 0
  region.rotate = false
  region.u = 0
  region.v = 0
  region.u2 = 0.1
  region.v2 = 0.1
  region.originalWidth = 10
  region.originalHeight = 10
  region.width = 10
  region.height = 10
  region.offsetX = 0
  region.offsetY = 0
  region.texture = { getImage: () => ({ width: 2048, height: 2048 }) }
  return region
}

const attachmentLoader = {
  newRegionAttachment: (_skeletonData, name) => {
    const attachment = new spine.RegionAttachment(name)
    attachment.setRegion(makeRegion())
    return attachment
  },
  newMeshAttachment: (_skeletonData, name) => {
    const attachment = new spine.MeshAttachment(name)
    attachment.region = makeRegion()
    return attachment
  },
  newBoundingBoxAttachment: (_skeletonData, name) => new spine.BoundingBoxAttachment(name),
  newPathAttachment: (_skeletonData, name) => new spine.PathAttachment(name),
  newPointAttachment: (_skeletonData, name) => new spine.PointAttachment(name),
  newClippingAttachment: (_skeletonData, name) => new spine.ClippingAttachment(name),
}

function readSkeletonInfo(file) {
  const data = new spine.SkeletonBinary(attachmentLoader).readSkeletonData(
    fs.readFileSync(file),
  )
  return {
    version: data.version,
    animations: data.animations.map((animation) => animation.name),
  }
}

function filesByExtension(dir, extension) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
    .map((entry) => entry.name)
}

function inspectLayer(modelDir, layerName) {
  const layerDir = path.join(modelDir, layerName)
  if (!fs.existsSync(layerDir)) return { error: `missing ${layerName}/` }

  const skeletons = filesByExtension(layerDir, '.skel')
  const atlases = filesByExtension(layerDir, '.atlas')
  const textures = filesByExtension(layerDir, '.png')

  if (skeletons.length !== 1 || atlases.length !== 1 || textures.length !== 1) {
    return {
      error: `${layerName}: expected 1 skel/atlas/png, got ${skeletons.length}/${atlases.length}/${textures.length}`,
    }
  }

  const skeleton = skeletons[0]
  const atlas = atlases[0]
  const texture = textures[0]
  const skeletonPath = path.join(layerDir, skeleton)
  const atlasPath = path.join(layerDir, atlas)
  const texturePath = path.join(layerDir, texture)

  let skeletonInfo
  try {
    skeletonInfo = readSkeletonInfo(skeletonPath)
  } catch (error) {
    return { error: `${layerName}: skeleton parse failed: ${error.message}` }
  }

  if (skeletonInfo.version !== '3.8.99') {
    return { error: `${layerName}: unsupported skeleton version ${skeletonInfo.version}` }
  }

  if (!skeletonInfo.animations.includes('idle')) {
    return { error: `${layerName}: no idle animation` }
  }

  const pages = readAtlasPages(atlasPath)
  if (pages.length !== 1) {
    return { error: `${layerName}: expected 1 atlas page, got ${pages.length}` }
  }

  const page = pages[0]
  if (page.name !== texture) {
    return { error: `${layerName}: atlas page ${page.name} does not match ${texture}` }
  }

  const pngSize = readPngSize(texturePath)
  if (!pngSize) return { error: `${layerName}: invalid PNG ${texture}` }
  if (!page.size) return { error: `${layerName}: atlas has no page size` }

  const warnings = []
  if (page.size.width !== pngSize.width || page.size.height !== pngSize.height) {
    warnings.push(
      `${layerName}: atlas ${page.size.width}x${page.size.height} -> PNG ${pngSize.width}x${pngSize.height}`,
    )
  }

  return {
    layer: {
      id: layerName,
      dir: layerName,
      skeleton,
      atlas,
      texture,
      animations: skeletonInfo.animations,
    },
    warnings,
    pngSize,
  }
}

fs.mkdirSync(libraryDir, { recursive: true })

const modelIds = fs
  .readdirSync(sourceDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

const models = []
const rejected = []

for (const id of modelIds) {
  const modelDir = path.join(sourceDir, id)
  const layerNames = fs
    .readdirSync(modelDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  if (!layerNames.includes('angel') || !layerNames.includes('bg')) {
    rejected.push({ id, reason: 'not standard angel+bg' })
    continue
  }

  const bg = inspectLayer(modelDir, 'bg')
  const angel = inspectLayer(modelDir, 'angel')
  const error = bg.error ?? angel.error

  if (error) {
    rejected.push({ id, reason: error })
    continue
  }

  if (!angel.layer.animations.includes('action')) {
    rejected.push({ id, reason: 'angel has no action' })
    continue
  }

  const warnings = [...bg.warnings, ...angel.warnings]
  if (!bg.layer.animations.includes('action')) {
    warnings.push('bg has no action; only angel will play action')
  }

  const destination = path.join(libraryDir, id)
  fs.rmSync(destination, { recursive: true, force: true })
  for (const layerName of ['bg', 'angel']) {
    fs.cpSync(path.join(modelDir, layerName), path.join(destination, layerName), {
      recursive: true,
    })
  }

  models.push({
    id,
    label: id,
    layers: [bg.layer, angel.layer],
    warnings,
  })
}

writeJson(libraryManifestPath, {
  version: 1,
  source: sourceDir,
  importedAt: new Date().toISOString(),
  models,
})

writeJson(path.join(libraryDir, 'import-report.json'), {
  source: sourceDir,
  totalDirectories: modelIds.length,
  imported: models.length,
  rejected,
})

const totalBytes = models.reduce((sum, model) => {
  return (
    sum +
    model.layers.reduce((layerSum, layer) => {
      const dir = path.join(libraryDir, model.id, layer.dir)
      return (
        layerSum +
        fs
          .readdirSync(dir)
          .reduce((fileSum, file) => fileSum + fs.statSync(path.join(dir, file)).size, 0)
      )
    }, 0)
  )
}, 0)

const reasonCounts = new Map()
for (const item of rejected) {
  const reason = item.reason.startsWith('not standard') ? 'not standard angel+bg' : item.reason
  reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
}

console.log(`[models:import] source: ${sourceDir}`)
console.log(`[models:import] eligible: ${models.length}`)
console.log(`[models:import] rejected: ${rejected.length}`)
console.log(`[models:import] imported size: ${formatBytes(totalBytes)}`)
console.log('[models:import] rejection summary:')
for (const [reason, count] of [...reasonCounts].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${count}  ${reason}`)
}
console.log(`[models:import] manifest: ${libraryManifestPath}`)
console.log(`[models:import] report: ${path.join(libraryDir, 'import-report.json')}`)
