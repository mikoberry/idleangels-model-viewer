import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const libraryDir = path.join(rootDir, 'model-library')
export const libraryManifestPath = path.join(libraryDir, 'models.json')
export const presetsPath = path.join(rootDir, 'model-presets.json')
export const publicModelsDir = path.join(rootDir, 'public', 'spine', 'models')
export const publicManifestPath = path.join(publicModelsDir, 'manifest.json')

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function readPngSize(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const header = Buffer.alloc(24)
    const read = fs.readSync(fd, header, 0, header.length, 0)
    if (read < 24 || header.toString('ascii', 1, 4) !== 'PNG') return null
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20),
    }
  } finally {
    fs.closeSync(fd)
  }
}

export function readAtlasPages(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n')
  const pages = []

  for (let i = 0; i < lines.length; i += 1) {
    const value = lines[i].trim()
    if (!value || /^\s/.test(lines[i]) || !/\.png$/i.test(value)) continue

    const page = { name: value, size: null }
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j += 1) {
      const match = lines[j].match(/^size:\s*(\d+)\s*,\s*(\d+)/)
      if (!match) continue
      page.size = { width: Number(match[1]), height: Number(match[2]) }
      break
    }
    pages.push(page)
  }

  return pages
}

export function rescaleAtlasText(text, actualSize) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let pageSize = null
  let pageSizeSeen = false
  let scaleX = 1
  let scaleY = 1

  return lines
    .map((line) => {
      const match = line.match(
        /^(\s*)(size|xy|orig|offset):\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
      )
      if (!match) return line

      const [, indent, key, rawX, rawY] = match

      if (key === 'size' && !pageSizeSeen) {
        pageSizeSeen = true
        pageSize = { width: Number(rawX), height: Number(rawY) }
        if (pageSize.width > 0 && pageSize.height > 0) {
          scaleX = actualSize.width / pageSize.width
          scaleY = actualSize.height / pageSize.height
        }
        return `${indent}size: ${actualSize.width},${actualSize.height}`
      }

      if (!pageSizeSeen) return line

      const x = Math.round(Number(rawX) * scaleX)
      const y = Math.round(Number(rawY) * scaleY)
      return `${indent}${key}: ${x}, ${y}`
    })
    .join('\n')
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
