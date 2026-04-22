import { tavily, type TavilyExtractOptions, type TavilySearchOptions } from '@tavily/core'
import { z } from 'zod'

import { ToolExecutionError } from '../fault-tolerance'
import { getToolPriority } from '../priorities'
import { defineTool, lazySchema, toolExecuteResultSchema } from '../schema'
import type { Tool, ToolErrorCode, ToolErrorType, ToolExecuteResult, ToolFailureStage } from '../types'

const searchDepthSchema = z.enum(['advanced', 'basic', 'fast', 'ultra-fast'])
const topicSchema = z.enum(['general', 'news', 'finance'])
const timeRangeSchema = z.enum(['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'])
const answerSchema = z.union([z.boolean(), z.enum(['basic', 'advanced'])])
const rawContentSchema = z.union([z.boolean(), z.enum(['markdown', 'text'])])

const webToolInputSchema = lazySchema(() =>
  z.strictObject({
    action: z.enum(['search', 'extract']),
    query: z.string().trim().optional(),
    search_depth: searchDepthSchema.optional(),
    chunks_per_source: z.coerce.number().int().min(1).max(5).optional(),
    max_results: z.coerce.number().int().min(0).max(20).optional(),
    topic: topicSchema.optional(),
    time_range: timeRangeSchema.optional(),
    start_date: z.string().trim().optional(),
    end_date: z.string().trim().optional(),
    include_answer: answerSchema.optional(),
    include_raw_content: rawContentSchema.optional(),
    include_images: z.boolean().optional(),
    include_image_descriptions: z.boolean().optional(),
    include_favicon: z.boolean().optional(),
    include_domains: z.array(z.string().trim().min(1)).max(300).optional(),
    exclude_domains: z.array(z.string().trim().min(1)).max(150).optional(),
    country: z.string().trim().optional(),
    auto_parameters: z.boolean().optional(),
    exact_match: z.boolean().optional(),
    safe_search: z.boolean().optional(),
    url: z.string().trim().url().optional(),
    urls: z.array(z.string().trim().url()).min(1).max(20).optional(),
    extract_depth: z.enum(['basic', 'advanced']).optional(),
    format: z.enum(['markdown', 'text']).optional(),
    timeout: z.coerce.number().min(1).max(60).optional(),
    include_usage: z.boolean().optional(),
    task_id: z.string().optional()
  })
)

const webToolOutputSchema = lazySchema(() => toolExecuteResultSchema)

type CreateWebToolOptions = {
  apiKey?: string
}

type TavilyErrorLike = Error & {
  code?: string
  status?: number
  response?: {
    status?: number
    data?: {
      detail?: {
        error?: string
      }
      error?: string
      message?: string
    }
  }
}

