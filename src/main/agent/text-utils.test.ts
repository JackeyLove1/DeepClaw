import { unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ChatEvent } from '@shared/models'
import {
  clampText,
  clampTextPreserveLayout,
  extractTextContent,
  fallbackTitle,
  sanitizeTitle,
  summarizeValue,
  toAnthropicMessages
} from './text-utils'

describe('runtime text utils', () => {
  it('clamps and normalizes text content', () => {
    expect(clampText('  hello   world  ')).toBe('hello world')
    expect(clampText('abcdef', 4)).toBe('abc…')
  })

  it('clamps text while preserving markdown layout', () => {
    const value = '```ts\nconst a = 1\nconst b = 2\n```'
    expect(clampTextPreserveLayout(value)).toBe(value)
    expect(clampTextPreserveLayout('abcdef', 4)).toBe('abc…')
  })

  it('extracts text-only content from mixed content arrays', () => {
    const content = [
      { type: 'text', text: 'first' },
      { type: 'tool', text: 'ignored' },
      { type: 'text', text: 'second' }
    ]

    expect(extractTextContent(content)).toBe('first second')
  })

  it('summarizes objects and sanitizes generated titles', () => {
    expect(summarizeValue({ foo: 'bar' })).toContain('"foo":"bar"')
    expect(sanitizeTitle('  "Roadmap chat" ', 'fallback')).toBe('Roadmap chat')
    expect(sanitizeTitle('   ', 'fallback')).toBe('fallback')
  })

  it('creates fallback title and maps user/assistant messages only', async () => {
    const history: ChatEvent[] = [
      {
        type: 'session.created',
        eventId: 'e1',
        sessionId: 's1',
        timestamp: 1,
        meta: {
          id: 's1',
          title: 'New chat',
          createdAt: 1,
          updatedAt: 1,
          messageCount: 0,
          status: 'idle'
        }
      },
      {
        type: 'user.message',
        eventId: 'e2',
        sessionId: 's1',
        timestamp: 2,
        messageId: 'u1',
        text: 'Hello'
      },
      {
        type: 'assistant.completed',
        eventId: 'e3',
        sessionId: 's1',
        timestamp: 3,
        messageId: 'a1',
        text: 'Hi there',
        durationMs: 20
      }
    ]

    expect(fallbackTitle('')).toMatch(/^Chat /)
    await expect(toAnthropicMessages(history)).resolves.toEqual([
      {
        role: 'user',
        content: 'Hello'
      },
      {
        role: 'assistant',
        content: 'Hi there'
      }
    ])
  })

  it('serializes user image attachments into Anthropic image blocks', async () => {
    const imagePath = path.join(os.tmpdir(), `notemark-image-${Date.now()}.png`)
    await writeFile(
      imagePath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn9v0wAAAAASUVORK5CYII=',
        'base64'
      )
    )

    try {
      const history: ChatEvent[] = [
        {
          type: 'user.message',
          eventId: 'e-image',
          sessionId: 's1',
          timestamp: 2,
          messageId: 'u-image',
          text: 'What is in this image?',
          attachments: [
            {
              id: 'image-1',
              fileName: 'clipboard.png',
              mimeType: 'image/png',
              filePath: imagePath,
              sizeBytes: 68,
              width: 1,
              height: 1
            }
          ]
        }
      ]

      await expect(toAnthropicMessages(history)).resolves.toMatchObject([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png'
              }
            },
            {
              type: 'text',
              text: 'What is in this image?'
            }
          ]
        }
      ])
    } finally {
      await unlink(imagePath).catch(() => undefined)
    }
  })

  it('replays hidden provider transcripts only when requested', async () => {
    const history: ChatEvent[] = [
      {
        type: 'user.message',
        eventId: 'e-user',
        sessionId: 's1',
        timestamp: 1,
        messageId: 'u1',
        text: 'Solve this'
      },
      {
        type: 'assistant.completed',
        eventId: 'e-assistant',
        sessionId: 's1',
        timestamp: 2,
        messageId: 'a1',
        text: 'Answer only',
        durationMs: 10,
        reasoningText: 'private reasoning',
        providerTranscript: [
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
                text: 'Answer only'
              }
            ]
          }
        ]
      }
    ]

    await expect(toAnthropicMessages(history)).resolves.toEqual([
      {
        role: 'user',
        content: 'Solve this'
      },
      {
        role: 'assistant',
        content: 'Answer only'
      }
    ])

    await expect(
      toAnthropicMessages(history, { includeProviderTranscript: true })
    ).resolves.toEqual([
      {
        role: 'user',
        content: 'Solve this'
      },
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
            text: 'Answer only'
          }
        ]
      }
    ])
  })
})
