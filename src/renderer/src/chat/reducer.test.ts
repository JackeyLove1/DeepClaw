import { describe, expect, it } from 'vitest'
import type { SessionSnapshot } from '@shared/models'
import {
  applyChatEvent,
  createInitialChatViewState,
  replaySession,
  selectVisibleSessions
} from './reducer'

describe('chat reducer', () => {
  it('replays transcript events and aggregates tool calls into one assistant turn', () => {
    const snapshot: SessionSnapshot = {
      meta: {
        id: 'session-1',
        title: 'New chat',
        createdAt: 1,
        updatedAt: 10,
        messageCount: 2,
        status: 'idle'
      },
      events: [
        {
          type: 'session.created',
          eventId: 'created',
          sessionId: 'session-1',
          timestamp: 1,
          meta: {
            id: 'session-1',
            title: 'New chat',
            createdAt: 1,
            updatedAt: 1,
            messageCount: 0,
            status: 'idle'
          }
        },
        {
          type: 'user.message',
          eventId: 'user',
          sessionId: 'session-1',
          timestamp: 2,
          messageId: 'user-1',
          text: 'hello',
          attachments: []
        },
        {
          type: 'assistant.started',
          eventId: 'assistant-start',
          sessionId: 'session-1',
          timestamp: 3,
          messageId: 'assistant-1'
        },
        {
          type: 'tool.group.started',
          eventId: 'group-start',
          sessionId: 'session-1',
          timestamp: 4,
          assistantMessageId: 'assistant-1',
          groupId: 'group-1'
        },
        {
          type: 'tool.called',
          eventId: 'tool-called',
          sessionId: 'session-1',
          timestamp: 5,
          assistantMessageId: 'assistant-1',
          groupId: 'group-1',
          requestRound: 1,
          toolCallId: 'tool-1',
          toolName: 'echo',
          argsSummary: '{"text":"hello"}'
        },
        {
          type: 'tool.completed',
          eventId: 'tool-completed',
          sessionId: 'session-1',
          timestamp: 6,
          assistantMessageId: 'assistant-1',
          groupId: 'group-1',
          requestRound: 1,
          toolCallId: 'tool-1',
          toolName: 'echo',
          outputSummary: 'hello',
          durationMs: 8,
          isError: false,
          artifacts: [
            {
              id: 'artifact-1',
              fileName: 'capture.jpg',
              mimeType: 'image/jpeg',
              filePath: 'C:/temp/capture.jpg',
              sizeBytes: 2048,
              width: 1280,
              height: 720
            }
          ],
          roundInputTokens: 12,
          roundOutputTokens: 6,
          roundCacheCreationTokens: 0,
          roundCacheReadTokens: 0,
          roundToolCallCount: 1
        },
        {
          type: 'assistant.delta',
          eventId: 'delta',
          sessionId: 'session-1',
          timestamp: 7,
          messageId: 'assistant-1',
          delta: 'Hi there'
        },
        {
          type: 'assistant.completed',
          eventId: 'assistant-completed',
          sessionId: 'session-1',
          timestamp: 8,
          messageId: 'assistant-1',
          text: 'Hi there',
          durationMs: 20
        }
      ]
    }

    const state = replaySession(snapshot)
    const assistant = state.transcript.find((entry) => entry.kind === 'assistant')

    expect(assistant?.kind).toBe('assistant')
    if (assistant?.kind === 'assistant') {
      expect(assistant.text).toBe('Hi there')
      expect(assistant.toolGroup?.calls).toHaveLength(1)
      expect(assistant.toolGroup?.summary).toContain('1 tool')
      expect(assistant.toolGroup?.calls[0]?.artifacts).toMatchObject([
        {
          id: 'artifact-1',
          fileName: 'capture.jpg',
          mimeType: 'image/jpeg'
        }
      ])
    }
  })

  it('ignores duplicated assistant delta events by event id', () => {
    const initial = createInitialChatViewState()
    const started = applyChatEvent(initial, {
      type: 'assistant.started',
      eventId: 'start',
      sessionId: 'session',
      timestamp: 1,
      messageId: 'assistant-1'
    })

    const deltaEvent = {
      type: 'assistant.delta' as const,
      eventId: 'same-delta',
      sessionId: 'session',
      timestamp: 2,
      messageId: 'assistant-1',
      delta: 'Hello'
    }

    const afterFirst = applyChatEvent(started, deltaEvent)
    const afterSecond = applyChatEvent(afterFirst, deltaEvent)
    const assistant = afterSecond.transcript.find((entry) => entry.kind === 'assistant')

    expect(assistant?.kind).toBe('assistant')
    if (assistant?.kind === 'assistant') {
      expect(assistant.text).toBe('Hello')
    }
  })

  it('keeps only the latest ten sessions for the sidebar', () => {
    const visible = selectVisibleSessions(
      Array.from({ length: 12 }, (_, index) => ({
        id: String(index),
        title: `Session ${index}`,
        createdAt: index,
        updatedAt: index,
        messageCount: index,
        status: 'idle' as const
      }))
    )

    expect(visible).toHaveLength(10)
    expect(visible[0]?.updatedAt).toBe(11)
    expect(visible[visible.length - 1]?.updatedAt).toBe(2)
  })

  it('renders cron deliveries as system transcript entries', () => {
    const initial = createInitialChatViewState()
    const state = applyChatEvent(initial, {
      type: 'cron.delivery',
      eventId: 'cron-delivery',
      sessionId: 'session-1',
      timestamp: 10,
      jobId: 'job-1',
      runId: 'run-1',
      jobName: 'Daily briefing',
      status: 'success',
      deliverTarget: 'origin_session',
      text: 'Summary ready'
    })

    expect(state.transcript).toHaveLength(1)
    expect(state.transcript[0]).toMatchObject({
      kind: 'system',
      tone: 'muted',
      text: 'Cron: Daily briefing\n\nSummary ready'
    })
  })

  it('stores user image attachments in transcript entries', () => {
    const initial = createInitialChatViewState()
    const state = applyChatEvent(initial, {
      type: 'user.message',
      eventId: 'user-image',
      sessionId: 'session-1',
      timestamp: 2,
      messageId: 'user-1',
      text: '',
      attachments: [
        {
          id: 'image-1',
          fileName: 'clipboard.png',
          mimeType: 'image/png',
          filePath: 'C:/temp/clipboard.png',
          sizeBytes: 1024,
          width: 800,
          height: 600
        }
      ]
    })

    expect(state.transcript[0]).toMatchObject({
      kind: 'user',
      attachments: [
        {
          id: 'image-1',
          fileName: 'clipboard.png',
          mimeType: 'image/png'
        }
      ]
    })
  })
})
