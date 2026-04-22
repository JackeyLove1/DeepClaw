import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGrepTool, type RipgrepRunner } from '.'

const tempDirs: string[] = []

async function createFixture(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'notemark-grep-tool-'))
  tempDirs.push(dir)

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf8')
  }

  return dir
}

function parsePayload(result: Awaited<ReturnType<ReturnType<typeof createGrepTool>['execute']>>) {
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

function normalizeDisplay(value: unknown): string {
  return String(value).replace(/\\/g, '/')
}

const missingRipgrep: RipgrepRunner = async () => ({
  stdout: '',
  stderr: '',
  exitCode: null,
  failedToStart: true
})

afterEach(async () => {
  vi.restoreAllMocks()

  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

describe('grep tool', () => {
  it('falls back to TypeScript search when ripgrep is missing', async () => {
    const dir = await createFixture({
      'a.ts': 'alpha\nneedle one\n',
      'b.ts': 'needle two\n',
      'c.md': 'needle three\n'
    })
    const tool = createGrepTool({ runRipgrep: missingRipgrep })

    const result = await tool.execute('grep_1', {
      pattern: 'needle',
      path: dir,
      glob: '*.ts'
    })
    const payload = parsePayload(result)

    expect(payload.backend).toBe('typescript')
    expect(payload.mode).toBe('files_with_matches')
    expect(payload.num_files).toBe(2)
    expect((payload.filenames as string[]).map(normalizeDisplay)).toEqual([
      expect.stringMatching(/a\.ts$/),
      expect.stringMatching(/b\.ts$/)
    ])
  })

  it('supports content mode with context, case-insensitive search, limit, and offset in fallback', async () => {
    const dir = await createFixture({
      'notes.md': ['start', 'before', 'Needle match', 'after', 'needle again'].join('\n')
    })
    const tool = createGrepTool({ runRipgrep: missingRipgrep })

    const result = await tool.execute('grep_2', {
      pattern: 'needle',
      path: dir,
      output_mode: 'content',
      '-i': true,
      context: 1,
      head_limit: 2,
      offset: 1
    })
    const payload = parsePayload(result)

    expect(payload.backend).toBe('typescript')
    expect(payload.mode).toBe('content')
    expect(payload.applied_limit).toBe(2)
    expect(payload.applied_offset).toBe(1)
    expect(normalizeDisplay(payload.content)).toContain('notes.md:3:Needle match')
    expect(normalizeDisplay(payload.content)).toContain('notes.md:4:after')
  })

  it('supports count mode in fallback', async () => {
    const dir = await createFixture({
      'a.txt': 'needle needle\nnope\nneedle\n',
      'b.txt': 'needle\n',
      'binary.png': 'needle\n'
    })
    const tool = createGrepTool({ runRipgrep: missingRipgrep })

    const result = await tool.execute('grep_3', {
      pattern: 'needle',
      path: dir,
      output_mode: 'count'
    })
    const payload = parsePayload(result)

    expect(payload.backend).toBe('typescript')
    expect(payload.num_files).toBe(2)
    expect(payload.num_matches).toBe(4)
    expect(normalizeDisplay(payload.content)).toContain('a.txt:3')
    expect(normalizeDisplay(payload.content)).toContain('b.txt:1')
  })

  it('uses ripgrep when available', async () => {
    const dir = await createFixture({ 'a.ts': 'needle\n' })
    const calls: Array<{ args: string[]; cwd: string }> = []
    const runner: RipgrepRunner = async (args, cwd) => {
      calls.push({ args, cwd })
      if (args[0] === '--version') {
        return { stdout: 'ripgrep 14.0.0', stderr: '', exitCode: 0, failedToStart: false }
      }
      return { stdout: 'a.ts\n', stderr: '', exitCode: 0, failedToStart: false }
    }
    const tool = createGrepTool({ runRipgrep: runner })

    const result = await tool.execute('grep_4', {
      pattern: 'needle',
      path: dir
    })
    const payload = parsePayload(result)

    expect(payload.backend).toBe('ripgrep')
    expect(payload.filenames).toEqual([expect.stringMatching(/a\.ts$/)])
    expect(calls.at(-1)?.cwd).toBe(dir)
    expect(calls.at(-1)?.args).toContain('-l')
    expect(calls.at(-1)?.args).toContain('needle')
  })

  it('returns a structured error for ripgrep execution failures', async () => {
    const dir = await createFixture({ 'a.ts': 'needle\n' })
    const runner: RipgrepRunner = async (args) => {
      if (args[0] === '--version') {
        return { stdout: 'ripgrep 14.0.0', stderr: '', exitCode: 0, failedToStart: false }
      }
      return { stdout: '', stderr: 'regex parse error', exitCode: 2, failedToStart: false }
    }
    const tool = createGrepTool({ runRipgrep: runner })

    const result = await tool.execute('grep_5', {
      pattern: 'needle',
      path: dir
    })
    const payload = parsePayload(result)

    expect(payload.error).toBe('regex parse error')
  })
})
