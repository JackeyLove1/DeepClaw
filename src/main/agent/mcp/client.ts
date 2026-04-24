import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { nativeImage } from 'electron'
import type { ChatImageAttachment } from '@shared/models'
import { ToolExecutionError } from '../tools/fault-tolerance'
import { getToolPriority } from '../tools/priorities'
import type { Tool, ToolExecuteResult, ToolInputSchema } from '../tools/types'
import { resolveTmpDir } from '../utils'
import { loadMcpConfig, type LoadedMcpConfig, type McpServerConfig } from './config'

type McpToolAnnotations = {
  title?: string
  readOnlyHint?: boolean
  idempotentHint?: boolean
}

type McpToolDefinition = {
  name: string
  description?: string
  title?: string
  inputSchema?: Record<string, unknown>
  annotations?: McpToolAnnotations
}

type McpContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource_link'; uri: string; name: string; title?: string; description?: string }
  | {
      type: 'resource'
      resource:
        | { uri: string; text: string; mimeType?: string }
        | { uri: string; blob: string; mimeType?: string }
    }

type McpCallToolResult = {
  content?: McpContentBlock[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

type McpServerRuntime = {
  serverName: string
  client: Client
  transport: StdioClientTransport
  tools: Tool[]
}

type McpSnapshot = {
  signature: string
  servers: McpServerRuntime[]
  tools: Tool[]
}

type McpToolAdapterOptions = {
  serverName: string
  tool: McpToolDefinition
  invoke: (params: Record<string, unknown>) => Promise<McpCallToolResult>
  tmpDir?: string
}

const DEFAULT_MCP_TIMEOUT_MS = 60_000
const DEFAULT_PLAYWRIGHT_TIMEOUT_MS = 90_000
const PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = 120_000

const SUPPORTED_IMAGE_MIME_TYPES = new Set<ChatImageAttachment['mimeType']>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
])

const MIME_TO_EXTENSION: Record<ChatImageAttachment['mimeType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

let cachedSnapshot: McpSnapshot | null = null
let inflightSnapshot: Promise<McpSnapshot> | null = null
let inflightSignature: string | null = null

const normalizeSegment = (value: string, fallback: string): string => {
  const normalized = value.trim().replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized || fallback
}

const toInputSchema = (value: unknown): ToolInputSchema => {
  if (value && typeof value === 'object' && (value as { type?: unknown }).type === 'object') {
    return value as ToolInputSchema
  }

  return {
    type: 'object',
    properties: {},
    additionalProperties: true
  }
}

const describeContentBlock = (block: McpContentBlock): string => {
  switch (block.type) {
    case 'text':
      return block.text
    case 'image':
      return `Image output (${block.mimeType})`
    case 'audio':
      return `Audio output (${block.mimeType})`
    case 'resource_link':
      return `Resource link: ${block.title || block.name || block.uri}`
    case 'resource':
      return `Resource: ${block.resource.uri}`
    default:
      return 'Unsupported MCP content block'
  }
}

const summarizeResultText = (result: McpCallToolResult): string => {
  const textParts =
    result.content
      ?.map((block) => describeContentBlock(block))
      .map((value) => value.trim())
      .filter(Boolean) ?? []

  if (textParts.length > 0) {
    return textParts.join('\n')
  }

  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    return JSON.stringify(result.structuredContent, null, 2)
  }

  return ''
}

const resolveMcpTimeoutMs = (serverName: string, toolName: string): number => {
  const normalizedServer = serverName.trim().toLowerCase()
  const normalizedTool = toolName.trim().toLowerCase()

  if (normalizedServer !== 'playwright') {
    return DEFAULT_MCP_TIMEOUT_MS
  }

  if (
    normalizedTool.includes('navigate') ||
    normalizedTool.includes('wait') ||
    normalizedTool.includes('snapshot') ||
    normalizedTool.includes('pdf')
  ) {
    return PLAYWRIGHT_NAVIGATION_TIMEOUT_MS
  }

  return DEFAULT_PLAYWRIGHT_TIMEOUT_MS
}

const measureImage = (buffer: Buffer): { width: number; height: number } => {
  const image = nativeImage.createFromBuffer(buffer)
  if (image.isEmpty()) {
    return { width: 0, height: 0 }
  }

  const { width, height } = image.getSize()
  return {
    width: Math.max(0, width),
    height: Math.max(0, height)
  }
}

const persistImageArtifact = async (
  block: Extract<McpContentBlock, { type: 'image' }>,
  tmpDir = resolveTmpDir()
): Promise<ChatImageAttachment | null> => {
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(block.mimeType as ChatImageAttachment['mimeType'])) {
    return null
  }

  const mimeType = block.mimeType as ChatImageAttachment['mimeType']
  const extension = MIME_TO_EXTENSION[mimeType]
  const imageId = randomUUID()
  const fileName = `${imageId}.${extension}`
  const filePath = path.join(tmpDir, fileName)
  const buffer = Buffer.from(block.data, 'base64')

  await mkdir(tmpDir, { recursive: true })
  await writeFile(filePath, buffer)

  const { width, height } = measureImage(buffer)
  return {
    id: imageId,
    fileName,
    mimeType,
    filePath,
    sizeBytes: buffer.length,
    width,
    height
  }
}

