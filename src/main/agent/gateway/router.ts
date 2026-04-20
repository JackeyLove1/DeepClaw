import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ChatEvent } from '@shared/models'
import type { PendingImageAttachment, SendMessageInput } from '@shared/types'
import { ChatSupervisor } from '../../chat/supervisor'
import { ChatSessionStore } from '../../chat/session-store'
import { resolveTmpDir } from '../utils/paths'
import { buildSessionId } from './session-key'
import type { GatewayRouteResult, InboundMedia, InboundMessage, OutboundMessage } from './types'

type GatewayRouterOptions = {
  supervisor: ChatSupervisor
  store?: ChatSessionStore
  onSendFinal: (inbound: InboundMessage, outbound: OutboundMessage) => Promise<void>
  log?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => void
  tmpDir?: string
}

const isAssistantCompleted = (
  event: ChatEvent
): event is Extract<ChatEvent, { type: 'assistant.completed' }> => event.type === 'assistant.completed'

const isSessionError = (event: ChatEvent): event is Extract<ChatEvent, { type: 'session.error' }> =>
  event.type === 'session.error'

const parseSkills = (raw: Record<string, unknown>): string[] => {
  const value = raw.skills
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
}

const SUPPORTED_CHAT_IMAGE_TYPES = new Set<PendingImageAttachment['mimeType']>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
])

const MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024

const sanitizeSegment = (value: string): string => {
  const normalized = value.trim().replace(/[^\w.-]+/g, '_')
  return normalized || 'unknown'
}

const extensionFromMimeType = (mimeType?: string): string => {
  switch (mimeType?.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'audio/mpeg':
      return 'mp3'
    case 'audio/wav':
      return 'wav'
    case 'audio/amr':
      return 'amr'
    case 'audio/silk':
      return 'silk'
    case 'video/mp4':
      return 'mp4'
    default:
      return 'bin'
  }
}

const extensionFromName = (name?: string): string | null => {
  if (!name) {
    return null
  }
  const ext = path.extname(name).replace(/^\./, '').toLowerCase()
  return ext || null
}

const canDownloadFromUrl = (value?: string): boolean => {
  if (!value) {
    return false
  }
  return /^https?:\/\//i.test(value.trim())
}

const tryDecodeBase64Url = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed || !/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return null
  }
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim()
    return canDownloadFromUrl(decoded) ? decoded : null
  } catch {
    return null
  }
}

const resolveDownloadUrl = (value?: string): string | null => {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (canDownloadFromUrl(trimmed)) {
    return trimmed
  }
  const decoded = tryDecodeBase64Url(trimmed)
  if (decoded) {
    return decoded
  }
  return null
}

type PersistedInboundMedia = InboundMedia & {
  localPath: string
}

