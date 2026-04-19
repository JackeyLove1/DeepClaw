import { z } from 'zod'
import { saveCanvasArtifact } from '../../../chat/canvas-artifacts'
import { ToolExecutionError } from '../fault-tolerance'
import { getToolPriority } from '../priorities'
import { defineTool, lazySchema, toolExecuteResultSchema } from '../schema'
import type { Tool, ToolErrorCode, ToolErrorType, ToolFailureStage } from '../types'

const canvasInputSchema = lazySchema(() =>
  z.strictObject({
    html: z.string().min(1),
    title: z.string().trim().min(1).max(120).optional(),
    task_id: z.string().trim().min(1).optional()
  })
)

const canvasOutputSchema = lazySchema(() => toolExecuteResultSchema)

const MAX_CANVAS_BYTES = 2 * 1024 * 1024
const DEFAULT_CANVAS_TITLE = 'Canvas preview'
const CANVAS_CSP =
  "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; media-src data: blob:;"
const URL_ATTRIBUTE_PATTERN = /\b(?:src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
const CSS_URL_PATTERN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi
const TITLE_PATTERN = /<title[^>]*>([\s\S]*?)<\/title>/i
const HEAD_OPEN_PATTERN = /<head\b[^>]*>/i
const HTML_OPEN_PATTERN = /<html\b[^>]*>/i
const BODY_OPEN_PATTERN = /<body\b[^>]*>/i
const CSP_META_PATTERN = /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi
const VIEWPORT_META_PATTERN = /<meta[^>]+name=["']viewport["'][^>]*>/gi
const BASE_TAG_PATTERN = /<base\b/i
const ALLOWED_EMBEDDED_REF_PATTERN = /^(?:#|data:|blob:|about:blank)$/i

const toToolError = (
  code: ToolErrorCode,
  type: ToolErrorType,
  stage: ToolFailureStage,
  message: string,
  details?: Record<string, unknown>
): ToolExecutionError =>
  new ToolExecutionError({
    code,
    type,
    stage,
    retryable: false,
    message,
    details
  })

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const stripTags = (value: string): string =>
  value
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const resolveCanvasTitle = (html: string, explicitTitle?: string): string => {
  const providedTitle = explicitTitle?.trim()
  if (providedTitle) {
    return providedTitle
  }

  const titleMatch = html.match(TITLE_PATTERN)
  const extractedTitle = stripTags(titleMatch?.[1] ?? '')
  return extractedTitle || DEFAULT_CANVAS_TITLE
}

const ensureCanvasSize = (html: string): void => {
  const sizeBytes = Buffer.byteLength(html, 'utf8')
  if (sizeBytes > MAX_CANVAS_BYTES) {
    throw toToolError(
      'TOOL_BAD_INPUT',
      'parameter',
      'input_validation',
      `Canvas HTML exceeds the 2 MiB limit (${sizeBytes} bytes).`,
      { sizeBytes, maxBytes: MAX_CANVAS_BYTES }
    )
  }
}

const validateReference = (rawValue: string, kind: string): void => {
  const normalized = rawValue.trim().replace(/^['"]|['"]$/g, '')
  if (!normalized || ALLOWED_EMBEDDED_REF_PATTERN.test(normalized)) {
    return
  }

  throw toToolError(
    'TOOL_BAD_INPUT',
    'parameter',
    'input_validation',
    `Canvas HTML must be self-contained. Disallowed ${kind} reference: ${normalized}`
  )
}

const assertSelfContainedHtml = (html: string): void => {
  if (BASE_TAG_PATTERN.test(html)) {
    throw toToolError(
      'TOOL_BAD_INPUT',
      'parameter',
      'input_validation',
      'Canvas HTML must not use a <base> tag.'
    )
  }

  for (const match of html.matchAll(URL_ATTRIBUTE_PATTERN)) {
    const candidate = match[1] ?? match[2] ?? match[3] ?? ''
    validateReference(candidate, match[0].split('=')[0]?.trim().toLowerCase() || 'url')
  }

  for (const match of html.matchAll(CSS_URL_PATTERN)) {
    const candidate = match[1] ?? match[2] ?? match[3] ?? ''
    validateReference(candidate, 'CSS url()')
  }
}

const ensureHtmlDocument = (html: string, title: string): string => {
  const trimmed = html.trim()
  if (/<(?:!doctype|html)\b/i.test(trimmed)) {
    return trimmed
  }

  if (BODY_OPEN_PATTERN.test(trimmed) || HEAD_OPEN_PATTERN.test(trimmed)) {
    return `<!DOCTYPE html>\n<html lang="en">\n${trimmed}\n</html>`
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `  <title>${escapeHtml(title)}</title>`,
    '</head>',
    '<body>',
    trimmed,
    '</body>',
    '</html>'
  ].join('\n')
}

const injectHeadTags = (html: string, title: string): string => {
  const nextTitle = escapeHtml(title)
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(CANVAS_CSP)}" />`
  const viewportTag = '<meta name="viewport" content="width=device-width, initial-scale=1" />'
  const titleTag = `<title>${nextTitle}</title>`

  let nextHtml = html.replace(CSP_META_PATTERN, '').replace(VIEWPORT_META_PATTERN, '')

  if (TITLE_PATTERN.test(nextHtml)) {
    nextHtml = nextHtml.replace(TITLE_PATTERN, titleTag)
  }

  const headPayload = [cspTag, viewportTag, TITLE_PATTERN.test(nextHtml) ? '' : titleTag]
    .filter(Boolean)
    .join('\n')

  if (HEAD_OPEN_PATTERN.test(nextHtml)) {
    return nextHtml.replace(HEAD_OPEN_PATTERN, (match) => `${match}\n${headPayload}\n`)
  }

  if (HTML_OPEN_PATTERN.test(nextHtml)) {
    return nextHtml.replace(
      HTML_OPEN_PATTERN,
      (match) => `${match}\n<head>\n${headPayload}\n</head>\n`
    )
  }

  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n${headPayload}\n</head>\n${nextHtml}\n</html>`
}

const normalizeCanvasHtml = (html: string, title?: string): { title: string; html: string } => {
  const resolvedTitle = resolveCanvasTitle(html, title)
  const fullDocument = ensureHtmlDocument(html, resolvedTitle)
  return {
    title: resolvedTitle,
    html: injectHeadTags(fullDocument, resolvedTitle)
  }
}

export function createCanvasTool(): Tool {
  return defineTool({
    name: 'canvas',
    label: 'Canvas Preview',
    description:
      'Save a self-contained HTML document for interactive concept explainers or website previews and expose it as a canvas artifact.',
    idempotent: false,
    faultTolerance: {
      maxRetries: 0,
      timeoutMs: 10_000
    },
    inputSchema: canvasInputSchema,
    outputSchema: canvasOutputSchema,
    priority: getToolPriority('canvas'),
    execute: async (toolCallId, params) => {
      ensureCanvasSize(params.html)
      assertSelfContainedHtml(params.html)

      const normalized = normalizeCanvasHtml(params.html, params.title)
      const artifact = await saveCanvasArtifact({
        sessionId: params.task_id ?? 'standalone',
        toolCallId,
        title: normalized.title,
        html: normalized.html
      })

      const summary = `Saved canvas preview "${artifact.title}" to ${artifact.filePath}`

      return {
        content: [{ type: 'text', text: summary }],
        artifacts: [artifact],
        details: {
          summary,
          title: artifact.title,
          filePath: artifact.filePath,
          sizeBytes: artifact.sizeBytes
        }
      }
    }
  })
}
