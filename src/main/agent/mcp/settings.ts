import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment
} from '@modelcontextprotocol/sdk/client/stdio.js'
import type {
  McpConnectionSettings,
  McpConnectionStatus,
  McpServerConfig as SharedMcpServerConfig,
  SaveMcpConnectionInput
} from '@shared/types'
import { clearMcpToolCache } from './client'
import {
  loadMcpConfig,
  normalizeMcpServerConfig,
  type McpConfig,
  type McpServerConfig
} from './config'

const MCP_HEALTH_TIMEOUT_MS = 30_000

const toSharedServerConfig = (config: McpServerConfig): SharedMcpServerConfig => ({
  command: config.command,
  args: config.args,
  env: config.env,
  cwd: config.cwd,
  disabled: config.disabled
})

const toConnectionSettings = (config: McpConfig, filePath: string): McpConnectionSettings => ({
  filePath,
  servers: Object.entries(config.mcpServers).map(([name, serverConfig]) => ({
    name,
    config: toSharedServerConfig(serverConfig)
  }))
})

const validateConnectionName = (name: string): string => {
  const normalized = name.trim()
  if (!normalized) {
    throw new Error('MCP connection name cannot be empty.')
  }

  return normalized
}

const normalizeSharedServerConfig = (config: SharedMcpServerConfig): McpServerConfig => {
  const command = String(config.command ?? '').trim()
  if (!command) {
    throw new Error('MCP command cannot be empty.')
  }

  const args = Array.isArray(config.args)
    ? config.args.map((value) => String(value).trim()).filter(Boolean)
    : undefined
  const envEntries = Object.entries(config.env ?? {})
    .map(([key, value]) => [key.trim(), String(value)] as const)
    .filter(([key]) => Boolean(key))

  return normalizeMcpServerConfig({
    command,
    args: args && args.length > 0 ? args : undefined,
    env: envEntries.length > 0 ? Object.fromEntries(envEntries) : undefined,
    cwd: config.cwd?.trim() || undefined,
    disabled: Boolean(config.disabled)
  })
}

const writeMcpConfig = async (filePath: string, config: McpConfig): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

const withTimeout = async <T>(task: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`MCP connection check timed out after ${timeoutMs}ms.`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([task, timeout])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

const testMcpConnection = async (
  name: string,
  config: McpServerConfig
): Promise<McpConnectionStatus> => {
  const checkedAt = Date.now()

  if (config.disabled) {
    return {
      name,
      status: 'disabled',
      latencyMs: null,
      toolCount: 0,
      tools: [],
      error: null,
      checkedAt
    }
  }

  const startedAt = Date.now()
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    cwd: config.cwd,
    env: {
      ...getDefaultEnvironment(),
      ...(config.env ?? {})
    },
    stderr: 'pipe'
  })
  const client = new Client(
    {
      name: 'DeepClaw',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  )

  try {
    const listed = await withTimeout(
      (async () => {
        await client.connect(transport)
        return client.listTools()
      })(),
      MCP_HEALTH_TIMEOUT_MS
    )

    const tools = listed.tools.map((tool) => tool.name).filter(Boolean)
    return {
      name,
      status: 'ok',
      latencyMs: Date.now() - startedAt,
      toolCount: tools.length,
      tools,
      error: null,
      checkedAt
    }
  } catch (error) {
    return {
      name,
      status: 'error',
      latencyMs: Date.now() - startedAt,
      toolCount: 0,
      tools: [],
      error: error instanceof Error ? error.message : String(error),
      checkedAt
    }
  } finally {
    await Promise.allSettled([client.close(), transport.close()])
  }
}

export const listMcpConnections = async (): Promise<McpConnectionSettings> => {
  const loaded = loadMcpConfig()
  return toConnectionSettings(loaded.config, loaded.filePath)
}

export const saveMcpConnection = async (
  input: SaveMcpConnectionInput
): Promise<McpConnectionSettings> => {
  const loaded = loadMcpConfig()
  const nextName = validateConnectionName(input.name)
  const requestedOriginalName = input.originalName?.trim() || null
  const originalName = requestedOriginalName ?? nextName
  const nextConfig = normalizeSharedServerConfig(input.config)
  const nextServers = { ...loaded.config.mcpServers }

  if (
    (!requestedOriginalName && nextServers[nextName]) ||
    (originalName !== nextName && nextServers[nextName])
  ) {
    throw new Error(`MCP connection "${nextName}" already exists.`)
  }

  if (originalName !== nextName) {
    delete nextServers[originalName]
  }

  nextServers[nextName] = nextConfig

  const nextConfigFile: McpConfig = { mcpServers: nextServers }
  await writeMcpConfig(loaded.filePath, nextConfigFile)
  await clearMcpToolCache()
  return toConnectionSettings(nextConfigFile, loaded.filePath)
}

export const removeMcpConnection = async (name: string): Promise<McpConnectionSettings> => {
  const loaded = loadMcpConfig()
  const targetName = validateConnectionName(name)
  const nextServers = { ...loaded.config.mcpServers }
  delete nextServers[targetName]

  const nextConfigFile: McpConfig = { mcpServers: nextServers }
  await writeMcpConfig(loaded.filePath, nextConfigFile)
  await clearMcpToolCache()
  return toConnectionSettings(nextConfigFile, loaded.filePath)
}

export const testMcpConnections = async (): Promise<McpConnectionStatus[]> => {
  const loaded = loadMcpConfig()
  return Promise.all(
    Object.entries(loaded.config.mcpServers).map(([name, config]) =>
      testMcpConnection(name, config)
    )
  )
}