const normalizeUserText = (inbound: InboundMessage): string => {
  const trimmed = inbound.text.trim()
  if (trimmed) {
    return trimmed
  }
  const audioTranscript = inbound.media
    .filter((item) => item.kind === 'audio')
    .map((item) => item.transcript?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .trim()
  if (audioTranscript) {
    return audioTranscript
  }
  if (inbound.media.length > 0) {
    return `[media message: ${inbound.media.length} item(s)]`
  }
  return ''
}

export class GatewayRouter {
  private readonly supervisor: ChatSupervisor

  private readonly store: ChatSessionStore

  private readonly onSendFinal: GatewayRouterOptions['onSendFinal']

  private readonly log: Required<GatewayRouterOptions>['log']

  private readonly tmpDir: string

  constructor(options: GatewayRouterOptions) {
    this.supervisor = options.supervisor
    this.store = options.store ?? new ChatSessionStore()
    this.onSendFinal = options.onSendFinal
    this.log = options.log ?? (() => undefined)
    this.tmpDir = options.tmpDir ?? resolveTmpDir()
  }

  async normalizeAndDispatch(inbound: InboundMessage): Promise<GatewayRouteResult | null> {
    const userText = normalizeUserText(inbound)
    if (!userText) {
      this.log('warn', '[gateway] skip empty inbound message', {
        channel: inbound.channel,
        accountId: inbound.accountId,
        peerId: inbound.peerId
      })
      return null
    }

    const sessionId = buildSessionId(inbound)
    await this.ensureSessionExists(sessionId)

    const before = await this.supervisor.openSession(sessionId)
    const beforeIds = new Set(before.events.map((event) => event.eventId))
    const persistedMedia = await this.persistInboundMedia(inbound)

    const payload: SendMessageInput = {
      text: this.buildAgentUserText(userText, persistedMedia),
      attachments: await this.toImageAttachments(persistedMedia),
      skills: parseSkills(inbound.raw)
    }

    await this.supervisor.sendMessage(sessionId, payload)

    const after = await this.supervisor.openSession(sessionId)
    const newEvents = after.events.filter((event) => !beforeIds.has(event.eventId))
    const assistantCompleted = [...newEvents].reverse().find(isAssistantCompleted)
    if (!assistantCompleted) {
      const latestError = [...newEvents].reverse().find(isSessionError)
      throw new Error(latestError?.message ?? 'Agent finished without assistant.completed event.')
    }

    const outbound: OutboundMessage = {
      sessionId,
      text: assistantCompleted.text,
      channel: inbound.channel,
      accountId: inbound.accountId,
      peerId: inbound.peerId,
      senderId: inbound.senderId,
      isGroup: inbound.isGroup,
      raw: {
        sourceEventId: assistantCompleted.eventId,
        sourceMessageId: assistantCompleted.messageId
      }
    }

    await this.onSendFinal(inbound, outbound)
    return { sessionId, inbound, outbound }
  }

  private async persistInboundMedia(inbound: InboundMessage): Promise<PersistedInboundMedia[]> {
    if (inbound.media.length === 0) {
      return []
    }

    await mkdir(this.tmpDir, { recursive: true })
    const persisted: PersistedInboundMedia[] = []

    for (const [index, media] of inbound.media.entries()) {
      if (media.kind === 'audio' && media.transcript?.trim()) {
        // ASR text is already passed to the agent, skip persisting audio blobs for this case.
        continue
      }

      const filenameBase = [
        Date.now(),
        sanitizeSegment(inbound.channel),
        sanitizeSegment(inbound.accountId),
        sanitizeSegment(inbound.peerId),
        index + 1,
        randomUUID()
      ].join('-')

      const ext = extensionFromName(media.name) ?? extensionFromMimeType(media.mimeType)
      const targetPath = path.join(this.tmpDir, `${filenameBase}.${ext}`)
      const downloadUrl = resolveDownloadUrl(media.url)

      try {
        if (media.localPath?.trim()) {
          await copyFile(media.localPath, targetPath)
        } else if (downloadUrl) {
          const response = await fetch(downloadUrl, { method: 'GET' })
          if (!response.ok) {
            throw new Error(`download failed (${response.status})`)
          }
          const arrayBuffer = await response.arrayBuffer()
          await writeFile(targetPath, Buffer.from(arrayBuffer))
        } else {
          const fallbackPath = path.join(this.tmpDir, `${filenameBase}.txt`)
          const fallbackContent = [
            'Gateway media placeholder',
            `kind: ${media.kind}`,
            `mimeType: ${media.mimeType ?? ''}`,
            `name: ${media.name ?? ''}`,
            `sourceUrlOrToken: ${media.url ?? ''}`,
            'note: original media was not directly downloadable; keep this reference for follow-up retrieval.'
          ].join('\n')
          await writeFile(fallbackPath, fallbackContent, 'utf8')
          persisted.push({
            ...media,
            localPath: fallbackPath
          })
          continue
        }

        persisted.push({
          ...media,
          localPath: targetPath
        })
      } catch (error) {
        this.log('warn', '[gateway] failed to persist inbound media', {
          channel: inbound.channel,
          accountId: inbound.accountId,
          peerId: inbound.peerId,
          kind: media.kind,
          sourceUrl: media.url,
          sourceLocalPath: media.localPath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return persisted
  }

  private buildAgentUserText(userText: string, media: PersistedInboundMedia[]): string {
    if (media.length === 0) {
      return userText
    }
    const lines = media.map(
      (item, index) => `${index + 1}. kind=${item.kind}, path=${item.localPath}`
    )
    return [
      userText,
      '',
      '用户上传了媒体文件，本地路径如下：',
      ...lines
    ]
      .filter(Boolean)
      .join('\n')
  }

  private async toImageAttachments(media: PersistedInboundMedia[]): Promise<PendingImageAttachment[]> {
    const attachments: PendingImageAttachment[] = []
    for (const item of media) {
      if (item.kind !== 'image') {
        continue
      }
      const mimeType = item.mimeType?.toLowerCase() as PendingImageAttachment['mimeType'] | undefined
      if (!mimeType || !SUPPORTED_CHAT_IMAGE_TYPES.has(mimeType)) {
        continue
      }

      const fileStats = await stat(item.localPath).catch(() => null)
      if (!fileStats || !fileStats.isFile() || fileStats.size > MAX_CHAT_IMAGE_BYTES) {
        continue
      }
      try {
        const buffer = await readFile(item.localPath)
        attachments.push({
          id: randomUUID(),
          fileName: item.name ?? path.basename(item.localPath),
          mimeType,
          dataBase64: buffer.toString('base64'),
          sizeBytes: buffer.length
        })
      } catch {
        // Skip broken files so one bad media item does not block the whole turn.
      }
    }
    return attachments
  }

  private async ensureSessionExists(sessionId: string): Promise<void> {
    try {
      await this.store.readMeta(sessionId)
    } catch {
      await this.store.createSession(sessionId)
      this.log('info', '[gateway] created channel session', { sessionId })
    }
  }
}