const compact = (text: string, max = 180): string => {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`
}

const normalizeRawContentOption = (
  value: boolean | 'markdown' | 'text' | undefined
): false | 'markdown' | 'text' | undefined => {
  if (value === true) {
    return 'markdown'
  }
  if (value === false) {
    return false
  }
  return value
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return String(error)
}

const getTavilyStatus = (error: unknown): number | undefined => {
  const candidate = error as TavilyErrorLike
  return candidate.status ?? candidate.response?.status
}

const getTavilyDetail = (error: unknown): string => {
  const candidate = error as TavilyErrorLike
  return (
    candidate.response?.data?.detail?.error ??
    candidate.response?.data?.error ??
    candidate.response?.data?.message ??
    getErrorMessage(error)
  )
}

const toFaultCode = (status: number | undefined, message: string): ToolErrorCode => {
  if (status === 401 || status === 432 || status === 433) return 'TOOL_PERMISSION_DENIED'
  if (status === 429) return 'TOOL_RATE_LIMITED'
  if (status && status >= 500) return 'TOOL_UNAVAILABLE'
  if (/network|econnreset|econnrefused|enotfound|ehostunreach|socket hang up/i.test(message)) {
    return 'TOOL_NETWORK'
  }
  return 'TOOL_EXECUTION_FAILED'
}

const toFaultType = (code: ToolErrorCode): ToolErrorType => {
  switch (code) {
    case 'TOOL_RATE_LIMITED':
    case 'TOOL_NETWORK':
      return 'transient'
    case 'TOOL_PERMISSION_DENIED':
      return 'permission'
    case 'TOOL_UNAVAILABLE':
      return 'tool_unavailable'
    default:
      return 'execution'
  }
}

const toRetryable = (status: number | undefined, code: ToolErrorCode): boolean => {
  if (status === 432 || status === 433) {
    return false
  }
  return code === 'TOOL_RATE_LIMITED' || code === 'TOOL_NETWORK' || code === 'TOOL_UNAVAILABLE'
}

const throwTavilyError = (error: unknown): never => {
  const status = getTavilyStatus(error)
  const message = getTavilyDetail(error)
  const code = toFaultCode(status, message)
  const type = toFaultType(code)
  const stage: ToolFailureStage = 'execution'

  throw new ToolExecutionError({
    code,
    type,
    stage,
    retryable: toRetryable(status, code),
    message,
    details: {
      status: status ?? null
    }
  })
}

const normalizeSearchResponse = (response: Awaited<ReturnType<ReturnType<typeof tavily>['search']>>) => ({
  ok: true,
  action: 'search',
  query: response.query,
  answer: response.answer,
  images: response.images,
  results: response.results.map((result) => ({
    title: result.title,
    url: result.url,
    content: result.content,
    score: result.score,
    raw_content: result.rawContent,
    published_date: result.publishedDate,
    favicon: result.favicon
  })),
  response_time: response.responseTime,
  usage: response.usage,
  request_id: response.requestId
})

const normalizeExtractResponse = (
  response: Awaited<ReturnType<ReturnType<typeof tavily>['extract']>>
) => ({
  ok: true,
  action: 'extract',
  results: response.results.map((result) => ({
    url: result.url,
    title: result.title,
    raw_content: result.rawContent,
    images: result.images,
    favicon: result.favicon
  })),
  failed_results: response.failedResults,
  response_time: response.responseTime,
  usage: response.usage,
  request_id: response.requestId
})

export function createWebTool(options: CreateWebToolOptions = {}): Tool {
  return defineTool({
    name: 'web',
    label: 'Web',
    description:
      'Search the web or extract page content using Tavily. Actions: search and extract. ' +
      'Use search for current or external information, and extract for known URLs.',
    idempotent: true,
    priority: getToolPriority('web'),
    faultTolerance: {
      maxRetries: 0,
      timeoutMs: 45_000
    },
    inputSchema: webToolInputSchema,
    outputSchema: webToolOutputSchema,
    execute: async (_toolCallId, params): Promise<ToolExecuteResult> => {
      const apiKey = options.apiKey ?? process.env.TAVILY_API_KEY?.trim()
      if (!apiKey) {
        throw new ToolExecutionError({
          code: 'TOOL_UNAVAILABLE',
          type: 'tool_unavailable',
          stage: 'execution',
          retryable: false,
          message: 'Tavily API key is not configured.'
        })
      }

      const client = tavily({ apiKey })

      try {
        if (params.action === 'search') {
          const query = params.query?.trim()
          if (!query) {
            throw new ToolExecutionError({
              code: 'TOOL_BAD_INPUT',
              type: 'parameter',
              stage: 'input_validation',
              retryable: false,
              message: 'web search requires a non-empty query.'
            })
          }

          if (params.chunks_per_source && params.chunks_per_source > 3) {
            throw new ToolExecutionError({
              code: 'TOOL_BAD_INPUT',
              type: 'parameter',
              stage: 'input_validation',
              retryable: false,
              message: 'web search chunks_per_source must be between 1 and 3.'
            })
          }

          const searchOptions: TavilySearchOptions = {
            searchDepth: params.search_depth,
            chunksPerSource: params.chunks_per_source,
            maxResults: params.max_results,
            topic: params.topic,
            timeRange: params.time_range,
            startDate: params.start_date,
            endDate: params.end_date,
            includeAnswer: params.include_answer,
            includeRawContent: normalizeRawContentOption(params.include_raw_content),
            includeImages: params.include_images,
            includeImageDescriptions: params.include_image_descriptions,
            includeFavicon: params.include_favicon,
            includeDomains: params.include_domains,
            excludeDomains: params.exclude_domains,
            country: params.country,
            autoParameters: params.auto_parameters,
            exactMatch: params.exact_match,
            safeSearch: params.safe_search,
            includeUsage: params.include_usage
          }
          const response = normalizeSearchResponse(await client.search(query, searchOptions))
          const text = JSON.stringify(response, null, 2)

          return {
            content: [{ type: 'text', text }],
            details: {
              summary: `web search: ${compact(query)} (${response.results.length} results)`
            }
          }
        }

        const urls = params.urls ?? (params.url ? [params.url] : [])
        if (urls.length === 0) {
          throw new ToolExecutionError({
            code: 'TOOL_BAD_INPUT',
            type: 'parameter',
            stage: 'input_validation',
            retryable: false,
            message: 'web extract requires url or urls.'
          })
        }

        const extractOptions: TavilyExtractOptions = {
          query: params.query,
          chunksPerSource: params.chunks_per_source,
          extractDepth: params.extract_depth,
          includeImages: params.include_images,
          includeFavicon: params.include_favicon,
          format: params.format,
          timeout: params.timeout,
          includeUsage: params.include_usage
        }
        const response = normalizeExtractResponse(await client.extract(urls, extractOptions))
        const text = JSON.stringify(response, null, 2)

        return {
          content: [{ type: 'text', text }],
          details: {
            summary: `web extract: ${response.results.length} succeeded, ${response.failed_results.length} failed`
          }
        }
      } catch (error) {
        if (error instanceof ToolExecutionError) {
          throw error
        }
        return throwTavilyError(error)
      }
    }
  })
}
