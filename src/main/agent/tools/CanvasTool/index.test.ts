import { beforeEach, describe, expect, it, vi } from 'vitest'

const mkdirMock = vi.fn()
const writeFileMock = vi.fn()
const getPathMock = vi.fn()

vi.mock('node:fs/promises', () => ({
  mkdir: mkdirMock,
  writeFile: writeFileMock,
  readFile: vi.fn(),
  rm: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock
  }
}))

import { createCanvasTool } from './index'

describe('createCanvasTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPathMock.mockReturnValue('C:/Users/test/AppData/Roaming/DeepClaw')
    mkdirMock.mockResolvedValue(undefined)
    writeFileMock.mockResolvedValue(undefined)
  })

  it('persists a self-contained HTML canvas artifact with CSP-protected markup', async () => {
    const result = await createCanvasTool().execute('tool-canvas-1', {
      html: '<main><h1>Event loop</h1><script>window.answer = 42;</script></main>',
      title: 'Event Loop Primer',
      task_id: 'session-1'
    })

    expect(mkdirMock).toHaveBeenCalledWith(
      'C:\\Users\\test\\AppData\\Roaming\\DeepClaw\\chat-canvas\\session-1\\tool-canvas-1',
      { recursive: true }
    )
    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock.mock.calls[0]?.[0]).toMatch(
      /chat-canvas[\\/]session-1[\\/]tool-canvas-1[\\/]index\.html$/
    )
    expect(writeFileMock.mock.calls[0]?.[1]).toContain('Content-Security-Policy')
    expect(writeFileMock.mock.calls[0]?.[1]).toContain('<title>Event Loop Primer</title>')
    expect(result.artifacts).toMatchObject([
      {
        kind: 'canvas',
        id: 'tool-canvas-1',
        title: 'Event Loop Primer',
        mimeType: 'text/html'
      }
    ])
  })

  it('wraps HTML fragments into a full document', async () => {
    await createCanvasTool().execute('tool-canvas-2', {
      html: '<section><p>Fragment only</p></section>',
      task_id: 'session-2'
    })

    const persistedHtml = String(writeFileMock.mock.calls[0]?.[1] ?? '')
    expect(persistedHtml).toContain('<!DOCTYPE html>')
    expect(persistedHtml).toContain('<html lang="en">')
    expect(persistedHtml).toContain('<body>')
    expect(persistedHtml).toContain('Fragment only')
  })

  it('accepts the canvas alias as HTML input', async () => {
    await createCanvasTool().execute('tool-canvas-alias', {
      canvas: '<main><p>Alias payload</p></main>',
      task_id: 'session-alias'
    })

    const persistedHtml = String(writeFileMock.mock.calls[0]?.[1] ?? '')
    expect(persistedHtml).toContain('Alias payload')
  })

  it('accepts a raw string payload as HTML input', async () => {
    await createCanvasTool().execute(
      'tool-canvas-string',
      '<main><p>String payload</p></main>' as unknown as Record<string, unknown>
    )

    const persistedHtml = String(writeFileMock.mock.calls[0]?.[1] ?? '')
    expect(persistedHtml).toContain('String payload')
  })

  it('rejects oversized HTML input', async () => {
    await expect(
      createCanvasTool().execute('tool-canvas-3', {
        html: 'a'.repeat(2 * 1024 * 1024 + 1),
        task_id: 'session-3'
      })
    ).rejects.toMatchObject({
      fault: expect.objectContaining({
        code: 'TOOL_BAD_INPUT'
      })
    })
  })

  it('rejects external asset references', async () => {
    await expect(
      createCanvasTool().execute('tool-canvas-4', {
        html: '<img src="https://example.com/image.png" />',
        task_id: 'session-4'
      })
    ).rejects.toMatchObject({
      fault: expect.objectContaining({
        code: 'TOOL_BAD_INPUT'
      })
    })
  })
})
