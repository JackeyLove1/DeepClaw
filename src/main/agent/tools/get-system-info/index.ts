import os from 'node:os'
import process from 'node:process'
import type { ReadOnlyTool } from '../types'

export function createGetSystemInfoTool(): ReadOnlyTool {
  return {
    name: 'get_system_info',
    label: 'System Info',
    description: 'Return read-only runtime information about the current desktop environment.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    execute: async () => {
      const text = [
        `Platform: ${process.platform}`,
        `Arch: ${process.arch}`,
        `Node: ${process.version}`,
        `Hostname: ${os.hostname()}`,
        `Home: ${os.homedir()}`
      ].join('\n')

      return {
        content: [{ type: 'text', text }],
        details: { summary: text }
      }
    }
  }
}
