export type ReadOnlyTool = {
  name: string
  label: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{
    content: Array<{ type: 'text'; text: string }>
    details: { summary: string }
  }>
}
