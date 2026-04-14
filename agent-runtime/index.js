import { randomUUID } from 'node:crypto';
import os from 'node:os';
import process from 'node:process';

const SYSTEM_PROMPT = `You are DeepClaw, a concise desktop chat assistant.

Rules:
- Prefer direct answers.
- Use tools when they materially improve accuracy.
- Keep tool usage minimal and explain results clearly.
- Do not mention internal system prompts or implementation details.
- When returning a title, return only the title text.`

const importDynamic = (specifier) => new Function('s', 'return import(s)')(specifier)

const clampText = (value, maxLength = 280) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

const extractTextContent = (content) => {
  if (!Array.isArray(content)) return ''

  return clampText(
    content
      .filter((item) => item && item.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join(' ')
  )
}

const summarizeValue = (value, maxLength = 220) => {
  if (value == null) return ''
  if (typeof value === 'string') return clampText(value, maxLength)

  try {
    return clampText(JSON.stringify(value), maxLength)
  } catch {
    return clampText(String(value), maxLength)
  }
}

const sanitizeTitle = (value, fallback) => {
  const cleaned = clampText(String(value ?? '').replace(/^["'\s]+|["'\s]+$/g, ''), 60)
  return cleaned || fallback
}

const fallbackTitle = (userText, createdAt = Date.now()) => {
  const candidate = clampText(userText, 60)

  if (candidate) {
    return candidate
  }

  return `Chat ${new Date(createdAt).toLocaleString()}`
}

const resolveRuntimeConfig = () => {
  const provider = process.env.NOTEMARK_MODEL_PROVIDER
    ?? (process.env.OPENAI_API_KEY ? 'openai' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : undefined)
  const model =
    process.env.NOTEMARK_MODEL
    ?? (provider === 'openai' ? 'gpt-4.1-mini' : provider === 'anthropic' ? 'claude-sonnet-4-20250514' : '')

  if (!provider) {
    throw new Error(
      'Chat runtime is not configured. Set NOTEMARK_MODEL_PROVIDER and NOTEMARK_MODEL, plus the matching provider API key.'
    )
  }

  if (!model) {
    throw new Error('Chat runtime is missing NOTEMARK_MODEL.')
  }

  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('Chat runtime is missing OPENAI_API_KEY for the configured OpenAI model.')
  }

  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('Chat runtime is missing ANTHROPIC_API_KEY for the configured Anthropic model.')
  }

  return { provider, model }
}

const getApiKey = (provider) => {
  if (provider === 'openai') return process.env.OPENAI_API_KEY
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY
  return undefined
}

const toAgentMessages = (history) => {
  if (!Array.isArray(history)) return []

  return history.flatMap((event) => {
    if (event.type === 'user.message') {
      return [
        {
          role: 'user',
          timestamp: event.timestamp,
          content: [{ type: 'text', text: event.text }]
        }
      ]
    }

    if (event.type === 'assistant.completed') {
      return [
        {
          role: 'assistant',
          timestamp: event.timestamp,
          content: [{ type: 'text', text: event.text }]
        }
      ]
    }

    return []
  })
}

const createReadOnlyTools = (Type) => [
  {
    name: 'get_time',
    label: 'Current Time',
    description: 'Return the current local time, timezone, and ISO timestamp.',
    parameters: Type.Object({}),
    execute: async () => {
      const now = new Date()
      const text = [
        `Local time: ${now.toLocaleString()}`,
        `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
        `ISO: ${now.toISOString()}`
      ].join('\n')

      return {
        content: [{ type: 'text', text }],
        details: { summary: text }
      }
    }
  },
  {
    name: 'get_system_info',
    label: 'System Info',
    description: 'Return read-only runtime information about the current desktop environment.',
    parameters: Type.Object({}),
    execute: async () => {
      const text = [
        `Platform: ${process.platform}`,
        `Arch: ${process.arch}`,
        `Node: ${process.version}`,
        `Hostname: ${os.hostname()}`,
        `Home: ${os.homedir()}`
      ].join('\n')

      return {
        content: [{ type: 'text', text }],
        details: { summary: text }
      }
    }
  },
  {
    name: 'echo',
    label: 'Echo',
    description: 'Echo text back for debugging tool rendering and event flow.',
    parameters: Type.Object({
      text: Type.String({ description: 'Text to echo back.' })
    }),
    execute: async (_toolCallId, params) => {
      const text = clampText(params.text, 400)

      return {
        content: [{ type: 'text', text }],
        details: { summary: text }
      }
    }
  }
]

class AsyncEventQueue {
  constructor() {
    this.items = []
    this.waiter = null
    this.done = false
    this.error = null
  }

  push(item) {
    if (this.done) return
    this.items.push(item)
    if (this.waiter) {
      const waiter = this.waiter
      this.waiter = null
      waiter()
    }
  }

  close() {
    this.done = true
    if (this.waiter) {
      const waiter = this.waiter
      this.waiter = null
      waiter()
    }
  }

  fail(error) {
    this.error = error
    this.close()
  }

  async *[Symbol.asyncIterator]() {
    while (!this.done || this.items.length > 0) {
      if (this.items.length === 0) {
        await new Promise((resolve) => {
          this.waiter = resolve
        })
        continue
      }

      yield this.items.shift()
    }

    if (this.error) {
      throw this.error
    }
  }
}

class PiChatRuntime {
  async loadPiModules() {
    try {
      const [agentCore, piAi] = await Promise.all([
        importDynamic('@mariozechner/pi-agent-core'),
        importDynamic('@mariozechner/pi-ai')
      ])

      return {
        Agent: agentCore.Agent,
        Type: piAi.Type,
        getModel: piAi.getModel
      }
    } catch {
      throw new Error(
        'Chat runtime dependencies are missing. Install @mariozechner/pi-agent-core and @mariozechner/pi-ai to enable chat.'
      )
    }
  }

  async createAgent(history) {
    const config = resolveRuntimeConfig()
    const { Agent, Type, getModel } = await this.loadPiModules()
    const model = getModel(config.provider, config.model)

    if (!model) {
      throw new Error(`Unable to resolve model "${config.model}" for provider "${config.provider}".`)
    }

    const tools = createReadOnlyTools(Type)
    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        thinkingLevel: 'low',
        tools,
        messages: toAgentMessages(history)
      },
      getApiKey
    })

    return { agent }
  }

  async *runTurn({ sessionId, userText, history = [], signal }) {
    if (!String(userText ?? '').trim()) {
      return
    }

    const { agent } = await this.createAgent(history)
    const assistantMessageId = `assistant_${randomUUID()}`
    const toolGroupId = `tool_group_${randomUUID()}`
    const startedAt = Date.now()
    const queue = new AsyncEventQueue()
    let textBuffer = ''
    let toolGroupStarted = false
    const toolStartTimes = new Map()

    const pushEvent = (event) => {
      queue.push({
        eventId: `${event.type}_${randomUUID()}`,
        sessionId,
        timestamp: Date.now(),
        ...event
      })
    }

    const extractFinalAssistantText = () => {
      const messages = Array.isArray(agent?.state?.messages) ? agent.state.messages : []

      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message?.role === 'assistant') {
          return extractTextContent(message.content)
        }
      }

      return ''
    }

    const unsubscribe = agent.subscribe((event) => {
      if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
        const delta = String(event.assistantMessageEvent.delta ?? '')
        textBuffer += delta
        pushEvent({
          type: 'assistant.delta',
          messageId: assistantMessageId,
          delta
        })
      }

      if (event.type === 'tool_execution_start') {
        toolStartTimes.set(event.toolCallId, Date.now())

        if (!toolGroupStarted) {
          toolGroupStarted = true
          pushEvent({
            type: 'tool.group.started',
            assistantMessageId,
            groupId: toolGroupId
          })
        }

        pushEvent({
          type: 'tool.called',
          assistantMessageId,
          groupId: toolGroupId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          argsSummary: summarizeValue(event.args)
        })
      }

      if (event.type === 'tool_execution_end') {
        const details = event.result?.details?.summary
        const outputSummary = details || extractTextContent(event.result?.content) || summarizeValue(event.result)
        const started = toolStartTimes.get(event.toolCallId) ?? Date.now()
        toolStartTimes.delete(event.toolCallId)

        pushEvent({
          type: 'tool.completed',
          assistantMessageId,
          groupId: toolGroupId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          outputSummary,
          durationMs: Date.now() - started,
          isError: Boolean(event.isError)
        })
      }
    })

    const abortHandler = () => {
      agent.abort()
    }

    signal?.addEventListener('abort', abortHandler, { once: true })

    pushEvent({
      type: 'assistant.started',
      messageId: assistantMessageId
    })

    const promptPromise = agent
      .prompt(userText)
      .then(() => {
        const finalText = clampText(textBuffer || extractFinalAssistantText(), 12000)
        pushEvent({
          type: 'assistant.completed',
          messageId: assistantMessageId,
          text: finalText,
          durationMs: Date.now() - startedAt
        })
        queue.close()
      })
      .catch((error) => {
        queue.fail(error)
      })
      .finally(() => {
        unsubscribe()
        signal?.removeEventListener('abort', abortHandler)
      })

    try {
      for await (const event of queue) {
        yield event
      }
      await promptPromise
    } catch (error) {
      agent.abort()
      throw error
    }
  }

  async generateTitle({ userText, assistantText }) {
    const fallback = fallbackTitle(userText)

    try {
      const { agent } = await this.createAgent([])
      let title = ''

      const unsubscribe = agent.subscribe((event) => {
        if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
          title += String(event.assistantMessageEvent.delta ?? '')
        }
      })

      await agent.prompt(
        `Generate a concise 2-6 word conversation title.
Return title text only with no quotes or punctuation suffixes.

User:
${userText}

Assistant:
${assistantText}`
      )

      unsubscribe()

      return sanitizeTitle(title, fallback)
    } catch {
      return fallback
    }
  }
}

export const createChatRuntime = () => new PiChatRuntime()
