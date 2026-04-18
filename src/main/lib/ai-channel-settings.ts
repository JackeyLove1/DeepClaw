import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { AiChannelConfig, AiChannelSettings, ConnectionCheckResult } from '@shared/types'
import { createChatRuntime } from '../agent'
import { resolveAiChannelsFilePath, resolveEnvFilePath } from '../agent/utils'

const ANTHROPIC_BASE_URL_KEY = 'ANTHROPIC_BASE_URL'
const ANTHROPIC_API_KEY = 'ANTHROPIC_API_KEY'
const PROVIDER_KEY = 'NOTEMARK_MODEL_PROVIDER'
const MODEL_KEY = 'NOTEMARK_MODEL'
const ACTIVE_PROVIDER = 'anthropic'
const DEFAULT_CHANNEL_NAME = 'Default'

const aiChannelsPath = resolveAiChannelsFilePath()
const deepclawEnvPath = resolveEnvFilePath()

const EMPTY_SETTINGS: AiChannelSettings = {
  channels: [],
  activeChannelId: null
}

const parseEnvEntries = (source: string): Map<string, string> => {
  const entries = new Map<string, string>()
  const lines = source.split(/\r?\n/)

  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue

    const [, key, rawValue] = match
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue
    entries.set(key, value)
  }

  return entries
}

