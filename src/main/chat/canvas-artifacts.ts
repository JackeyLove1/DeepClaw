import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type { ChatCanvasArtifact } from '@shared/models'

const CHAT_CANVAS_DIRNAME = 'chat-canvas'

const sanitizePathSegment = (value: string, fallback: string): string => {
  const normalized = value.trim().replace(/[^\w.-]+/g, '_')
  return normalized || fallback
}

const sanitizeTitle = (value?: string | null): string => {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized || 'Canvas preview'
}

export const getCanvasArtifactsRootDir = (): string =>
  path.join(app.getPath('userData'), CHAT_CANVAS_DIRNAME)

export const getSessionCanvasDir = (sessionId: string): string =>
  path.join(getCanvasArtifactsRootDir(), sanitizePathSegment(sessionId, 'session'))

const assertCanvasArtifactPath = (filePath: string): string => {
  const rootDir = path.resolve(getCanvasArtifactsRootDir())
  const targetPath = path.resolve(filePath)
  const relativePath = path.relative(rootDir, targetPath)
  const isInsideRoot =
    relativePath.length > 0 && !relativePath.startsWith('..') && !relativePath.includes(':')

  if (!isInsideRoot || path.extname(targetPath).toLowerCase() !== '.html') {
    throw new Error('Canvas artifact path is outside the allowed canvas directory.')
  }

  return targetPath
}

export const saveCanvasArtifact = async ({
  sessionId,
  toolCallId,
  title,
  html
}: {
  sessionId: string
  toolCallId: string
  title?: string | null
  html: string
}): Promise<ChatCanvasArtifact> => {
  const safeSessionId = sanitizePathSegment(sessionId, 'session')
  const safeToolCallId = sanitizePathSegment(toolCallId, 'canvas')
  const artifactDir = path.join(getSessionCanvasDir(safeSessionId), safeToolCallId)
  const fileName = 'index.html'
  const filePath = path.join(artifactDir, fileName)
  const now = Date.now()

  await mkdir(artifactDir, { recursive: true })
  await writeFile(filePath, html, 'utf8')

  return {
    kind: 'canvas',
    id: safeToolCallId,
    title: sanitizeTitle(title),
    fileName,
    mimeType: 'text/html',
    filePath,
    sizeBytes: Buffer.byteLength(html, 'utf8'),
    createdAt: now
  }
}

export const readCanvasArtifactHtml = async (filePath: string): Promise<string> => {
  const validatedPath = assertCanvasArtifactPath(filePath)
  return readFile(validatedPath, 'utf8')
}

export const removeSessionCanvasDir = async (sessionId: string): Promise<void> => {
  await rm(getSessionCanvasDir(sessionId), { recursive: true, force: true })
}
