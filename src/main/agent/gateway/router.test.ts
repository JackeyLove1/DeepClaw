import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatEvent } from '@shared/models'
import { ChatSessionStore } from '../../chat/session-store'
import { GatewayRouter } from './router'
import type { InboundMessage } from './types'

const cleanupDatabases: Database.Database[] = []
const cleanupDirs: string[] = []

const createStore = (): ChatSessionStore => {
  const database = new Database(':memory:')
  cleanupDatabases.push(database)
  return new ChatSessionStore({ database })
}

afterEach(() => {
  vi.clearAllMocks()
  for (const database of cleanupDatabases.splice(0)) {
    database.close()
  }
  return Promise.all(cleanupDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const buildInbound = (): InboundMessage => ({
  text: 'hello gateway',
  senderId: 'wx_user_01',
  channel: 'weixin',
  accountId: 'bot001',
  peerId: 'wx_user_01',
  isGroup: false,
  media: [],
  raw: { messageId: 'm-1' }
})

describe('GatewayRouter', () => {
  it('creates channel session and forwards final assistant reply', async () => {
    const store = createStore()
    const onSendFinal = vi.fn(async () => undefined)
    const supervisor = {
      openSession: vi.fn((sessionId: string) => store.openSession(sessionId)),
      sendMessage: vi.fn(async (sessionId: string, input: { text: string }) => {
        const now = Date.now()
        const startedEvent: ChatEvent = {
          type: 'assistant.started',
          eventId: `assistant.started_${now}`,
          sessionId,
          timestamp: now,
          messageId: 'assistant_1'
        }
        const completedEvent: ChatEvent = {
          type: 'assistant.completed',
          eventId: `assistant.completed_${now}`,
          sessionId,
          timestamp: now + 1,
          messageId: 'assistant_1',
          text: `echo:${input.text}`,
          durationMs: 1
        }
        await store.appendEvent(sessionId, startedEvent)
        await store.appendEvent(sessionId, completedEvent)
      })
    }

    const router = new GatewayRouter({
      supervisor: supervisor as never,
      store,
      onSendFinal
    })

    const result = await router.normalizeAndDispatch(buildInbound())
    expect(result?.sessionId).toBe('weixin:bot001:wx_user_01')
    expect(onSendFinal).toHaveBeenCalledTimes(1)
    const outboundArg = (onSendFinal.mock.calls[0] as unknown as Array<{ text: string }>)[1]
    expect(outboundArg?.text).toBe('echo:hello gateway')
  })

  it('throws when assistant completion is missing in this turn', async () => {
    const store = createStore()
    const supervisor = {
      openSession: vi.fn((sessionId: string) => store.openSession(sessionId)),
      sendMessage: vi.fn(async (sessionId: string) => {
        const event: ChatEvent = {
          type: 'session.error',
          eventId: 'session.error_test',
          sessionId,
          timestamp: Date.now(),
          message: 'runtime failed'
        }
        await store.appendEvent(sessionId, event)
      })
    }
    const router = new GatewayRouter({
      supervisor: supervisor as never,
      store,
      onSendFinal: vi.fn(async () => undefined)
    })

    await expect(router.normalizeAndDispatch(buildInbound())).rejects.toThrow('runtime failed')
  })

  it('persists inbound media and forwards local paths to agent payload', async () => {
    const store = createStore()
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'gateway-router-test-'))
    cleanupDirs.push(tmpDir)
    const sourceImagePath = path.join(tmpDir, 'source.jpg')
    await writeFile(sourceImagePath, Buffer.from('fake-image-data'))

    const supervisor = {
      openSession: vi.fn((sessionId: string) => store.openSession(sessionId)),
      sendMessage: vi.fn(async (sessionId: string, input: { text: string }) => {
        const now = Date.now()
        const completedEvent: ChatEvent = {
          type: 'assistant.completed',
          eventId: `assistant.completed_${now}`,
          sessionId,
          timestamp: now + 1,
          messageId: 'assistant_2',
          text: input.text,
          durationMs: 1
        }
        await store.appendEvent(sessionId, completedEvent)
      })
    }

    const router = new GatewayRouter({
      supervisor: supervisor as never,
      store,
      tmpDir,
      onSendFinal: vi.fn(async () => undefined)
    })

    const inbound = buildInbound()
    inbound.media = [
      {
        kind: 'image',
        mimeType: 'image/jpeg',
        name: 'from-user.jpg',
        localPath: sourceImagePath
      }
    ]
    inbound.text = ''

    await router.normalizeAndDispatch(inbound)

    expect(supervisor.sendMessage).toHaveBeenCalledTimes(1)
    const payload = supervisor.sendMessage.mock.calls[0]?.[1] as {
      text: string
      attachments: Array<{ mimeType: string; dataBase64: string }>
    }
    expect(payload.text).toContain('用户上传了媒体文件，本地路径如下：')
    expect(payload.text).toContain(tmpDir)
    expect(payload.attachments).toHaveLength(1)
    expect(payload.attachments[0]?.mimeType).toBe('image/jpeg')
    expect(payload.attachments[0]?.dataBase64.length).toBeGreaterThan(0)
  })

  it('sends audio transcript directly without media path payload', async () => {
    const store = createStore()
    const supervisor = {
      openSession: vi.fn((sessionId: string) => store.openSession(sessionId)),
      sendMessage: vi.fn(async (sessionId: string, input: { text: string }) => {
        const now = Date.now()
        const completedEvent: ChatEvent = {
          type: 'assistant.completed',
          eventId: `assistant.completed_${now}`,
          sessionId,
          timestamp: now + 1,
          messageId: 'assistant_3',
          text: input.text,
          durationMs: 1
        }
        await store.appendEvent(sessionId, completedEvent)
      })
    }

    const router = new GatewayRouter({
      supervisor: supervisor as never,
      store,
      onSendFinal: vi.fn(async () => undefined)
    })

    const inbound = buildInbound()
    inbound.text = ''
    inbound.media = [
      {
        kind: 'audio',
        transcript: '这是语音转文字内容',
        url: 'non-http-token'
      }
    ]

    await router.normalizeAndDispatch(inbound)

    const payload = supervisor.sendMessage.mock.calls[0]?.[1] as {
      text: string
      attachments: unknown[]
    }
    expect(payload.text).toContain('这是语音转文字内容')
    expect(payload.text).not.toContain('本地路径如下')
    expect(payload.attachments).toHaveLength(0)
  })
})
