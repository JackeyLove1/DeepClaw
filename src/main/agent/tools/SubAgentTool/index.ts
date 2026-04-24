import { randomUUID } from 'node:crypto'

import { getToolPriority } from '../priorities'
import { defineTool, lazySchema, toolExecuteResultSchema } from '../schema'
import type { Tool } from '../types'
import { subAgentInputSchema } from './input'

// Lazy-import AnthropicChatRuntime inside execute() to avoid circular dependency:
// SubAgentTool -> agent-loop -> tools/index -> SubAgentTool

const SUB_AGENT_TOOL_NAME = 'sub_agent'
const DEFAULT_SUB_AGENT_MAX_TOKENS = 4096

type ResolvedChildTools = {
  tools: Tool[]
  requestedCount: number
  invalidToolNames: string[]
  blockedToolNames: string[]
}

const normalizeAllowedTools = (allowedTools?: string[]): string[] => {
  if (!allowedTools || allowedTools.length === 0) {
    return []
  }

  return [...new Set(allowedTools.map((tool) => tool.trim()).filter(Boolean))]
}

/**
 * Resolve child tools using lazy imports to break the circular dependency
 * between SubAgentTool and tools/index.ts (which registers SubAgentTool).
 */
const resolveChildTools = async (allowedTools?: string[]): Promise<ResolvedChildTools> => {
  const { createReadOnlyTools, createToolsAsync } = await import('../index')
  const normalizedAllowedTools = normalizeAllowedTools(allowedTools)

  if (normalizedAllowedTools.length === 0) {
    return {
      tools: createReadOnlyTools(),
      requestedCount: 0,
      invalidToolNames: [],
      blockedToolNames: []
    }
  }

  const allTools = await createToolsAsync()
  const allToolNames = new Set(allTools.map((tool) => tool.name))
  const blockedToolNames = normalizedAllowedTools.filter((name) => name === SUB_AGENT_TOOL_NAME)
  const allowedToolSet = new Set(
    normalizedAllowedTools.filter((name) => name !== SUB_AGENT_TOOL_NAME)
  )
  const invalidToolNames = [...allowedToolSet].filter((name) => !allToolNames.has(name))
  const tools = allTools.filter((tool) => allowedToolSet.has(tool.name))

  return {
    tools,
    requestedCount: normalizedAllowedTools.length,
    invalidToolNames,
    blockedToolNames
  }
}

const extractFinalText = (textBuffer: string): string => {
  const trimmed = textBuffer.trim()
  return trimmed.length > 0 ? trimmed : 'Sub-agent completed with no output.'
}

const buildNoToolsMessage = (resolved: ResolvedChildTools): string => {
  const details: string[] = []

  if (resolved.requestedCount === 0) {
    return 'Error: no tools available for the sub-agent.'
  }

  if (resolved.invalidToolNames.length > 0) {
    details.push(`unknown tools: ${resolved.invalidToolNames.join(', ')}`)
  }

  if (resolved.blockedToolNames.length > 0) {
    details.push(`blocked tools: ${resolved.blockedToolNames.join(', ')}`)
  }

  if (details.length === 0) {
    details.push('whitelist resolved to zero usable tools')
  }

  return `Error: no tools available for the sub-agent (${details.join('; ')}).`
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
      const { task, allowed_tools, max_tokens, task_id: _taskId } = params

      const { AnthropicChatRuntime } = await import('../../agent-loop')

      const childSessionId = `sub_${randomUUID()}`
      const resolvedChildTools = await resolveChildTools(allowed_tools)
      const childTools = resolvedChildTools.tools

      if (childTools.length === 0) {
        const message = buildNoToolsMessage(resolvedChildTools)
        return {
          content: [{ type: 'text', text: message }],
          details: {
            summary: 'Sub-agent has no available tools.',
            invalidToolNames: resolvedChildTools.invalidToolNames,
            blockedToolNames: resolvedChildTools.blockedToolNames
          }
        }
      }

      const runtime = new AnthropicChatRuntime({
        toolsFactory: () => childTools
      })

      let textBuffer = ''
      let lastErrorMessage: string | undefined

      for await (const event of runtime.runTurn({
        sessionId: childSessionId,
        userText: task,
        hasUserContent: true,
        maxTokens: max_tokens ?? DEFAULT_SUB_AGENT_MAX_TOKENS
      })) {
        if (event.type === 'assistant.delta') {
          if (event.delta) {
            textBuffer += event.delta
          }
        }

        if (event.type === 'assistant.completed') {
          if (event.text) {
            textBuffer = event.text
          }
        }

        if (event.type === 'session.error') {
          lastErrorMessage = event.message
        }
      }

      if (lastErrorMessage && textBuffer.trim().length === 0) {
        return {
          content: [{ type: 'text', text: `Sub-agent error: ${lastErrorMessage}` }],
          details: { summary: `Sub-agent failed: ${lastErrorMessage}` }
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
