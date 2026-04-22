import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mockAppPreferencesFilePath = ''

vi.mock('../agent/utils', () => ({
  resolveAppPreferencesFilePath: () => mockAppPreferencesFilePath
}))

const tempDirs: string[] = []

const createTempPath = async (): Promise<void> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'notemark-app-preferences-'))
  tempDirs.push(tempDir)
  mockAppPreferencesFilePath = path.join(tempDir, 'app-preferences.json')
}

const importModule = async () => import('./app-preferences')

beforeEach(async () => {
  vi.resetModules()
  await createTempPath()
})

afterEach(async () => {
  vi.resetModules()

  for (const tempDir of tempDirs.splice(0)) {
    await rm(tempDir, { recursive: true, force: true })
  }
})

describe('app preferences', () => {
  it('returns Chinese preferences by default', async () => {
    const { getAppPreferences } = await importModule()

    await expect(getAppPreferences()).resolves.toEqual({ locale: 'zh-CN' })
  })

  it('persists an English locale preference', async () => {
    const { saveAppPreferences } = await importModule()

    const preferences = await saveAppPreferences({ locale: 'en-US' })
    const persisted = JSON.parse(await readFile(mockAppPreferencesFilePath, 'utf8')) as {
      locale: string
    }

    expect(preferences).toEqual({ locale: 'en-US' })
    expect(persisted).toEqual({ locale: 'en-US' })
  })

  it('normalizes invalid saved locale values back to Chinese', async () => {
    await writeFile(
      mockAppPreferencesFilePath,
      `${JSON.stringify({ locale: 'fr-FR' }, null, 2)}\n`,
      'utf8'
    )

    const { getAppPreferences } = await importModule()

    await expect(getAppPreferences()).resolves.toEqual({ locale: 'zh-CN' })
  })

  it('keeps the current locale when saving unrelated partial preferences', async () => {
    const { saveAppPreferences } = await importModule()

    await saveAppPreferences({ locale: 'en-US' })
    await expect(saveAppPreferences({})).resolves.toEqual({ locale: 'en-US' })
  })

  it('recovers from malformed JSON with Chinese preferences', async () => {
    await writeFile(mockAppPreferencesFilePath, '{', 'utf8')

    const { getAppPreferences } = await importModule()

    await expect(getAppPreferences()).resolves.toEqual({ locale: 'zh-CN' })
  })
})
