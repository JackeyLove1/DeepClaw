import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  archiveLogFile,
  formatArchiveTimestamp,
  LOG_MAX_FILES,
  LOG_MAX_SIZE_BYTES,
  resolveManagedLogPath,
  resolveProcessLogFileName
} from './logging'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('main logging helpers', () => {
  it('resolves process-specific active log files under ~/.deepclaw/logs', () => {
    const logsDir = path.join('C:', 'Users', 'tester', '.deepclaw', 'logs')

    expect(resolveProcessLogFileName()).toBe('main.log')
    expect(resolveProcessLogFileName('browser')).toBe('main.log')
    expect(resolveProcessLogFileName('renderer')).toBe('renderer.log')
    expect(resolveManagedLogPath(undefined, logsDir)).toBe(path.join(logsDir, 'main.log'))
    expect(
      resolveManagedLogPath({ variables: { processType: 'renderer' } }, logsDir)
    ).toBe(path.join(logsDir, 'renderer.log'))
    expect(LOG_MAX_SIZE_BYTES).toBe(5 * 1024 * 1024)
  })

  it('rotates to timestamped archive files and enforces the max file count', () => {
    const logsDir = mkdtempSync(path.join(os.tmpdir(), 'notemark-logs-'))
    const activeLog = path.join(logsDir, 'main.log')

    writeFileSync(activeLog, 'active')
    writeFileSync(path.join(logsDir, 'renderer.log'), 'renderer active')

    for (let index = 0; index < LOG_MAX_FILES - 1; index += 1) {
      const archiveName = `main-20240101T00000${index}.${index.toString().padStart(3, '0')}Z.log`
      writeFileSync(path.join(logsDir, archiveName), `archive-${index}`)
    }

    const archivedPath = archiveLogFile(activeLog, {
      logsDir,
      now: new Date('2026-04-19T12:34:56.789Z')
    })

    expect(path.basename(archivedPath)).toBe(`main-${formatArchiveTimestamp(new Date('2026-04-19T12:34:56.789Z'))}.log`)

    const files = readdirSync(logsDir).sort()
    expect(files).toHaveLength(LOG_MAX_FILES)
    expect(files).toContain('renderer.log')
    expect(files).toContain(path.basename(archivedPath))
    expect(files).not.toContain('main-20240101T000000.000Z.log')
  })

  it('adds a numeric suffix when an archive name collision occurs', () => {
    const logsDir = mkdtempSync(path.join(os.tmpdir(), 'notemark-logs-collision-'))
    const activeLog = path.join(logsDir, 'renderer.log')
    const archiveTimestamp = formatArchiveTimestamp(new Date('2026-04-19T12:34:56.789Z'))

    mkdirSync(logsDir, { recursive: true })
    writeFileSync(activeLog, 'active')
    writeFileSync(path.join(logsDir, `renderer-${archiveTimestamp}.log`), 'existing archive')

    const archivedPath = archiveLogFile(activeLog, {
      logsDir,
      now: new Date('2026-04-19T12:34:56.789Z')
    })

    expect(path.basename(archivedPath)).toBe(`renderer-${archiveTimestamp}-1.log`)
  })
})
