import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { executeToolWithFaultTolerance } from '../fault-tolerance'
import { createTools } from '..'
import { createWebTool } from './index'

const tavilyMocks = vi.hoisted(() => {
  const search = vi.fn()
  const extract = vi.fn()
  const tavily = vi.fn(() => ({ search, extract }))
  return { extract, search, tavily }
})

vi.mock('@tavily/core', () => ({
  tavily: tavilyMocks.tavily
}))

const ORIGINAL_TAVILY_API_KEY = process.env.TAVILY_API_KEY

const createTavilyError = (status: number, message: string): Error & { response: unknown } =>
  Object.assign(new Error(message), {
    response: {
      status,
      data: {
        detail: {
          error: message
        }
      }
    }
  })

beforeEach(() => {
  tavilyMocks.tavily.mockClear()
  tavilyMocks.search.mockReset()
  tavilyMocks.extract.mockReset()
  delete process.env.TAVILY_API_KEY
})

afterEach(() => {
  if (ORIGINAL_TAVILY_API_KEY) {
    process.env.TAVILY_API_KEY = ORIGINAL_TAVILY_API_KEY
  } else {
    delete process.env.TAVILY_API_KEY
  }
})

describe('WebTool', () => {
  it('maps search inputs to Tavily SDK options and returns normalized results', async () => {
    tavilyMocks.search.mockResolvedValueOnce({
      query: 'Who is Leo Messi?',
      answer: 'Lionel Messi is an Argentine footballer.',
      images: [{ url: 'https://example.test/messi.png', description: 'Messi' }],
      results: [
        {
          title: 'Lionel Messi',
          url: 'https://example.test/messi',
          content: 'Profile content',
          rawContent: '# Lionel Messi',
          score: 0.91,
          publishedDate: '2026-01-01',
          favicon: 'https://example.test/favicon.ico'
        }
      ],
      responseTime: 1.2,
      usage: { credits: 1 },
      requestId: 'req_search'
    })

    const tool = createWebTool({ apiKey: 'tvly-test-key' })
    const result = await tool.execute('tool_search', {
      action: 'search',
      query: 'Who is Leo Messi?',
      search_depth: 'basic',
      max_results: 3,
      include_answer: true,
      include_raw_content: true,
      include_favicon: true,
      include_usage: true
    })
    const payload = JSON.parse(result.content[0].text) as {
      action: string
      results: Array<{ raw_content?: string; published_date?: string }>
      request_id: string
    }

    expect(tavilyMocks.tavily).toHaveBeenCalledWith({ apiKey: 'tvly-test-key' })
    expect(tavilyMocks.search).toHaveBeenCalledWith('Who is Leo Messi?', {
      searchDepth: 'basic',
      chunksPerSource: undefined,
      maxResults: 3,
      topic: undefined,
      timeRange: undefined,
      startDate: undefined,
      endDate: undefined,
      includeAnswer: true,
      includeRawContent: 'markdown',
      includeImages: undefined,
      includeImageDescriptions: undefined,
      includeFavicon: true,
      includeDomains: undefined,
      excludeDomains: undefined,
      country: undefined,
      autoParameters: undefined,
      exactMatch: undefined,
      safeSearch: undefined,
      includeUsage: true
    })
    expect(payload.action).toBe('search')
    expect(payload.results[0]?.raw_content).toBe('# Lionel Messi')
    expect(payload.results[0]?.published_date).toBe('2026-01-01')
    expect(payload.request_id).toBe('req_search')
  })

  it('extracts from either a single url or url list', async () => {
    tavilyMocks.extract
      .mockResolvedValueOnce({
        results: [
          {
            url: 'https://example.test/one',
            title: 'One',
            rawContent: 'One content',
            images: [],
            favicon: 'https://example.test/favicon.ico'
          }
        ],
        failedResults: [],
        responseTime: 0.4,
        usage: { credits: 1 },
        requestId: 'req_extract_one'
      })
      .mockResolvedValueOnce({
        results: [],
        failedResults: [{ url: 'https://example.test/two', error: 'failed' }],
        responseTime: 0.5,
        requestId: 'req_extract_two'
      })

    const tool = createWebTool({ apiKey: 'tvly-test-key' })
    await tool.execute('tool_extract_one', {
      action: 'extract',
      url: 'https://example.test/one',
      extract_depth: 'basic',
      format: 'markdown'
    })
    const secondResult = await tool.execute('tool_extract_two', {
      action: 'extract',
      urls: ['https://example.test/two'],
      query: 'relevant chunks',
      chunks_per_source: 5,
      include_usage: true
    })
    const payload = JSON.parse(secondResult.content[0].text) as {
      failed_results: Array<{ url: string; error: string }>
      request_id: string
    }

    expect(tavilyMocks.extract).toHaveBeenNthCalledWith(1, ['https://example.test/one'], {
      query: undefined,
      chunksPerSource: undefined,
      extractDepth: 'basic',
      includeImages: undefined,
      includeFavicon: undefined,
      format: 'markdown',
      timeout: undefined,
      includeUsage: undefined
    })
    expect(tavilyMocks.extract).toHaveBeenNthCalledWith(2, ['https://example.test/two'], {
      query: 'relevant chunks',
      chunksPerSource: 5,
      extractDepth: undefined,
      includeImages: undefined,
      includeFavicon: undefined,
      format: undefined,
      timeout: undefined,
      includeUsage: true
    })
    expect(payload.failed_results).toEqual([{ url: 'https://example.test/two', error: 'failed' }])
    expect(payload.request_id).toBe('req_extract_two')
  })

  it('registers the web tool only when Tavily API key is configured', () => {
    expect(createTools({ includeCronTool: false }).some((tool) => tool.name === 'web')).toBe(false)

    process.env.TAVILY_API_KEY = 'tvly-test-key'

    expect(createTools({ includeCronTool: false }).some((tool) => tool.name === 'web')).toBe(true)
  })

  it.each([
    [401, 'TOOL_PERMISSION_DENIED', 'Unauthorized: missing or invalid API key.'],
    [429, 'TOOL_RATE_LIMITED', 'Too many requests.'],
    [432, 'TOOL_PERMISSION_DENIED', 'This request exceeds your plan limit.']
  ])('normalizes Tavily status %s into a structured tool failure', async (status, code, message) => {
    tavilyMocks.search.mockRejectedValueOnce(createTavilyError(status, message))

    const tool = createWebTool({ apiKey: 'tvly-test-key' })
    const outcome = await executeToolWithFaultTolerance(tool, 'tool_error', {
      action: 'search',
      query: 'news'
    })

    expect(outcome.isError).toBe(true)
    expect(outcome.fault?.code).toBe(code)
    expect(outcome.fault?.message).toBe(message)
  })
})
