import { readFile } from 'node:fs/promises'
import type { ChatEvent, ProviderTranscriptMessage } from '@shared/models'
import type {
  ImageBlockParam,
  MessageParam,
  TextBlockParam
} from '@anthropic-ai/sdk/resources/messages'

export const clampText = (value: unknown, maxLength = 280): string => {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

export const clampTextPreserveLayout = (value: unknown, maxLength = 280): string => {
  const text = String(value ?? '')
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

export const extractTextContent = (content: unknown): string => {
  if (!Array.isArray(content)) return ''

  return clampText(
    content
      .filter(
        (item): item is { type: string; text: string } =>
          Boolean(item) &&
          typeof item === 'object' &&
          'type' in item &&
          'text' in item &&
          (item as { type?: unknown }).type === 'text' &&
          typeof (item as { text?: unknown }).text === 'string'
      )
      .map((item) => item.text)
      .join(' ')
  )
}

export const summarizeValue = (value: unknown, maxLength = 220): string => {
  if (value == null) return ''
  if (typeof value === 'string') return clampText(value, maxLength)

  try {
    return clampText(JSON.stringify(value), maxLength)
  } catch {
    return clampText(String(value), maxLength)
  }
}

export const sanitizeTitle = (value: unknown, fallback: string): string => {
  const cleaned = clampText(String(value ?? '').replace(/^["'\s]+|["'\s]+$/g, ''), 60)
  return cleaned || fallback
}

export const fallbackTitle = (userText: string, createdAt = Date.now()): string => {
  const candidate = clampText(userText, 60)

  if (candidate) {
    return candidate
  }

  return `Chat ${new Date(createdAt).toLocaleString()}`
}

const createUserContentBlocks = async (
  event: Extract<ChatEvent, { type: 'user.message' }>
): Promise<Array<TextBlockParam | ImageBlockParam>> => {
  const attachmentBlocks = await Promise.all(
    (event.attachments ?? []).map(async (attachment) => {
      const data = await readFile(attachment.filePath, { encoding: 'base64' })
      return {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: attachment.mimeType,
          data
        }
      }
    })
  )

  const text = event.text.trim()
  if (!text) {
    return attachmentBlocks
  }

  return [...attachmentBlocks, { type: 'text', text }]
}

type AnthropicMessageSerializationOptions = {
  includeProviderTranscript?: boolean
}

const isProviderTranscriptMessage = (value: unknown): value is ProviderTranscriptMessage => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const message = value as ProviderTranscriptMessage
  return (
    (message.role === 'user' || message.role === 'assistant') &&
    (typeof message.content === 'string' || Array.isArray(message.content))
  )
}

export const toAnthropicMessages = async (
  history: ChatEvent[],
  options: AnthropicMessageSerializationOptions = {}
): Promise<MessageParam[]> => {
  if (!Array.isArray(history)) return []

  const messages: MessageParam[] = []

  for (const event of history) {
    if (event.type === 'user.message') {
      const content = await createUserContentBlocks(event)
      if (content.length === 0) {
        continue
      }

      if (
        content.length === 1 &&
        content[0]?.type === 'text' &&
        typeof content[0].text === 'string'
      ) {
        messages.push({
          role: 'user',
          content: content[0].text
        })
        continue
      }

      messages.push({
        role: 'user',
        content
      })
      continue
    }

    if (event.type === 'assistant.completed') {
      if (options.includeProviderTranscript && Array.isArray(event.providerTranscript)) {
        messages.push(
          ...(event.providerTranscript.filter(isProviderTranscriptMessage) as MessageParam[])
        )
        continue
      }

      messages.push({
        role: 'assistant',
        content: event.text
      })
    }
  }

  return messages
}
