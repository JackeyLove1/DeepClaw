import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createPatchTool, clearReadTracker } from '.'
import { createReadFileTool } from './read'

const parseText = (
  toolResult: Awaited<ReturnType<ReturnType<typeof createPatchTool>['execute']>>
) => {
  const text = toolResult.content[0].text
  const jsonText = text.includes('\n\n[') ? text.slice(0, text.indexOf('\n\n[')) : text
  return JSON.parse(jsonText) as Record<string, unknown>
}

const tempDirs: string[] = []

async function createTempFile(content: string, filename = 'note.txt'): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'notemark-patch-tool-'))
  tempDirs.push(dir)
  const filePath = path.join(dir, filename)
  await fs.writeFile(filePath, content, 'utf8')
  return filePath
}

afterEach(async () => {
  clearReadTracker()

  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

describe('patch tool', () => {
  it('replaces one unique match by default', async () => {
    const filePath = await createTempFile('alpha\nbeta\ngamma\n')
    const tool = createPatchTool()

    const result = await tool.execute('tool_patch_1', {
      path: filePath,
      old_string: 'beta',
      new_string: 'delta'
    })
    const payload = parseText(result)

    expect(payload.ok).toBe(true)
    expect(payload.replacements).toBe(1)
    await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('alpha\ndelta\ngamma\n')
  })

  it('replaces all matches when replace_all=true', async () => {
    const filePath = await createTempFile('one two one two')
    const tool = createPatchTool()

    const result = await tool.execute('tool_patch_2', {
      path: filePath,
      old_string: 'one',
      new_string: 'three',
      replace_all: true
    })
    const payload = parseText(result)

    expect(payload.ok).toBe(true)
    expect(payload.replacements).toBe(2)
    await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('three two three two')
  })

  it('fails when old_string is empty', async () => {
    const filePath = await createTempFile('content')
    const tool = createPatchTool()

    const result = await tool.execute('tool_patch_3', {
      path: filePath,
      old_string: '',
      new_string: 'next'
    })
    const payload = parseText(result)

    expect(payload.error).toBe('old_string must be non-empty')
  })

  it('fails when old_string is not found', async () => {
    const filePath = await createTempFile('content')
    const tool = createPatchTool()

    const result = await tool.execute('tool_patch_4', {
      path: filePath,
      old_string: 'missing',
      new_string: 'next'
    })

    expect(result.content[0].text).toContain('old_string not found')

    const payload = parseText(result)
    expect(payload.error).toContain('Could not find old_string in file')
  })

  it('fails in single-replace mode when multiple matches exist', async () => {
    const filePath = await createTempFile('dup\nvalue\ndup\n')
    const tool = createPatchTool()

    const result = await tool.execute('tool_patch_5', {
      path: filePath,
      old_string: 'dup',
      new_string: 'unique'
    })
    const payload = parseText(result)

    expect(payload.error).toBe('old_string matched 2 times; require unique match or replace_all=true')
    await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('dup\nvalue\ndup\n')
  })

  it('surfaces a stale warning when file changed after read tracking', async () => {
    const filePath = await createTempFile('hello world')
    const taskId = 'patch-stale-warning'
    const readTool = createReadFileTool()
    const patchTool = createPatchTool()

    await readTool.execute('tool_read_1', {
      path: filePath,
      task_id: taskId
    })

    await fs.writeFile(filePath, 'hello there', 'utf8')

    const result = await patchTool.execute('tool_patch_6', {
      path: filePath,
      old_string: 'there',
      new_string: 'agent',
      task_id: taskId
    })
    const payload = parseText(result)

    expect(payload.ok).toBe(true)
    expect(payload._warning).toBeTypeOf('string')
    expect(String(payload._warning)).toContain('was modified since you last read it')
    await expect(fs.readFile(filePath, 'utf8')).resolves.toBe('hello agent')
  })

  it('rejects sensitive system paths before writing', async () => {
    const tool = createPatchTool()
    const sensitivePath =
      process.platform === 'win32'
        ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
        : '/etc/hosts'

    const result = await tool.execute('tool_patch_7', {
      path: sensitivePath,
      old_string: '127.0.0.1',
      new_string: '127.0.0.2'
    })
    const payload = parseText(result)

    expect(payload.error).toContain('Refusing to write to sensitive system path')
  })
})
