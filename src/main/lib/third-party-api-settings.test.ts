import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mockThirdPartyApiKeysFilePath = ''

vi.mock('../agent/utils', () => ({
  resolveThirdPartyApiKeysFilePath: () => mockThirdPartyApiKeysFilePath
}))

const ORIGINAL_ENV = { ...process.env }
const tempDirs: string[] = []

const resetEnv = (): void => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }

  Object.assign(process.env, ORIGINAL_ENV)
  delete process.env.TAVILY_API_KEY
}

const createTempPath = async (): Promise<void> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'notemark-third-party-keys-'))
  tempDirs.push(tempDir)
  mockThirdPartyApiKeysFilePath = path.join(tempDir, 'third-party-api-keys.json')
}

const importModule = async () => import('./third-party-api-settings')

beforeEach(async () => {
  vi.resetModules()
  resetEnv()
  await createTempPath()
})

afterEach(async () => {
  vi.resetModules()
  resetEnv()

  for (const tempDir of tempDirs.splice(0)) {
    await rm(tempDir, { recursive: true, force: true })
  }
})

describe('third-party API key settings', () => {
  it('returns empty settings by default', async () => {
    const { getThirdPartyApiKeySettings } = await importModule()

    await expect(getThirdPartyApiKeySettings()).resolves.toEqual({ tavilyApiKey: '' })
    expect(process.env.TAVILY_API_KEY).toBeUndefined()
  })

  it('persists a Tavily API key and updates process env', async () => {
    const { saveThirdPartyApiKeySettings } = await importModule()

    const settings = await saveThirdPartyApiKeySettings({ tavilyApiKey: ' tvly-test-key ' })
    const persisted = JSON.parse(await readFile(mockThirdPartyApiKeysFilePath, 'utf8')) as {
      tavilyApiKey: string
    }

    expect(settings).toEqual({ tavilyApiKey: 'tvly-test-key' })
    expect(persisted).toEqual({ tavilyApiKey: 'tvly-test-key' })
    expect(process.env.TAVILY_API_KEY).toBe('tvly-test-key')
  })

  it('hydrates a persisted Tavily API key into process env', async () => {
    await writeFile(
      mockThirdPartyApiKeysFilePath,
      `${JSON.stringify({ tavilyApiKey: 'tvly-persisted-key' }, null, 2)}\n`,
      'utf8'
    )

    const { hydrateThirdPartyApiKeySettings } = await importModule()
    await hydrateThirdPartyApiKeySettings()

    expect(process.env.TAVILY_API_KEY).toBe('tvly-persisted-key')
  })

  it('clears the Tavily API key from process env', async () => {
    process.env.TAVILY_API_KEY = 'tvly-old-key'
    const { saveThirdPartyApiKeySettings } = await importModule()

    const settings = await saveThirdPartyApiKeySettings({ tavilyApiKey: '' })

    expect(settings).toEqual({ tavilyApiKey: '' })
    expect(process.env.TAVILY_API_KEY).toBeUndefined()
  })
})
