import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { maybePersistToolResult } from './budget'

afterEach(async () => {
  vi.restoreAllMocks()
})

describe('tool result persistence', () => {
  it('stores oversized output under ~/.deepclaw/tmp', async () => {
    const fakeHome = path.join(os.tmpdir(), `notemark-budget-${Date.now()}`)
    vi.spyOn(os, 'homedir').mockReturnValue(fakeHome)

    const result = await maybePersistToolResult('x'.repeat(32), 'bash', 'tool_persist', undefined, 8)
    const persistedPath = path.join(fakeHome, '.deepclaw', 'tmp', 'tool_persist.txt')

    expect(result).toContain(persistedPath)
    await expect(fs.readFile(persistedPath, 'utf8')).resolves.toBe('x'.repeat(32))

    await fs.rm(fakeHome, { recursive: true, force: true })
  })
})
