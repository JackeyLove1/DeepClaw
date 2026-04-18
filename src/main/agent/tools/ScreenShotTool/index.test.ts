import { describe, expect, it, vi, beforeEach } from 'vitest'

const execFileMock = vi.fn()
const mkdirMock = vi.fn()
const unlinkMock = vi.fn()
const writeFileMock = vi.fn()
const createFromPathMock = vi.fn()
const resolveTmpDirMock = vi.fn()
const isWindowsMock = vi.fn()
const isMacOSMock = vi.fn()
const isLinuxMock = vi.fn()

type FakeImage = {
  isEmpty: () => boolean
  getSize: () => { width: number; height: number }
  toJPEG: (quality: number) => Buffer
  resize: (options: { width: number; height: number }) => FakeImage
}

const createFakeImage = (
  width: number,
  height: number,
  sizeBytes = 1024,
  isEmpty = false
): FakeImage => ({
  isEmpty: () => isEmpty,
  getSize: () => ({ width, height }),
  toJPEG: () => Buffer.alloc(sizeBytes, 1),
  resize: ({ width: nextWidth, height: nextHeight }) =>
    createFakeImage(nextWidth, nextHeight, Math.max(256, Math.floor(sizeBytes * 0.6)))
})

vi.mock('node:child_process', () => ({
  execFile: execFileMock
}))

vi.mock('electron', () => ({
  nativeImage: {
    createFromPath: createFromPathMock
  }
}))

vi.mock('node:fs/promises', () => ({
  mkdir: mkdirMock,
  unlink: unlinkMock,
  writeFile: writeFileMock
}))

vi.mock('../../utils', () => ({
  resolveTmpDir: resolveTmpDirMock,
  isWindows: isWindowsMock,
  isMacOS: isMacOSMock,
  isLinux: isLinuxMock
}))

import { createScreenShotTool } from './index'

describe('createScreenShotTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveTmpDirMock.mockReturnValue('C:/Users/test/.deepclaw/tmp')
    isWindowsMock.mockReturnValue(true)
    isMacOSMock.mockReturnValue(false)
    isLinuxMock.mockReturnValue(false)
    mkdirMock.mockResolvedValue(undefined)
    unlinkMock.mockResolvedValue(undefined)
    writeFileMock.mockResolvedValue(undefined)
    createFromPathMock.mockReturnValue(createFakeImage(1440, 900, 4096))
    execFileMock.mockImplementation(
      (
        _executable: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout?: string, stderr?: string) => void
      ) => callback(null, '', '')
    )
  })

  it('captures screenshot via PowerShell on Windows and persists jpeg artifact', async () => {
    const result = await createScreenShotTool().execute('tool-shot', { task_id: 'task-1' })

    expect(execFileMock).toHaveBeenCalledTimes(1)
    expect(execFileMock).toHaveBeenCalledWith(
      'powershell',
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-Command', expect.any(String)]),
      expect.objectContaining({ timeout: 15_000, windowsHide: true }),
      expect.any(Function)
    )
    expect(mkdirMock).toHaveBeenCalledWith('C:/Users/test/.deepclaw/tmp', { recursive: true })
    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(unlinkMock).toHaveBeenCalledTimes(1)
    expect(result.details.summary).toContain('Captured primary screen')
    expect(result.details.shell).toBe('powershell')
    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts?.[0]).toMatchObject({
      mimeType: 'image/jpeg',
      filePath: expect.stringMatching(/[\\/]\.deepclaw[\\/]tmp[\\/].+\.jpg$/),
      sizeBytes: 4096,
      width: 1440,
      height: 900
    })
  })

  it('captures screenshot via bash on macOS', async () => {
    isWindowsMock.mockReturnValue(false)
    isMacOSMock.mockReturnValue(true)

    const result = await createScreenShotTool().execute('tool-shot', {})

    expect(execFileMock).toHaveBeenCalledWith(
      'bash',
      ['-lc', expect.stringContaining('screencapture -x')],
      expect.objectContaining({ timeout: 15_000, windowsHide: true }),
      expect.any(Function)
    )
    expect(result.details.shell).toBe('bash')
  })

  it('returns a permission error when screen capture access is denied', async () => {
    execFileMock.mockImplementation(
      (
        _executable: string,
        _args: string[],
        _options: Record<string, unknown>,
        callback: (error: Error | null, stdout?: string, stderr?: string) => void
      ) => callback(new Error('Screen recording permission denied'), '', '')
    )

    await expect(createScreenShotTool().execute('tool-shot', {})).rejects.toMatchObject({
      fault: expect.objectContaining({
        code: 'TOOL_PERMISSION_DENIED'
      })
    })
  })

  it('fails when image loader returns an empty screenshot', async () => {
    createFromPathMock.mockReturnValue(createFakeImage(1440, 900, 1024, true))

    await expect(createScreenShotTool().execute('tool-shot', {})).rejects.toMatchObject({
      fault: expect.objectContaining({
        code: 'TOOL_UNAVAILABLE'
      })
    })
  })
})
