import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiChannelConfig } from '@shared/types'

let mockAiChannelsFilePath = ''
let mockEnvFilePath = ''

vi.mock('../agent/utils', () => ({
  resolveAiChannelsFilePath: () => mockAiChannelsFilePath,
  resolveEnvFilePath: () => mockEnvFilePath
}))

vi.mock('../agent', () => ({
  createChatRuntime: () => ({
    testConnection: async () => ({
      provider: 'anthropic',
      model: process.env.NOTEMARK_MODEL ?? '',
      baseUrl: process.env.ANTHROPIC_BASE_URL,
      latencyMs: 12,
      preview: 'pong'
    })
  })
}))

const ORIGINAL_ENV = { ...process.env }
const tempDirs: string[] = []

const resetEnv = (): void => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }

  Object.assign(process.env, ORIGINAL_ENV)
}

const createTempPaths = async (): Promise<void> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'notemark-ai-channels-'))
  tempDirs.push(tempDir)
  mockAiChannelsFilePath = path.join(tempDir, 'ai-channels.json')
  mockEnvFilePath = path.join(tempDir, '.env')
}

const importModule = async () => import('./ai-channel-settings')

const createChannel = (overrides: Partial<AiChannelConfig> = {}): AiChannelConfig => ({
  id: overrides.id ?? randomUUID(),
  name: overrides.name ?? 'Channel',
  baseUrl: overrides.baseUrl ?? 'https://example.test',
  apiKey: overrides.apiKey ?? 'key',
  model: overrides.model ?? 'claude-sonnet-4-5'
})

beforeEach(async () => {
  vi.resetModules()
  resetEnv()
  await createTempPaths()
})

afterEach(async () => {
  vi.resetModules()
  resetEnv()

  for (const tempDir of tempDirs.splice(0)) {
    await rm(tempDir, { recursive: true, force: true })
  }
})

describe('ai channel settings', () => {
  it('migrates a legacy .env into the first saved channel', async () => {
    await writeFile(
      mockEnvFilePath,
      [
        'ANTHROPIC_BASE_URL=https://legacy.example.test',
        'ANTHROPIC_API_KEY=legacy-key',
        'NOTEMARK_MODEL=claude-3-7-sonnet'
      ].join('\n'),
      'utf8'
    )

    const { getAiChannelSettings } = await importModule()
    const settings = await getAiChannelSettings()
    const persisted = JSON.parse(await readFile(mockAiChannelsFilePath, 'utf8')) as {
      channels: AiChannelConfig[]
      activeChannelId: string | null
    }

    expect(settings.channels).toHaveLength(1)
    expect(settings.channels[0]).toMatchObject({
      name: 'Default',
      baseUrl: 'https://legacy.example.test',
      apiKey: 'legacy-key',
      model: 'claude-3-7-sonnet'
    })
    expect(settings.activeChannelId).toBe(settings.channels[0]?.id)
    expect(persisted.activeChannelId).toBe(settings.channels[0]?.id)
  })

  it('persists channels and mirrors the active channel into env values', async () => {
    const channelA = createChannel({
      id: 'channel-a',
      name: 'OpenRouter Claude',
      baseUrl: 'https://openrouter.example.test/anthropic',
      apiKey: 'openrouter-key',
      model: 'claude-sonnet-4-5'
    })
    const channelB = createChannel({
      id: 'channel-b',
      name: 'GLM Claude',
      baseUrl: 'https://glm.example.test/anthropic',
      apiKey: 'glm-key',
      model: 'claude-opus-4-1'
    })

    const { saveAiChannelSettings } = await importModule()
    const settings = await saveAiChannelSettings({
      channels: [channelA, channelB],
      activeChannelId: channelB.id
    })
    const envSource = await readFile(mockEnvFilePath, 'utf8')

    expect(settings.activeChannelId).toBe(channelB.id)
    expect(envSource).toContain('ANTHROPIC_BASE_URL=https://glm.example.test/anthropic')
    expect(envSource).toContain('ANTHROPIC_API_KEY=glm-key')
    expect(envSource).toContain('NOTEMARK_MODEL=claude-opus-4-1')
    expect(envSource).toContain('NOTEMARK_MODEL_PROVIDER=anthropic')
    expect(process.env.ANTHROPIC_BASE_URL).toBe(channelB.baseUrl)
    expect(process.env.ANTHROPIC_API_KEY).toBe(channelB.apiKey)
    expect(process.env.NOTEMARK_MODEL).toBe(channelB.model)
  })

  it('switches the active channel and updates env mirroring', async () => {
    const channelA = createChannel({
      id: 'channel-a',
      name: 'A',
      baseUrl: 'https://one.example.test',
      apiKey: 'key-a',
      model: 'model-a'
    })
    const channelB = createChannel({
      id: 'channel-b',
      name: 'B',
      baseUrl: 'https://two.example.test',
      apiKey: 'key-b',
      model: 'model-b'
    })

    const { saveAiChannelSettings, setActiveAiChannel } = await importModule()
    await saveAiChannelSettings({
      channels: [channelA, channelB],
      activeChannelId: channelA.id
    })

    const settings = await setActiveAiChannel(channelB.id)
    const envSource = await readFile(mockEnvFilePath, 'utf8')

    expect(settings.activeChannelId).toBe(channelB.id)
    expect(envSource).toContain('ANTHROPIC_BASE_URL=https://two.example.test')
    expect(envSource).toContain('ANTHROPIC_API_KEY=key-b')
    expect(envSource).toContain('NOTEMARK_MODEL=model-b')
  })
})
