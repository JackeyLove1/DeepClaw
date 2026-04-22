import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { ThirdPartyApiKeySettings } from '@shared/types'
import { resolveThirdPartyApiKeysFilePath } from '../agent/utils'

const TAVILY_API_KEY = 'TAVILY_API_KEY'

const settingsPath = resolveThirdPartyApiKeysFilePath()

const EMPTY_SETTINGS: ThirdPartyApiKeySettings = {
  tavilyApiKey: ''
}

const ensureFile = async (filePath: string, initialContents: string): Promise<void> => {
  await fs.mkdir(dirname(filePath), { recursive: true })

  try {
    await fs.access(filePath)
  } catch {
    await fs.writeFile(filePath, initialContents, 'utf8')
  }
}

const normalizeSettings = (
  settings: Partial<ThirdPartyApiKeySettings> | null | undefined
): ThirdPartyApiKeySettings => ({
  tavilyApiKey: String(settings?.tavilyApiKey ?? '').trim()
})

const readSettingsFile = async (): Promise<ThirdPartyApiKeySettings> => {
  try {
    const source = await fs.readFile(settingsPath, 'utf8')
    return normalizeSettings(JSON.parse(source) as Partial<ThirdPartyApiKeySettings>)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return EMPTY_SETTINGS
    }

    throw error
  }
}

const writeSettingsFile = async (settings: ThirdPartyApiKeySettings): Promise<void> => {
  await ensureFile(settingsPath, `${JSON.stringify(EMPTY_SETTINGS, null, 2)}\n`)
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

const applySettingsToProcessEnv = (settings: ThirdPartyApiKeySettings): void => {
  if (settings.tavilyApiKey) {
    process.env[TAVILY_API_KEY] = settings.tavilyApiKey
  } else {
    delete process.env[TAVILY_API_KEY]
  }
}

export const getThirdPartyApiKeySettings = async (): Promise<ThirdPartyApiKeySettings> =>
  readSettingsFile()

export const saveThirdPartyApiKeySettings = async (
  settings: ThirdPartyApiKeySettings
): Promise<ThirdPartyApiKeySettings> => {
  const normalized = normalizeSettings(settings)
  await writeSettingsFile(normalized)
  applySettingsToProcessEnv(normalized)
  return normalized
}

export const hydrateThirdPartyApiKeySettings = async (): Promise<void> => {
  applySettingsToProcessEnv(await readSettingsFile())
}
