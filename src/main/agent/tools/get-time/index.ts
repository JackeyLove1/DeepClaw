import type { ReadOnlyTool } from '../types'

export function createGetTimeTool(): ReadOnlyTool {
  return {
    name: 'get_time',
    label: 'Current Time',
    description: 'Return the current local time, timezone, and ISO timestamp.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    execute: async () => {
      const now = new Date()
      const text = [
        `Local time: ${now.toLocaleString()}`,
        `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
        `ISO: ${now.toISOString()}`
      ].join('\n')

      return {
        content: [{ type: 'text', text }],
        details: { summary: text }
      }
    }
  }
}
