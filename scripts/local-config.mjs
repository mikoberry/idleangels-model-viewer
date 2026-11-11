import fs from 'node:fs'
import path from 'node:path'
import { rootDir } from './model-utils.mjs'

export const LOCAL_CONFIG_PATH = path.join(rootDir, 'local.config.json')

export function readLocalConfig() {
  if (!fs.existsSync(LOCAL_CONFIG_PATH)) return {}

  let value
  try {
    value = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf8'))
  } catch {
    throw new Error(`invalid local config: ${LOCAL_CONFIG_PATH}`)
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid local config: ${LOCAL_CONFIG_PATH}`)
  }

  return value
}

export function resolveConfiguredPath(envName, configKey) {
  const envValue = process.env[envName]?.trim()
  if (envValue) return path.resolve(envValue)

  const configValue = readLocalConfig()[configKey]
  if (typeof configValue !== 'string' || !configValue.trim()) return null

  return path.resolve(rootDir, configValue.trim())
}
