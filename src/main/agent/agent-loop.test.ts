import Database from 'better-sqlite3'
import { unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatEvent } from '@shared/models'
import { ChatSessionStore } from '../chat/session-store'
import type { Tool } from './tools'

const messagesCreateMock = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class AnthropicMock {
    messages = {
      create: messagesCreateMock
    }
  }

  return {
    default: AnthropicMock
  }
})

import { AnthropicChatRuntime } from './agent-loop'

const ORIGINAL_ENV = { ...process.env }
const cleanupDatabases: Database.Database[] = []

const resetEnv = (): void => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }
  Object.assign(process.env, ORIGINAL_ENV)
}

const toStream = (events: unknown[]): AsyncIterable<unknown> => {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event
      }
    }
  }
}

const createStore = (): ChatSessionStore => {
  const database = new Database(':memory:')
  cleanupDatabases.push(database)
  return new ChatSessionStore({ database })
}

afterEach(() => {
  resetEnv()
  messagesCreateMock.mockReset()

  for (const database of cleanupDatabases.splice(0)) {
    database.close()
  }
})

describe('AnthropicChatRuntime', () => {
  it('awaits async tool discovery before invoking Anthropic', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.NOTEMARK_MODEL_PROVIDER = 'anthropic'
    process.env.NOTEMARK_MODEL = 'claude-sonnet-4-5'

    messagesCreateMock.mockImplementation(async (params: { stream?: boolean; tools?: unknown[] }) => {
      if (!params.stream) {
        return {
          content: [{ type: 'text', text: 'pong' }]
        }
      }

      expect(params.tools).toMatchObject([
        expect.objectContaining({
          name: 'async_tool'
        })
      ])

      return toStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'ready' }
        }
      ])
    })

    const runtime = new AnthropicChatRuntime({
      toolsFactory: async () => [
        {
          name: 'async_tool',
          label: 'Async Tool',
          description: 'Loaded asynchronously',
          inputSchema: { type: 'object' },
          execute: async () => ({
            content: [{ type: 'text', text: 'ok' }],
            details: { summary: 'ok' }
          })
        }
      ]
    })

    const events: ChatEvent[] = []
    for await (const event of runtime.runTurn({
      sessionId: 's_async_tools',
      userText: 'hi',
      history: []
    })) {
      events.push(event)
    }

    expect(events.at(-1)).toMatchObject({
      type: 'assistant.completed',
      text: 'ready'
    })
  })

  it('maps streaming tool-use rounds to chat events', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.NOTEMARK_MODEL_PROVIDER = 'anthropic'
    process.env.NOTEMARK_MODEL = 'claude-sonnet-4-5'

    let streamRound = 0
    messagesCreateMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (!params.stream) {
        return {
          content: [{ type: 'text', text: 'pong' }]
        }
      }

      streamRound += 1
      if (streamRound === 1) {
        return toStream([
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' }
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Checking ' }
          },
          {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'tool_use',
              id: 'tool_1',
              name: 'get_time',
              input: {}
            }
          }
        ])
      }

      return toStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'done' }
        }
      ])
    })

    const runtime = new AnthropicChatRuntime()
    const history: ChatEvent[] = [
      {
        type: 'user.message',
        eventId: 'u_1',
        sessionId: 's_1',
        timestamp: 1,
        messageId: 'u_1',
        text: 'hi'
      }
    ]

    const events: ChatEvent[] = []
    for await (const event of runtime.runTurn({
      sessionId: 's_1',
      userText: 'hi',
      history
    })) {
      events.push(event)
    }

    expect(events.map((event) => event.type)).toEqual([
      'assistant.started',
      'assistant.delta',
      'tool.group.started',
      'tool.called',
      'tool.completed',
      'assistant.delta',
      'assistant.completed'
    ])

    const completed = events.find(
      (event): event is Extract<ChatEvent, { type: 'assistant.completed' }> => {
        return event.type === 'assistant.completed'
      }
    )
    const toolCompleted = events.find(
      (event): event is Extract<ChatEvent, { type: 'tool.completed' }> => {
        return event.type === 'tool.completed'
      }
    )

    expect(completed?.text).toBe('Checking done')
    expect(toolCompleted?.requestRound).toBe(1)
    expect(toolCompleted?.roundToolCallCount).toBe(1)
  })

  it('includes installed skills in the system prompt and records one usage row per skill per turn', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.NOTEMARK_MODEL_PROVIDER = 'anthropic'
    process.env.NOTEMARK_MODEL = 'claude-sonnet-4-5'

    const store = createStore()
    await store.createSession('s_skill')
    const skillDir = path.resolve('C:/Users/test/.deepclaw/skills/powerpoint')
    const skillFilePath = path.resolve(`${skillDir}/SKILL.md`)
    const readSkillTool: Tool = {
      name: 'read_file',
      label: 'Read file',
      description: 'Read a text file',
      inputSchema: { type: 'object' },
      execute: async () => ({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              path: skillFilePath,
              content: '1|---\n2|name: powerpoint',
              truncated: false
            })
          }
        ],
        details: {
          summary: JSON.stringify({
            path: skillFilePath,
            content: '1|---\n2|name: powerpoint',
            truncated: false
          })
        }
      })
    }

    let streamRound = 0
    messagesCreateMock.mockImplementation(async (params: { stream?: boolean; system?: string }) => {
      if (!params.stream) {
        return {
          content: [{ type: 'text', text: 'pong' }]
        }
      }

      streamRound += 1
      if (streamRound === 1) {
        return toStream([
          {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'tool_skill_1',
              name: 'read_file',
              input: { path: skillFilePath }
            }
          },
          {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'tool_use',
              id: 'tool_skill_2',
              name: 'read_file',
              input: { path: skillFilePath }
            }
          }
        ])
      }

      return toStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Skill loaded' }
        }
      ])
    })

    const runtime = new AnthropicChatRuntime({
      usageStore: store,
      installedSkills: [
        {
          skillId: 'powerpoint',
          name: 'powerpoint',
          description: 'Use this skill for slide workflows.',
          skillDir,
          skillFilePath,
          body: '# Powerpoint',
          tags: []
        }
      ],
      toolsFactory: () => [readSkillTool]
    })

    const events: ChatEvent[] = []
    for await (const event of runtime.runTurn({
      sessionId: 's_skill',
      userText: 'Please help with my presentation',
      history: []
    })) {
      events.push(event)
    }

    const firstCallArgs = messagesCreateMock.mock.calls[0]?.[0] as { system?: string }
    expect(firstCallArgs.system).toContain('Installed skills:')
    expect(firstCallArgs.system).toContain('powerpoint | powerpoint')
    expect(firstCallArgs.system).toContain('~/.deepclaw/skills/powerpoint/SKILL.md')

    const skillRecords = await store.listSkillUsageRecords()
    expect(skillRecords).toHaveLength(1)
    expect(skillRecords[0]?.skillId).toBe('powerpoint')
    expect(skillRecords[0]?.toolCallId).toBe('tool_skill_1')
    expect(events.at(-1)?.type).toBe('assistant.completed')
  })

  it('serializes tool image artifacts into Anthropic tool_result content blocks', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.NOTEMARK_MODEL_PROVIDER = 'anthropic'
    process.env.NOTEMARK_MODEL = 'claude-sonnet-4-5'

    const imagePath = path.join(os.tmpdir(), `notemark-tool-image-${Date.now()}.png`)
    await writeFile(
      imagePath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn9v0wAAAAASUVORK5CYII=',
        'base64'
      )
    )

    try {
      let streamRound = 0
      messagesCreateMock.mockImplementation(async (params: { stream?: boolean }) => {
        if (!params.stream) {
          return {
            content: [{ type: 'text', text: 'pong' }]
          }
        }

        streamRound += 1
        if (streamRound === 1) {
          return toStream([
            {
              type: 'content_block_start',
              index: 0,
              content_block: {
                type: 'tool_use',
                id: 'tool_image_1',
                name: 'artifact_tool',
                input: {}
              }
            }
          ])
        }

        return toStream([
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' }
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Analyzed image' }
          }
        ])
      })

      const artifactTool: Tool = {
        name: 'artifact_tool',
        label: 'Artifact Tool',
        description: 'Returns an image artifact',
        inputSchema: { type: 'object' },
        execute: async () => ({
          content: [{ type: 'text', text: 'Captured screenshot' }],
          artifacts: [
            {
              id: 'artifact-image',
              fileName: 'artifact.png',
              mimeType: 'image/png',
              filePath: imagePath,
              sizeBytes: 68,
              width: 1,
              height: 1
            }
          ],
          details: { summary: 'Captured screenshot' }
        })
      }

      const runtime = new AnthropicChatRuntime({
        toolsFactory: () => [artifactTool]
      })

      const events: ChatEvent[] = []
      for await (const event of runtime.runTurn({
        sessionId: 's_artifact',
        userText: 'Inspect the screen',
        history: []
      })) {
        events.push(event)
      }

      const toolCompleted = events.find(
        (event): event is Extract<ChatEvent, { type: 'tool.completed' }> =>
          event.type === 'tool.completed'
      )
      expect(toolCompleted?.artifacts).toHaveLength(1)

      const secondCallArgs = messagesCreateMock.mock.calls[1]?.[0] as {
        messages?: Array<{ role: string; content: unknown }>
      }
      const toolResultMessage = secondCallArgs.messages?.at(-1)
      expect(toolResultMessage?.role).toBe('user')
      expect(toolResultMessage?.content).toMatchObject([
        {
          type: 'tool_result',
          tool_use_id: 'tool_image_1',
          content: [
            {
              type: 'text',
              text: 'Captured screenshot'
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png'
              }
            }
          ]
        }
      ])
    } finally {
      await unlink(imagePath).catch(() => undefined)
    }
  })

  it('keeps canvas artifacts out of Anthropic tool_result image blocks', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.NOTEMARK_MODEL_PROVIDER = 'anthropic'
    process.env.NOTEMARK_MODEL = 'claude-sonnet-4-5'

    let streamRound = 0
    messagesCreateMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (!params.stream) {
        return {
          content: [{ type: 'text', text: 'pong' }]
        }
      }

      streamRound += 1
      if (streamRound === 1) {
        return toStream([
          {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'tool_canvas_1',
              name: 'canvas_tool',
              input: {}
            }
          }
        ])
      }

      return toStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Canvas ready' }
        }
      ])
    })

    const canvasTool: Tool = {
      name: 'canvas_tool',
      label: 'Canvas Tool',
      description: 'Returns a canvas artifact',
      inputSchema: { type: 'object' },
      execute: async () => ({
        content: [{ type: 'text', text: 'Saved canvas preview' }],
        artifacts: [
          {
            kind: 'canvas',
            id: 'canvas-1',
            title: 'Concept preview',
            fileName: 'index.html',
            mimeType: 'text/html',
            filePath: 'C:/temp/canvas/index.html',
            sizeBytes: 2048,
            createdAt: Date.now()
          }
        ],
        details: { summary: 'Saved canvas preview' }
      })
    }

    const runtime = new AnthropicChatRuntime({
      toolsFactory: () => [canvasTool]
    })

    const events: ChatEvent[] = []
    for await (const event of runtime.runTurn({
      sessionId: 's_canvas',
      userText: 'Build a concept explainer',
      history: []
    })) {
      events.push(event)
    }

    const toolCompleted = events.find(
      (event): event is Extract<ChatEvent, { type: 'tool.completed' }> =>
        event.type === 'tool.completed'
    )
    expect(toolCompleted?.artifacts).toHaveLength(1)

    const secondCallArgs = messagesCreateMock.mock.calls[1]?.[0] as {
      messages?: Array<{ role: string; content: unknown }>
    }
    const toolResultMessage = secondCallArgs.messages?.at(-1)
    expect(toolResultMessage?.role).toBe('user')
    expect(toolResultMessage?.content).toMatchObject([
      {
        type: 'tool_result',
        tool_use_id: 'tool_canvas_1',
        content: [
          {
            type: 'text',
            text: 'Saved canvas preview'
          }
        ]
      }
    ])
  })

  it('injects persistent memory and session memory into the system prompt', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.NOTEMARK_MODEL_PROVIDER = 'anthropic'
    process.env.NOTEMARK_MODEL = 'claude-sonnet-4-5'

    messagesCreateMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (!params.stream) {
        return {
          content: [{ type: 'text', text: 'pong' }]
        }
      }

      return toStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Using memory' }
        }
      ])
    })

    const runtime = new AnthropicChatRuntime()
    const latestUserMessage: ChatEvent = {
      type: 'user.message',
      eventId: 'u_latest',
      sessionId: 's_memory',
      timestamp: 3,
      messageId: 'u_latest',
      text: 'Continue from the summary'
    }

    const events: ChatEvent[] = []
    for await (const event of runtime.runTurn({
      sessionId: 's_memory',
      userText: 'Continue from the summary',
      persistentMemory:
        'SOUL (agent personality and values) [8% - 90/1100 chars]\n' +
        'Be concise and pragmatic.\n\n' +
        'MEMORY (your personal notes) [5% - 100/2200 chars]\n' +
        'Project uses pnpm.',
      sessionMemory: '## Goal\nContinue the migration',
      history: [latestUserMessage]
    })) {
      events.push(event)
    }

    const firstCallArgs = messagesCreateMock.mock.calls[0]?.[0] as {
      system?: string
      messages?: Array<{ role: string; content: unknown }>
    }

    expect(firstCallArgs.system).toContain('Persistent memory:')
    expect(firstCallArgs.system).toContain('SOUL (agent personality and values)')
    expect(firstCallArgs.system).toContain('Be concise and pragmatic.')
    expect(firstCallArgs.system).toContain('Project uses pnpm.')
    expect(firstCallArgs.system).toContain('Session memory:')
    expect(firstCallArgs.system).toContain('## Goal\nContinue the migration')
    expect(firstCallArgs.messages).toEqual([
      {
        role: 'user',
        content: 'Continue from the summary'
      }
    ])
    expect(events.at(-1)?.type).toBe('assistant.completed')
  })

  it('retries idempotent tools on transient faults and reports structured fault metadata', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.NOTEMARK_MODEL_PROVIDER = 'anthropic'
    process.env.NOTEMARK_MODEL = 'claude-sonnet-4-5'

    let streamRound = 0
    let executeAttempts = 0

    messagesCreateMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (!params.stream) {
        return {
          content: [{ type: 'text', text: 'pong' }]
        }
      }

      streamRound += 1
      if (streamRound === 1) {
        return toStream([
          {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'tool_retry_1',
              name: 'retry_tool',
              input: {}
            }
          }
        ])
      }

      return toStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Recovered' }
        }
      ])
    })

    const retryTool: Tool = {
      name: 'retry_tool',
      label: 'Retry Tool',
      description: 'Flaky but retryable tool',
      inputSchema: { type: 'object' },
      idempotent: true,
      faultTolerance: {
        maxRetries: 2,
        baseDelayMs: 0,
        maxJitterMs: 0,
        timeoutMs: 1_000
      },
      execute: async () => {
        executeAttempts += 1
        if (executeAttempts < 3) {
          throw new Error('network timeout while reaching upstream service')
        }

        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, value: 'done' }) }],
          details: { summary: 'done' }
        }
      }
    }

    const runtime = new AnthropicChatRuntime({
      toolsFactory: () => [retryTool]
    })

    const events: ChatEvent[] = []
    for await (const event of runtime.runTurn({
      sessionId: 's_retry',
      userText: 'retry this tool',
      history: []
    })) {
      events.push(event)
    }

    const toolCompleted = events.find(
      (event): event is Extract<ChatEvent, { type: 'tool.completed' }> =>
        event.type === 'tool.completed'
    )

    expect(executeAttempts).toBe(3)
    expect(toolCompleted).toBeDefined()
    expect(toolCompleted?.isError).toBe(false)
    expect(toolCompleted?.attemptCount).toBe(3)
    expect(toolCompleted?.retryCount).toBe(2)
    expect(toolCompleted?.validationStatus).toBe('skipped')
  })

  it('uses caller-provided maxTokens for streaming requests', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.NOTEMARK_MODEL_PROVIDER = 'anthropic'
    process.env.NOTEMARK_MODEL = 'claude-sonnet-4-5'

    messagesCreateMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (!params.stream) {
        return {
          content: [{ type: 'text', text: 'pong' }]
        }
      }

      return toStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'configured' }
        }
      ])
    })

    const runtime = new AnthropicChatRuntime()

    for await (const _event of runtime.runTurn({
      sessionId: 's_max_tokens',
      userText: 'use custom max tokens',
      maxTokens: 333,
      history: []
    })) {
      // exhaust stream
    }

    const request = messagesCreateMock.mock.calls[0]?.[0] as { max_tokens?: number }
    expect(request.max_tokens).toBe(333)
  })

  it('defaults streaming requests to 2048 tokens when maxTokens is omitted', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.NOTEMARK_MODEL_PROVIDER = 'anthropic'
    process.env.NOTEMARK_MODEL = 'claude-sonnet-4-5'

    messagesCreateMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (!params.stream) {
        return {
          content: [{ type: 'text', text: 'pong' }]
        }
      }

      return toStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'default' }
        }
      ])
    })

    const runtime = new AnthropicChatRuntime()

    for await (const _event of runtime.runTurn({
      sessionId: 's_default_max_tokens',
      userText: 'use default max tokens',
      history: []
    })) {
      // exhaust stream
    }

    const request = messagesCreateMock.mock.calls[0]?.[0] as { max_tokens?: number }
    expect(request.max_tokens).toBe(2048)
  })

  it('enables hidden reasoning params and uses larger default max tokens for DeepSeek models', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.NOTEMARK_MODEL_PROVIDER = 'anthropic'
    process.env.NOTEMARK_MODEL = 'deepseek-reasoner'

    messagesCreateMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (!params.stream) {
        return {
          content: [{ type: 'text', text: 'pong' }]
        }
      }

      return toStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'ready' }
        }
      ])
    })

    const runtime = new AnthropicChatRuntime({
      toolsFactory: () => []
    })

    for await (const _event of runtime.runTurn({
      sessionId: 's_deepseek_params',
      userText: 'hi',
      history: []
    })) {
      // exhaust stream
    }

    const request = messagesCreateMock.mock.calls[0]?.[0] as {
      max_tokens?: number
      thinking?: unknown
      output_config?: unknown
    }
    expect(request.max_tokens).toBe(8192)
    expect(request.thinking).toEqual({
      type: 'enabled',
      budget_tokens: 1024
    })
    expect(request.output_config).toEqual({
      effort: 'max'
    })
  })

  it('captures DeepSeek thinking blocks without emitting them as visible assistant text', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.NOTEMARK_MODEL_PROVIDER = 'anthropic'
    process.env.NOTEMARK_MODEL = 'deepseek-chat'

    messagesCreateMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (!params.stream) {
        return {
          content: [{ type: 'text', text: 'pong' }]
        }
      }

      return toStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'private ' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'reasoning' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'signature_delta', signature: 'sig-1' }
        },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'text', text: '' }
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text: 'final answer' }
        }
      ])
    })

    const runtime = new AnthropicChatRuntime({
      toolsFactory: () => []
    })

    const events: ChatEvent[] = []
    for await (const event of runtime.runTurn({
      sessionId: 's_deepseek_reasoning',
      userText: 'reason',
      history: []
    })) {
      events.push(event)
    }

    expect(events.filter((event) => event.type === 'assistant.delta')).toHaveLength(1)
    const completed = events.at(-1) as Extract<ChatEvent, { type: 'assistant.completed' }>
    expect(completed.text).toBe('final answer')
    expect(completed.reasoningText).toBe('private reasoning')
    expect(completed.providerTranscript).toEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'private reasoning',
            signature: 'sig-1'
          },
          {
            type: 'text',
            text: 'final answer'
          }
        ]
      }
    ])
  })

  it('keeps DeepSeek thinking blocks in tool-use continuation messages', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    process.env.NOTEMARK_MODEL_PROVIDER = 'anthropic'
    process.env.NOTEMARK_MODEL = 'deepseek-reasoner'

    let streamRound = 0
    messagesCreateMock.mockImplementation(async (params: { stream?: boolean }) => {
      if (!params.stream) {
        return {
          content: [{ type: 'text', text: 'pong' }]
        }
      }

      streamRound += 1
      if (streamRound === 1) {
        return toStream([
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'thinking', thinking: '' }
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'thinking_delta', thinking: 'need tool' }
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'signature_delta', signature: 'sig-tool' }
          },
          {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'tool_use',
              id: 'tool_deepseek_1',
              name: 'lookup',
              input: { query: 'x' }
            }
          }
        ])
      }

      return toStream([
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' }
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'done' }
        }
      ])
    })

    const runtime = new AnthropicChatRuntime({
      toolsFactory: () => [
        {
          name: 'lookup',
          label: 'Lookup',
          description: 'Lookup data',
          inputSchema: { type: 'object' },
          execute: async () => ({
            content: [{ type: 'text', text: 'tool output' }],
            details: { summary: 'tool output' }
          })
        }
      ]
    })

    for await (const _event of runtime.runTurn({
      sessionId: 's_deepseek_tool',
      userText: 'use tool',
      history: []
    })) {
      // exhaust stream
    }

    const secondCallArgs = messagesCreateMock.mock.calls[1]?.[0] as {
      messages?: Array<{ role: string; content: unknown }>
    }
    expect(secondCallArgs.messages).toMatchObject([
      {
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            thinking: 'need tool',
            signature: 'sig-tool'
          },
          {
            type: 'tool_use',
            id: 'tool_deepseek_1',
            name: 'lookup'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool_deepseek_1',
            content: 'tool output'
          }
        ]
      }
    ])
  })
})
