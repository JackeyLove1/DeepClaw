import { clampText } from '../../text-utils'
import type { ReadOnlyTool } from '../types'

export function createEchoTool(): ReadOnlyTool {
  return {
    name: 'echo',
    label: 'Echo',
    description: 'Echo text back for debugging tool rendering and event flow.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to echo back.'
        }
      },
      required: ['text'],
      additionalProperties: false
    },
    execute: async (_toolCallId, params) => {
      const text = clampText(params.text, 400)

      return {
        content: [{ type: 'text', text }],
        details: { summary: text }
      }
    }
  }
}
