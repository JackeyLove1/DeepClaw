import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mockMcpConfigPath = ''

vi.mock('../utils', () => ({
  resolveMcpConfigPath: () => mockMcpConfigPath
}))

const tempDirs: string[] = []

const createTempPaths = async (): Promise<{
  tempDir: string
  userConfigPath: string
  bundledConfigPath: string
}> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'notemark-mcp-config-'))
  tempDirs.push(tempDir)

  return {
    tempDir,
    userConfigPath: path.join(tempDir, 'user', 'mcp.json'),
    bundledConfigPath: path.join(tempDir, 'bundled', 'mcp.json')
  }
}

const importModule = async () => import('./config')

beforeEach(async () => {
  vi.resetModules()
  const paths = await createTempPaths()
  mockMcpConfigPath = paths.userConfigPath
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()

  for (const tempDir of tempDirs.splice(0)) {
    await rm(tempDir, { recursive: true, force: true })
  }
})

describe('MCP config', () => {
  it('parses valid server config and normalizes cwd', async () => {
    const { parseMcpConfig } = await importModule()

    const parsed = parseMcpConfig(`{
      "mcpServers": {
        "playwright": {
          "command": "npx",
          "args": ["-y", "@playwright/mcp@latest"],
          "cwd": "."
        }
      }
    }`)

    expect(parsed.mcpServers.playwright).toMatchObject({
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest']
    })
    expect(path.isAbsolute(parsed.mcpServers.playwright.cwd || '')).toBe(true)
  })

  it('returns an empty config when the user file is missing', async () => {
    const { loadMcpConfig } = await importModule()

    expect(loadMcpConfig()).toEqual({
      config: { mcpServers: {} },
      source: null,
      filePath: mockMcpConfigPath
    })
  })

  it('returns an empty config when the user file is malformed', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await writeFile(mockMcpConfigPath, '{', 'utf8')

    const { loadMcpConfig } = await importModule()
    const loaded = loadMcpConfig()

    expect(loaded.config).toEqual({ mcpServers: {} })
    expect(loaded.source).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('seeds the bundled config when the user file does not exist', async () => {
    const { bundledConfigPath, userConfigPath } = await createTempPaths()
    await writeFile(
      bundledConfigPath,
      `${JSON.stringify({ mcpServers: { playwright: { command: 'npx' } } }, null, 2)}\n`,
      'utf8'
    )

    const { seedBundledMcpConfig } = await importModule()
    const result = seedBundledMcpConfig({
      bundledConfigPath,
      userConfigPath
    })

    expect(result).toEqual({
      sourcePath: bundledConfigPath,
      userPath: userConfigPath,
      copied: true
    })
    await expect(readFile(userConfigPath, 'utf8')).resolves.toContain('"playwright"')
  })

  it('preserves an existing user file when seeding', async () => {
    const { bundledConfigPath, userConfigPath } = await createTempPaths()
    await writeFile(
      bundledConfigPath,
      `${JSON.stringify({ mcpServers: { playwright: { command: 'npx' } } }, null, 2)}\n`,
      'utf8'
    )
    await writeFile(userConfigPath, '{"mcpServers":{"custom":{"command":"uvx"}}}\n', 'utf8')

    const { seedBundledMcpConfig } = await importModule()
    const result = seedBundledMcpConfig({
      bundledConfigPath,
      userConfigPath
    })

    expect(result.copied).toBe(false)
    await expect(readFile(userConfigPath, 'utf8')).resolves.toContain('"custom"')
  })
})