export const createMcpToolAdapter = (options: McpToolAdapterOptions): Tool => {
  const normalizedServer = normalizeSegment(options.serverName, 'server')
  const normalizedTool = normalizeSegment(options.tool.name, 'tool')
  const fullToolName = `mcp__${normalizedServer}__${normalizedTool}`

  return {
    name: fullToolName,
    label: options.tool.title || options.tool.annotations?.title || options.tool.name,
    description:
      options.tool.description?.trim() ||
      `MCP tool "${options.tool.name}" from server "${options.serverName}".`,
    priority: getToolPriority(fullToolName),
    idempotent: Boolean(
      options.tool.annotations?.readOnlyHint || options.tool.annotations?.idempotentHint
    ),
    faultTolerance: {
      timeoutMs: resolveMcpTimeoutMs(options.serverName, options.tool.name)
    },
    inputSchema: toInputSchema(options.tool.inputSchema),
    execute: async (_toolCallId, params) => {
      const result = await options.invoke(params)
      const content: ToolExecuteResult['content'] = []
      const artifacts: NonNullable<ToolExecuteResult['artifacts']> = []

      for (const block of result.content ?? []) {
        if (block.type === 'text') {
          if (block.text.trim()) {
            content.push({ type: 'text', text: block.text })
          }
          continue
        }

        if (block.type === 'image') {
          const artifact = await persistImageArtifact(block, options.tmpDir)
          if (artifact) {
            artifacts.push(artifact)
          } else {
            content.push({
              type: 'text',
              text: `Image output (${block.mimeType}) is not supported as a chat artifact.`
            })
          }
          continue
        }

        content.push({
          type: 'text',
          text: describeContentBlock(block)
        })
      }

      if (content.length === 0 && result.structuredContent) {
        content.push({
          type: 'text',
          text: JSON.stringify(result.structuredContent, null, 2)
        })
      }

      const outputSummary =
        summarizeResultText(result) || `MCP ${options.serverName}/${options.tool.name} completed.`

      if (result.isError) {
        throw new ToolExecutionError({
          code: 'TOOL_EXECUTION_FAILED',
          type: 'execution',
          stage: 'execution',
          retryable: false,
          message: outputSummary
        })
      }

      return {
        content,
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        details: {
          summary: outputSummary,
          serverName: options.serverName,
          remoteToolName: options.tool.name
        }
      }
    }
  }
}

const closeSnapshot = async (snapshot: McpSnapshot | null): Promise<void> => {
  if (!snapshot) {
    return
  }

  await Promise.allSettled(
    snapshot.servers.flatMap((server) => [server.client.close(), server.transport.close()])
  )
}

const connectServer = async (
  serverName: string,
  config: McpServerConfig
): Promise<McpServerRuntime | null> => {
  if (config.disabled) {
    return null
  }

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    cwd: config.cwd,
    env: {
      ...getDefaultEnvironment(),
      ...(config.env ?? {})
    },
    stderr: 'pipe'
  })
  const client = new Client(
    {
      name: 'DeepClaw',
      version: '1.0.0'
    },
    {
      capabilities: {}
    }
  )

  try {
    await client.connect(transport)
    const listed = await client.listTools()
    const tools = listed.tools.map((tool) =>
      createMcpToolAdapter({
        serverName,
        tool: tool as McpToolDefinition,
        invoke: async (params) =>
          (await client.callTool({
            name: tool.name,
            arguments: params
          })) as McpCallToolResult
      })
    )

    return {
      serverName,
      client,
      transport,
      tools
    }
  } catch (error) {
    await Promise.allSettled([client.close(), transport.close()])
    console.warn(`[mcp] failed to initialize server "${serverName}":`, error)
    return null
  }
}

const buildSnapshot = async (loaded: LoadedMcpConfig): Promise<McpSnapshot> => {
  const servers = await Promise.all(
    Object.entries(loaded.config.mcpServers).map(async ([serverName, config]) =>
      connectServer(serverName, config)
    )
  )
  const activeServers = servers.filter((server): server is McpServerRuntime => server !== null)

  return {
    signature: loaded.source ?? '',
    servers: activeServers,
    tools: activeServers.flatMap((server) => server.tools)
  }
}

export const clearMcpToolCache = async (): Promise<void> => {
  if (inflightSnapshot) {
    await inflightSnapshot.catch(() => undefined)
  }

  inflightSnapshot = null
  inflightSignature = null
  const snapshot = cachedSnapshot
  cachedSnapshot = null
  await closeSnapshot(snapshot)
}

export const createMcpTools = async (): Promise<Tool[]> => {
  const loaded = loadMcpConfig()
  const signature = loaded.source ?? ''

  if (cachedSnapshot && cachedSnapshot.signature === signature) {
    return cachedSnapshot.tools
  }

  if (inflightSnapshot && inflightSignature === signature) {
    const snapshot = await inflightSnapshot
    return snapshot.tools
  }

  inflightSignature = signature
  inflightSnapshot = buildSnapshot(loaded)

  try {
    const nextSnapshot = await inflightSnapshot
    const previousSnapshot = cachedSnapshot
    cachedSnapshot = nextSnapshot
    if (previousSnapshot && previousSnapshot.signature !== nextSnapshot.signature) {
      await closeSnapshot(previousSnapshot)
    }
    return nextSnapshot.tools
  } finally {
    inflightSnapshot = null
    inflightSignature = null
  }
}
