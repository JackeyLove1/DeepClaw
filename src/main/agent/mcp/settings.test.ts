import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mcpConfigPath: '',
  clearMcpToolCache: vi.fn(),
  connect: vi.fn(),
  listTools: vi.fn(),
  closeClient: vi.fn(),
  closeTransport: vi.fn(),
  transportOptions: [] as unknown[]
}))

vi.mock('../utils', () => ({
  resolveMcpConfigPath: () => mocks.mcpConfigPath
}))

vi.mock('./client', () => ({
  clearMcpToolCache: mocks.clearMcpToolCache
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: mocks.connect,
    listTools: mocks.listTools,
    close: mocks.closeClient
  }))
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation((options: unknown) => {
    mocks.transportOptions.push(options)
    return {
      close: mocks.closeTransport
    }
  }),
  getDefaultEnvironment: () => ({ PATH: 'test-path' })
}))

const tempDirs: string[] = []

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'notemark-mcp-settings-'))
  tempDirs.push(tempDir)
  return tempDir
}

const importModule = async () => import('./settings')

const writeUserConfig = async (config: unknown): Promise<void> => {
  await mkdir(path.dirname(mocks.mcpConfigPath), { recursive: true })
  await writeFile(mocks.mcpConfigPath, JSON.stringify(config), 'utf8')
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.transportOptions.length = 0
  const tempDir = await createTempDir()
  mocks.mcpConfigPath = path.join(tempDir, '.deepclaw', 'mcp.json')
  mocks.connect.mockResolvedValue(undefined)
  mocks.listTools.mockResolvedValue({ tools: [{ name: 'lookup' }, { name: 'fetch' }] })
  mocks.closeClient.mockResolvedValue(undefined)
  mocks.closeTransport.mockResolvedValue(undefined)
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()

  for (const tempDir of tempDirs.splice(0)) {
    await rm(tempDir, { recursive: true, force: true })
  }
})

describe('MCP settings', () => {
  it('saves a new stdio connection to the user MCP config', async () => {
    const { saveMcpConnection } = await importModule()

    const settings = await saveMcpConnection({
      name: 'playwright',
      config: {
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
        env: { DEBUG: '1' }
      }
    })

    expect(settings.servers).toHaveLength(1)
    expect(settings.servers[0]).toMatchObject({
      name: 'playwright',
      config: {
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
        env: { DEBUG: '1' },
        disabled: false
      }
    })
    await expect(readFile(mocks.mcpConfigPath, 'utf8')).resolves.toContain('"playwright"')
    expect(mocks.clearMcpToolCache).toHaveBeenCalledOnce()
  })

  it('renames a connection without removing unrelated servers', async () => {
    await writeUserConfig({
      mcpServers: {
        old: { command: 'node' },
        keep: { command: 'uvx' }
      }
    })
    const { saveMcpConnection, listMcpConnections } = await importModule()

    await saveMcpConnection({
      originalName: 'old',
      name: 'new',
      config: {
        command: 'npx',
        disabled: true
      }
    })

    const settings = await listMcpConnections()
    expect(settings.servers.map((server) => server.name).sort()).toEqual(['keep', 'new'])
  })

  it('removes a connection from the user MCP config', async () => {
    await writeUserConfig({
      mcpServers: {
        one: { command: 'node' },
        two: { command: 'uvx' }
      }
    })
    const { removeMcpConnection } = await importModule()

    const settings = await removeMcpConnection('one')

    expect(settings.servers.map((server) => server.name)).toEqual(['two'])
    await expect(readFile(mocks.mcpConfigPath, 'utf8')).resolves.not.toContain('"one"')
  })

  it('reports disabled connections without starting a transport', async () => {
    await writeUserConfig({
      mcpServers: {
        disabled: { command: 'node', disabled: true }
      }
    })
    const { testMcpConnections } = await importModule()

    const statuses = await testMcpConnections()

    expect(statuses).toMatchObject([{ name: 'disabled', status: 'disabled', toolCount: 0 }])
    expect(mocks.connect).not.toHaveBeenCalled()
    expect(mocks.transportOptions).toHaveLength(0)
  })

  it('reports tool count and latency for healthy SDK connections', async () => {
    await writeUserConfig({
      mcpServers: {
        healthy: { command: 'node', args: ['server.js'], env: { TOKEN: 'abc' } }
      }
    })
    const { testMcpConnections } = await importModule()

    const statuses = await testMcpConnections()

    expect(statuses[0]).toMatchObject({
      name: 'healthy',
      status: 'ok',
      toolCount: 2,
      tools: ['lookup', 'fetch'],
      error: null
    })
    expect(statuses[0]?.latencyMs).toEqual(expect.any(Number))
    expect(mocks.transportOptions[0]).toMatchObject({
      command: 'node',
      args: ['server.js'],
      env: {
        PATH: 'test-path',
        TOKEN: 'abc'
      }
    })
  })
})
