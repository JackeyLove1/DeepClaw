import { unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGetTimeTool } from './get-time'
import { createReadFileTool } from './FileSystemTool'
import { createTodoTool } from './TodoTool'
import { DEFAULT_BUDGET, createReadOnlyTools, sortToolsByUsagePriority } from './index'

describe('sortToolsByUsagePriority', () => {
  it('sorts tools by base priority plus persisted use count', () => {
    const tools = [createTodoTool(), createGetTimeTool(), createReadFileTool()]
    const sorted = sortToolsByUsagePriority(
      tools,
      new Map([
        ['todo', 60],
        ['get_time', 80],
        ['read_file', 1]
      ])
    )

    expect(sorted.map((tool) => tool.name)).toEqual(['get_time', 'read_file', 'todo'])
  })

  it('breaks ties by base priority and then tool name', () => {
    const sorted = sortToolsByUsagePriority(
      [createTodoTool(), createGetTimeTool()],
      new Map([
        ['todo', 0],
        ['get_time', 0]
      ])
    )

    expect(sorted.map((tool) => tool.name)).toEqual(['get_time', 'todo'])
  })

  it('wraps read-only tools with result persistence', async () => {
    const filePath = path.join(os.tmpdir(), `notemark-readonly-${Date.now()}.txt`)
    await writeFile(filePath, 'hello from persisted read-only tool', 'utf8')

    try {
      const tools = createReadOnlyTools({
        budgetConfig: {
          ...DEFAULT_BUDGET,
          thresholds: {
            ...DEFAULT_BUDGET.thresholds,
            read_file: 1
          }
        }
      })
      const readFileTool = tools.find((tool) => tool.name === 'read_file')

      expect(readFileTool).toBeDefined()

      const result = await readFileTool!.execute('tool_readonly_persist', {
        path: filePath
      })

      expect(result.content[0]?.text).toContain('<persisted-output>')
      expect(result.content[0]?.text).toContain('Full output saved to:')
    } finally {
      await unlink(filePath).catch(() => undefined)
    }
  })
})
