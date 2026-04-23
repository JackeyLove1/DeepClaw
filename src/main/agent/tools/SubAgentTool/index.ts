import { randomUUID } from 'node:crypto'

import { getToolPriority } from '../priorities'
import { defineTool, lazySchema, toolExecuteResultSchema } from '../schema'
import { subAgentInputSchema } from './input'
import type { Tool } from '../types'

// Lazy-import AnthropicChatRuntime inside execute() to avoid circular dependency:
// SubAgentTool -> agent-loop -> tools/index -> SubAgentTool

const SUB_AGENT_TOOL_NAME = 'sub_agent'

/**
 * Resolve child tools using lazy imports to break the circular dependency
 * between SubAgentTool and tools/index.ts (which registers SubAgentTool).
 */
const resolveChildTools = async (allowedTools?: string[]): Promise<Tool[]> => {
  // Lazy import — deferred until execute(), after all modules are loaded.
  const { createReadOnlyTools, createTools } = await import('../index')

  if (!allowedTools || allowedTools.length === 0) {
    return createReadOnlyTools()
  }

  const allTools = createTools()
  const whitelist = new Set(allowedTools)
  return allTools.filter(
    (tool) => whitelist.has(tool.name) && tool.name !== SUB_AGENT_TOOL_NAME
  )
}

const extractFinalText = (textBuffer: string): string => {
  const trimmed = textBuffer.trim()
  return trimmed.length > 0 ? trimmed : 'Sub-agent completed with no output.'
}

export function createSubAgentTool(): Tool {
  return defineTool({
    name: SUB_AGENT_TOOL_NAME,
    label: 'Sub-Agent',
    description:
      'Spawn a child agent to handle a subtask independently. ' +
      'The sub-agent has its own tool set (read-only by default) and returns a text result. ' +
      'Useful for delegating research, analysis, or multi-step exploration without ' +
      'cluttering the main conversation.',
    idempotent: false,
    priority: getToolPriority(SUB_AGENT_TOOL_NAME),
    faultTolerance: {
      maxRetries: 0,
      timeoutMs: 120_000
    },
    inputSchema: subAgentInputSchema,
    outputSchema: lazySchema(() => toolExecuteResultSchema),
    execute: async (_toolCallId, params) => {
      const { task, allowed_tools, max_tokens: _maxTokens } = params

      // Lazy import to break circular dependency chain.
      const { AnthropicChatRuntime } = await import('../../agent-loop')

      const childSessionId = `sub_${randomUUID()}`
      const childTools = await resolveChildTools(allowed_tools)

      if (childTools.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: no tools available for the sub-agent.' }],
          details: { summary: 'Sub-agent has no available tools.' }
        }
      }

      const runtime = new AnthropicChatRuntime({
        toolsFactory: () => childTools
      })

      let textBuffer = ''
      let lastEvent: string | undefined

      for await (const event of runtime.runTurn({
        sessionId: childSessionId,
        userText: task,
        hasUserContent: true
      })) {
        if (event.type === 'assistant.delta') {
          const delta = (event as { delta?: string }).delta
          if (delta) {
            textBuffer += delta
          }
        }
        if (event.type === 'assistant.completed') {
          const completedText = (event as { text?: string }).text
          if (completedText) {
            textBuffer = completedText
          }
        }
        if (event.type === 'session.error') {
          lastEvent = (event as { error?: string }).error
        }
      }

      if (lastEvent && textBuffer.trim().length === 0) {
        return {
          content: [{ type: 'text', text: `Sub-agent error: ${lastEvent}` }],
          details: { summary: `Sub-agent failed: ${lastEvent}` }
        }
      }

      const resultText = extractFinalText(textBuffer)
      return {
        content: [{ type: 'text', text: resultText }],
        details: {
          summary: `Sub-agent completed task (${childTools.length} tools available).`,
          childSessionId,
          toolCount: childTools.length,
          outputLength: resultText.length
        }
      }
    }
  })
}
