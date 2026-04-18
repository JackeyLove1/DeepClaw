import { randomUUID } from 'node:crypto'
import { mkdir, rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, nativeImage } from 'electron'
import type { ChatImageAttachment } from '@shared/models'
import type { PendingImageAttachment } from '@shared/types'

const CHAT_ATTACHMENTS_DIRNAME = 'chat-attachments'
const MAX_ATTACHMENTS_PER_MESSAGE = 5
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024

const MIME_TO_EXTENSION: Record<ChatImageAttachment['mimeType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

const SUPPORTED_CHAT_IMAGE_MIME_TYPES = new Set<ChatImageAttachment['mimeType']>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
])

const sanitizeFilename = (value: string, fallback: string): string => {
  const normalized = path.basename(value || fallback).replace(/[^\w.-]+/g, '_')
  return normalized || fallback
}

const getAttachmentsRootDir = (): string =>
  path.join(app.getPath('userData'), CHAT_ATTACHMENTS_DIRNAME)

const getSessionAttachmentDir = (sessionId: string): string =>
  path.join(getAttachmentsRootDir(), sessionId)

const ensureMimeType = (value: string): ChatImageAttachment['mimeType'] => {
  if (SUPPORTED_CHAT_IMAGE_MIME_TYPES.has(value as ChatImageAttachment['mimeType'])) {
    return value as ChatImageAttachment['mimeType']
  }

  throw new Error(`Unsupported image type: ${value}`)
}

const toBuffer = (attachment: PendingImageAttachment): Buffer => {
  try {
    const buffer = Buffer.from(attachment.dataBase64, 'base64')
    if (buffer.length === 0) {
      throw new Error('Image data is empty.')
    }
    return buffer
  } catch (error) {
    throw new Error(
      error instanceof Error ? `Invalid image data: ${error.message}` : 'Invalid image data.'
    )
  }
}

const measureImage = (buffer: Buffer): { width: number; height: number } => {
  const image = nativeImage.createFromBuffer(buffer)
  if (image.isEmpty()) {
    throw new Error('Clipboard image could not be decoded.')
  }

  const { width, height } = image.getSize()
  if (!width || !height) {
    throw new Error('Clipboard image size could not be determined.')
  }

  return { width, height }
}

export const savePendingImageAttachments = async (
  sessionId: string,
  attachments: PendingImageAttachment[]
): Promise<ChatImageAttachment[]> => {
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new Error(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} images per message.`)
  }

  if (attachments.length === 0) {
    return []
  }

  const sessionDir = getSessionAttachmentDir(sessionId)
  const createdPaths: string[] = []

  await mkdir(sessionDir, { recursive: true })

  try {
    const persisted: ChatImageAttachment[] = []

    for (const [index, attachment] of attachments.entries()) {
      const mimeType = ensureMimeType(attachment.mimeType)
      const buffer = toBuffer(attachment)

      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        throw new Error(`Image ${index + 1} exceeds the 8 MB limit.`)
      }

      const { width, height } = measureImage(buffer)
      const attachmentId = attachment.id.trim() || randomUUID()
      const extension = MIME_TO_EXTENSION[mimeType]
      const filePath = path.join(sessionDir, `${attachmentId}.${extension}`)
      const fallbackName = `image-${index + 1}.${extension}`
      const fileName = sanitizeFilename(attachment.fileName, fallbackName)

      await writeFile(filePath, buffer)
      createdPaths.push(filePath)

      persisted.push({
        id: attachmentId,
        fileName,
        mimeType,
        filePath,
        sizeBytes: buffer.length,
        width,
        height
      })
    }

    return persisted
  } catch (error) {
    await Promise.all(
      createdPaths.map(async (filePath) => {
        try {
          await unlink(filePath)
        } catch {
          // Best-effort cleanup for partially persisted attachments.
        }
      })
    )
    throw error
  }
}

export const removeSessionAttachmentDir = async (sessionId: string): Promise<void> => {
  await rm(getSessionAttachmentDir(sessionId), { recursive: true, force: true })
}
