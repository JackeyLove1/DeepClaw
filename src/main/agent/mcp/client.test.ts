import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer: vi.fn(() => ({
      isEmpty: () => false,
      getSize: () => ({ width: 1, height: 1 })
    }))
  }
}))

const tempDirs: string[] = []

const createTempDir = async (): Promise<string> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'notemark-mcp-client-'))
  tempDirs.push(tempDir)
  return tempDir
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(async () => {
  vi.restoreAllMocks()
  vi.resetModules()

  for (const tempDir of tempDirs.splice(0)) {
    await rm(tempDir, { recursive: true, force: true })
  }
})

describe('MCP tool adapter', () => {
  it('namespaces the tool name and preserves the remote input schema', async () => {
    const { createMcpToolAdapter } = await import('./client')

    const tool = createMcpToolAdapter({
      serverName: 'playwright',
      tool: {
        name: 'browser_navigate',
        description: 'Navigate the browser',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string' }
          },
          required: ['url']
        }
      },
      invoke: async () => ({
        content: [{ type: 'text', text: 'ok' }]
      })
    })

    expect(tool.name).toBe('mcp__playwright__browser_navigate')
    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      required: ['url']
    })
    expect(tool.faultTolerance?.timeoutMs).toBe(120000)
  })

  it('assigns longer default timeouts to MCP tools', async () => {
    const { createMcpToolAdapter } = await import('./client')

    const genericTool = createMcpToolAdapter({
      serverName: 'custom',
      tool: {
        name: 'fetch_data'
      },
      invoke: async () => ({
        content: [{ type: 'text', text: 'ok' }]
      })
    })

    const playwrightTool = createMcpToolAdapter({
      serverName: 'playwright',
      tool: {
        name: 'browser_click'
      },
      invoke: async () => ({
        content: [{ type: 'text', text: 'ok' }]
      })
    })

    expect(genericTool.faultTolerance?.timeoutMs).toBe(60000)
    expect(playwrightTool.faultTolerance?.timeoutMs).toBe(90000)
  })

  it('serializes structured content when the MCP tool returns no text blocks', async () => {
    const { createMcpToolAdapter } = await import('./client')

    const tool = createMcpToolAdapter({
      serverName: 'playwright',
      tool: {
        name: 'browser_snapshot'
      },
      invoke: async () => ({
        structuredContent: {
          page: {
            title: 'Example'
          }
        }
      })
    })

    const result = await tool.execute('tool_mcp_structured', {})
    expect(result.content[0]?.text).toContain('"title": "Example"')
    expect(result.details.summary).toContain('"title": "Example"')
  })

  it('persists image content as chat artifacts', async () => {
    const { createMcpToolAdapter } = await import('./client')
    const tmpDir = await createTempDir()

    const tool = createMcpToolAdapter({
      serverName: 'playwright',
      tool: {
        name: 'browser_screenshot'
      },
      tmpDir,
      invoke: async () => ({
        content: [
          {
            type: 'image',
            mimeType: 'image/png',
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn9v0wAAAAASUVORK5CYII='
          }
        ]
      })
    })

    const result = await tool.execute('tool_mcp_image', {})
    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts?.[0]).toMatchObject({
      mimeType: 'image/png',
      width: 1,
      height: 1
    })
    await expect(readFile(result.artifacts?.[0]?.filePath || '', 'utf8')).resolves.toBeTruthy()
  })

  it('throws when the remote MCP result is marked as an error', async () => {
    const { createMcpToolAdapter } = await import('./client')

    const tool = createMcpToolAdapter({
      serverName: 'playwright',
      tool: {
        name: 'browser_click'
      },
      invoke: async () => ({
        isError: true,
        content: [{ type: 'text', text: 'Selector not found' }]
      })
    })

    await expect(tool.execute('tool_mcp_error', {})).rejects.toMatchObject({
      fault: expect.objectContaining({
        code: 'TOOL_EXECUTION_FAILED'
      })
    })
  })
})
