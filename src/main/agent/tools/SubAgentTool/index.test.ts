import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Tool } from '../types'

const runTurnMock = vi.hoisted(() => vi.fn())
const runtimeCtorMock = vi.hoisted(() => vi.fn())
const createReadOnlyToolsMock = vi.hoisted(() => vi.fn())
const createToolsAsyncMock = vi.hoisted(() => vi.fn())

vi.mock('../../agent-loop', () => ({
  AnthropicChatRuntime: class AnthropicChatRuntimeMock {
    constructor(options: unknown) {
      runtimeCtorMock(options)
    }

    runTurn(args: unknown) {
      return runTurnMock(args)
    }
  }
}))

vi.mock('../index', () => ({
  createReadOnlyTools: createReadOnlyToolsMock,
  createToolsAsync: createToolsAsyncMock
}))

import { createSubAgentTool } from './index'

const toStream = (events: unknown[]): AsyncIterable<unknown> => ({
  async *[Symbol.asyncIterator]() {
    for (const event of events) {
      yield event
    }
  }
})

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

describe('SubAgentTool', () => {
  beforeEach(() => {
    runTurnMock.mockReset()
    runtimeCtorMock.mockReset()
    createReadOnlyToolsMock.mockReset()
    createToolsAsyncMock.mockReset()

    createReadOnlyToolsMock.mockReturnValue([createToolStub('get_time')])
    createToolsAsyncMock.mockResolvedValue([
      createToolStub('get_time'),
      createToolStub('grep'),
      createToolStub('sub_agent')
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('forwards explicit max_tokens to the child runtime', async () => {
    runTurnMock.mockReturnValue(
      toStream([{ type: 'assistant.completed', text: 'child complete' }])
    )

    const result = await createSubAgentTool().execute('tool_sub_1', {
      task: 'inspect repo',
      max_tokens: 1234
    })

    expect(runTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userText: 'inspect repo',
        hasUserContent: true,
        maxTokens: 1234
      })
    )
    expect(result.content[0]?.text).toBe('child complete')
  })

  it('accepts injected task_id from the parent runtime', async () => {
    runTurnMock.mockReturnValue(toStream([{ type: 'assistant.completed', text: 'ok' }]))

    await expect(
      createSubAgentTool().execute('tool_sub_task_id', {
        task: 'inspect repo',
        task_id: 'session-1'
      })
    ).resolves.toMatchObject({
      content: [{ type: 'text', text: 'ok' }]
    })
  })

  it('defaults child max tokens to 4096', async () => {
    runTurnMock.mockReturnValue(toStream([{ type: 'assistant.completed', text: 'done' }]))

    await createSubAgentTool().execute('tool_sub_2', {
      task: 'summarize file'
    })

    expect(runTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 4096
      })
    )
  })

  it('surfaces session.error.message when the child fails without final text', async () => {
    runTurnMock.mockReturnValue(
      toStream([{ type: 'session.error', message: 'child runtime failed' }])
    )

    const result = await createSubAgentTool().execute('tool_sub_3', {
      task: 'failing subtask'
    })

    expect(result.content[0]?.text).toBe('Sub-agent error: child runtime failed')
    expect(result.details.summary).toBe('Sub-agent failed: child runtime failed')
  })

  it('deduplicates allowed_tools and excludes sub_agent recursion', async () => {
    runTurnMock.mockReturnValue(toStream([{ type: 'assistant.completed', text: 'ok' }]))

    const result = await createSubAgentTool().execute('tool_sub_4', {
      task: 'narrow tool set',
      allowed_tools: [' get_time ', 'get_time', 'sub_agent']
    })

    const runtimeOptions = runtimeCtorMock.mock.calls[0]?.[0] as {
      toolsFactory: () => Tool[]
    }
    expect(runtimeOptions.toolsFactory().map((tool) => tool.name)).toEqual(['get_time'])
    expect(result.details.toolCount).toBe(1)
  })

  it('returns a diagnostic error when the whitelist has no usable tools', async () => {
    const result = await createSubAgentTool().execute('tool_sub_5', {
      task: 'bad whitelist',
      allowed_tools: [' missing ', 'sub_agent', 'sub_agent']
    })

    expect(runtimeCtorMock).not.toHaveBeenCalled()
    expect(result.content[0]?.text).toContain('unknown tools: missing')
    expect(result.content[0]?.text).toContain('blocked tools: sub_agent')
    expect(result.details.invalidToolNames).toEqual(['missing'])
    expect(result.details.blockedToolNames).toEqual(['sub_agent'])
  })
})
