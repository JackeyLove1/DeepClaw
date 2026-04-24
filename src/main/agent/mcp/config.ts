import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { resolveMcpConfigPath } from '../utils'

const mcpServerConfigSchema = z.strictObject({
  command: z.string().trim().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().trim().min(1).optional(),
  disabled: z.boolean().optional()
})

const mcpConfigSchema = z.strictObject({
  mcpServers: z.record(z.string(), mcpServerConfigSchema).default({})
})

export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>
export type McpConfig = z.infer<typeof mcpConfigSchema>

export type LoadedMcpConfig = {
  config: McpConfig
  source: string | null
  filePath: string
}

export type SeedMcpConfigResult = {
  sourcePath: string | null
  userPath: string
  copied: boolean
}

const EMPTY_CONFIG: McpConfig = { mcpServers: {} }

const expandUserHome = (targetPath: string): string => {
  if (targetPath === '~') {
    return os.homedir()
  }

  if (targetPath.startsWith('~/') || targetPath.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), targetPath.slice(2))
  }

  return targetPath
}

const resolveCandidatePath = (targetPath: string): string => {
  try {
    return fs.realpathSync(expandUserHome(targetPath))
  } catch {
    return path.resolve(expandUserHome(targetPath))
  }
}

export const normalizeMcpServerConfig = (server: McpServerConfig): McpServerConfig => ({
  command: server.command.trim(),
  args: server.args?.map((value) => value.trim()).filter(Boolean),
  env: server.env,
  cwd: server.cwd ? resolveCandidatePath(server.cwd) : undefined,
  disabled: server.disabled
})

export const parseMcpConfig = (source: string): McpConfig => {
  const parsed = JSON.parse(source) as unknown
  const result = mcpConfigSchema.safeParse(parsed)

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid MCP config: ${issues}`)
  }

  return {
    mcpServers: Object.fromEntries(
      Object.entries(result.data.mcpServers).map(([serverName, server]) => [
        serverName,
        normalizeMcpServerConfig(server)
      ])
    )
  }
}

export const loadMcpConfig = (filePath = resolveMcpConfigPath()): LoadedMcpConfig => {
  if (!fs.existsSync(filePath)) {
    return {
      config: EMPTY_CONFIG,
      source: null,
      filePath
    }
  }

  try {
    const source = fs.readFileSync(filePath, 'utf8')
    return {
      config: parseMcpConfig(source),
      source,
      filePath
    }
  } catch (error) {
    console.warn(`[mcp] failed to load ${filePath}:`, error)
    return {
      config: EMPTY_CONFIG,
      source: null,
      filePath
    }
  }
}

export const resolveBundledMcpConfigPath = (): string | null => {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(moduleDir, '..', 'mcp.json'),
    path.resolve(process.cwd(), 'src', 'main', 'agent', 'mcp.json')
  ]

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'mcp.json'))
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return resolveCandidatePath(candidate)
    }
  }

  return null
}

export const seedBundledMcpConfig = (
  options: {
    bundledConfigPath?: string | null
    userConfigPath?: string
  } = {}
): SeedMcpConfigResult => {
  const sourcePath = options.bundledConfigPath ?? resolveBundledMcpConfigPath()
  const userPath = options.userConfigPath ?? resolveMcpConfigPath()

  fs.mkdirSync(path.dirname(userPath), { recursive: true })

  if (!sourcePath || fs.existsSync(userPath)) {
    return {
      sourcePath,
      userPath,
      copied: false
    }
  }

  fs.copyFileSync(sourcePath, userPath)
  return {
    sourcePath,
    userPath,
    copied: true
  }
}