const formatValue = (value: string): string => {
  if (!value) return '""'
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const buildUpdatedEnv = (currentEnvSource: string, updates: Record<string, string>): string => {
  const lines = currentEnvSource.split(/\r?\n/)
  const handled = new Set<string>()
  const nextLines = lines.map((line) => {
    const match = line.match(/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/)
    if (!match) return line

    const [, prefix, key, separator] = match
    const nextValue = updates[key]
    if (nextValue == null) return line
    handled.add(key)
    return `${prefix}${key}${separator}${formatValue(nextValue)}`
  })

  for (const [key, value] of Object.entries(updates)) {
    if (!handled.has(key)) {
      nextLines.push(`${key}=${formatValue(value)}`)
    }
  }

  const output = nextLines.join('\n')
  return output.endsWith('\n') ? output : `${output}\n`
}

const ensureFile = async (filePath: string, initialContents: string): Promise<void> => {
  await fs.mkdir(dirname(filePath), { recursive: true })

  try {
    await fs.access(filePath)
  } catch {
    await fs.writeFile(filePath, initialContents, 'utf8')
  }
}

const readDeepclawEnvFile = async (): Promise<string> => {
  await ensureFile(deepclawEnvPath, '')
  return fs.readFile(deepclawEnvPath, 'utf8')
}

const writeDeepclawEnvFile = async (source: string): Promise<void> => {
  await ensureFile(deepclawEnvPath, '')
  await fs.writeFile(deepclawEnvPath, source, 'utf8')
}

const sanitizeChannel = (channel: AiChannelConfig, index: number): AiChannelConfig => {
  const id = String(channel.id ?? '').trim() || randomUUID()
  const name = String(channel.name ?? '').trim()
  const baseUrl = String(channel.baseUrl ?? '').trim()
  const apiKey = String(channel.apiKey ?? '').trim()
  const model = String(channel.model ?? '').trim()

  if (!name) {
    throw new Error(`Channel ${index + 1} name cannot be empty.`)
  }

  if (!baseUrl) {
    throw new Error(`Channel ${index + 1} base URL cannot be empty.`)
  }

  if (!apiKey) {
    throw new Error(`Channel ${index + 1} API key cannot be empty.`)
  }

  if (!model) {
    throw new Error(`Channel ${index + 1} model cannot be empty.`)
  }

  return { id, name, baseUrl, apiKey, model }
}

const normalizeSettings = (settings: AiChannelSettings): AiChannelSettings => {
  const channels = Array.isArray(settings.channels)
    ? settings.channels.map((channel, index) => sanitizeChannel(channel, index))
    : []
  const channelIds = new Set(channels.map((channel) => channel.id))
  const requestedActiveChannelId =
    typeof settings.activeChannelId === 'string' ? settings.activeChannelId.trim() : null
  const activeChannelId =
    requestedActiveChannelId && channelIds.has(requestedActiveChannelId)
      ? requestedActiveChannelId
      : (channels[0]?.id ?? null)

  return { channels, activeChannelId }
}

export const getActiveAiChannel = (
  settings: AiChannelSettings
): AiChannelConfig | null => {
  const channelId = settings.activeChannelId
  if (!channelId) {
    return null
  }

  return settings.channels.find((channel) => channel.id === channelId) ?? null
}

const applyActiveChannelToProcessEnv = (channel: AiChannelConfig | null): void => {
  process.env[ANTHROPIC_BASE_URL_KEY] = channel?.baseUrl ?? ''
  process.env[ANTHROPIC_API_KEY] = channel?.apiKey ?? ''
  process.env[MODEL_KEY] = channel?.model ?? ''
  process.env[PROVIDER_KEY] = channel ? ACTIVE_PROVIDER : ''
}

const mirrorActiveChannelToEnvFile = async (channel: AiChannelConfig | null): Promise<void> => {
  const source = await readDeepclawEnvFile()
  const nextSource = buildUpdatedEnv(source, {
    [ANTHROPIC_BASE_URL_KEY]: channel?.baseUrl ?? '',
    [ANTHROPIC_API_KEY]: channel?.apiKey ?? '',
    [MODEL_KEY]: channel?.model ?? '',
    [PROVIDER_KEY]: channel ? ACTIVE_PROVIDER : ''
  })

  await writeDeepclawEnvFile(nextSource)
}

const readAiChannelSettingsFile = async (): Promise<AiChannelSettings | null> => {
  try {
    const source = await fs.readFile(aiChannelsPath, 'utf8')
    const parsed = JSON.parse(source) as Partial<AiChannelSettings>
    const channels = Array.isArray(parsed.channels) ? parsed.channels : []

    return normalizeSettings({
      channels: channels as AiChannelConfig[],
      activeChannelId:
        typeof parsed.activeChannelId === 'string' ? parsed.activeChannelId : null
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

const writeAiChannelSettingsFile = async (settings: AiChannelSettings): Promise<void> => {
  await ensureFile(aiChannelsPath, `${JSON.stringify(EMPTY_SETTINGS, null, 2)}\n`)
  await fs.writeFile(aiChannelsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

const readLegacyAnthropicChannel = async (): Promise<AiChannelConfig | null> => {
  const source = await readDeepclawEnvFile()
  const envEntries = parseEnvEntries(source)
  const baseUrl = envEntries.get(ANTHROPIC_BASE_URL_KEY)?.trim() ?? ''
  const apiKey = envEntries.get(ANTHROPIC_API_KEY)?.trim() ?? ''
  const model = envEntries.get(MODEL_KEY)?.trim() ?? ''

  if (!baseUrl || !apiKey || !model) {
    return null
  }

  return {
    id: randomUUID(),
    name: DEFAULT_CHANNEL_NAME,
    baseUrl,
    apiKey,
    model
  }
}

const loadAiChannelSettings = async (): Promise<AiChannelSettings> => {
  const stored = await readAiChannelSettingsFile()
  if (stored) {
    return stored
  }

  const legacyChannel = await readLegacyAnthropicChannel()
  if (!legacyChannel) {
    return EMPTY_SETTINGS
  }

  const migrated: AiChannelSettings = {
    channels: [legacyChannel],
    activeChannelId: legacyChannel.id
  }

  await writeAiChannelSettingsFile(migrated)
  return migrated
}

const persistAiChannelSettings = async (settings: AiChannelSettings): Promise<AiChannelSettings> => {
  const normalized = normalizeSettings(settings)
  const activeChannel = getActiveAiChannel(normalized)

  await writeAiChannelSettingsFile(normalized)
  await mirrorActiveChannelToEnvFile(activeChannel)
  applyActiveChannelToProcessEnv(activeChannel)

  return normalized
}

const withTemporaryAnthropicEnv = async <T>(
  channel: Pick<AiChannelConfig, 'baseUrl' | 'apiKey' | 'model'>,
  task: () => Promise<T>
): Promise<T> => {
  const previousValues = {
    [ANTHROPIC_BASE_URL_KEY]: process.env[ANTHROPIC_BASE_URL_KEY],
    [ANTHROPIC_API_KEY]: process.env[ANTHROPIC_API_KEY],
    [PROVIDER_KEY]: process.env[PROVIDER_KEY],
    [MODEL_KEY]: process.env[MODEL_KEY]
  }

  process.env[ANTHROPIC_BASE_URL_KEY] = channel.baseUrl
  process.env[ANTHROPIC_API_KEY] = channel.apiKey
  process.env[MODEL_KEY] = channel.model
  process.env[PROVIDER_KEY] = ACTIVE_PROVIDER

  try {
    return await task()
  } finally {
    for (const [key, value] of Object.entries(previousValues)) {
      if (typeof value === 'undefined') {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

export const getAiChannelSettings = async (): Promise<AiChannelSettings> => {
  const settings = await loadAiChannelSettings()
  const normalized = normalizeSettings(settings)

  if (
    normalized.activeChannelId !== settings.activeChannelId ||
    normalized.channels.length !== settings.channels.length
  ) {
    await writeAiChannelSettingsFile(normalized)
  }

  return normalized
}

export const saveAiChannelSettings = async (
  settings: AiChannelSettings
): Promise<AiChannelSettings> => persistAiChannelSettings(settings)

export const setActiveAiChannel = async (
  channelId: AiChannelConfig['id'] | null
): Promise<AiChannelSettings> => {
  const settings = await getAiChannelSettings()

  if (!channelId) {
    return persistAiChannelSettings({
      ...settings,
      activeChannelId: settings.channels[0]?.id ?? null
    })
  }

  const nextChannelId = channelId.trim()
  if (!settings.channels.some((channel) => channel.id === nextChannelId)) {
    throw new Error('Selected AI channel was not found.')
  }

  return persistAiChannelSettings({
    ...settings,
    activeChannelId: nextChannelId
  })
}

export const hydrateAiChannelSettings = async (): Promise<void> => {
  const settings = await getAiChannelSettings()
  applyActiveChannelToProcessEnv(getActiveAiChannel(settings))
}

export const testAiChannelConnection = async (
  channel: AiChannelConfig
): Promise<ConnectionCheckResult> => {
  const sanitized = sanitizeChannel(channel, 0)

  return withTemporaryAnthropicEnv(sanitized, async () => {
    const runtime = createChatRuntime()
    return runtime.testConnection()
  })
}
