import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { AppPreferences, LocaleCode } from '@shared/types'
import { resolveAppPreferencesFilePath } from '../agent/utils'

const preferencesPath = resolveAppPreferencesFilePath()
const DEFAULT_LOCALE: LocaleCode = 'zh-CN'

const DEFAULT_PREFERENCES: AppPreferences = {
  locale: DEFAULT_LOCALE
}

const ensureFile = async (filePath: string, initialContents: string): Promise<void> => {
  await fs.mkdir(dirname(filePath), { recursive: true })

  try {
    await fs.access(filePath)
  } catch {
    await fs.writeFile(filePath, initialContents, 'utf8')
  }
}

const normalizeLocale = (value: unknown): LocaleCode => {
  if (value === 'zh-CN' || value === 'en-US') {
    return value
  }

  return DEFAULT_LOCALE
}

const normalizePreferences = (
  preferences: Partial<AppPreferences> | null | undefined
): AppPreferences => ({
  locale: normalizeLocale(preferences?.locale)
})

const readPreferencesFile = async (): Promise<AppPreferences> => {
  try {
    const source = await fs.readFile(preferencesPath, 'utf8')
    return normalizePreferences(JSON.parse(source) as Partial<AppPreferences>)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return DEFAULT_PREFERENCES
    }

    if (error instanceof SyntaxError) {
      return DEFAULT_PREFERENCES
    }

    throw error
  }
}

const writePreferencesFile = async (preferences: AppPreferences): Promise<void> => {
  await ensureFile(preferencesPath, `${JSON.stringify(DEFAULT_PREFERENCES, null, 2)}\n`)
  await fs.writeFile(preferencesPath, `${JSON.stringify(preferences, null, 2)}\n`, 'utf8')
}

export const getAppPreferences = async (): Promise<AppPreferences> => readPreferencesFile()

export const saveAppPreferences = async (
  preferences: Partial<AppPreferences>
): Promise<AppPreferences> => {
  const current = await readPreferencesFile()
  const normalized = normalizePreferences({
    ...current,
    ...preferences
  })

  await writePreferencesFile(normalized)
  return normalized
}
