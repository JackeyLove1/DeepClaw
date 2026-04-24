import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tool } from './types'

const createMcpToolsMock = vi.hoisted(() => vi.fn())

vi.mock('../mcp/index', () => ({
  createMcpTools: createMcpToolsMock
}))

const createToolStub = (name: string): Tool => ({
  name,
  label: name,
  description: `${name} tool`,
  inputSchema: { type: 'object' },
  execute: async () => ({
    content: [{ type: 'text', text: name }],
    details: { summary: name }
  })
})

describe('createToolsAsync', () => {
  beforeEach(() => {
    vi.resetModules()
    createMcpToolsMock.mockReset()
  })

  it('merges MCP tools with built-in tools', async () => {
    createMcpToolsMock.mockResolvedValue([createToolStub('mcp__playwright__browser_navigate')])

    const { createToolsAsync } = await import('./index')
    const tools = await createToolsAsync({ includeCronTool: false })

    expect(tools.some((tool) => tool.name === 'read_file')).toBe(true)
    expect(tools.some((tool) => tool.name === 'mcp__playwright__browser_navigate')).toBe(true)
  })

  it('recovers when MCP discovery fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    createMcpToolsMock.mockRejectedValue(new Error('boom'))

    const { createToolsAsync } = await import('./index')
    const tools = await createToolsAsync({ includeCronTool: false })

    expect(tools.some((tool) => tool.name === 'read_file')).toBe(true)
    expect(tools.some((tool) => tool.name.includes('mcp__'))).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
  })
})
