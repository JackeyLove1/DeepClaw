import fsp from 'node:fs/promises'

import { z } from 'zod'

import { getToolPriority } from '../priorities'
import { defineTool, lazySchema, toolExecuteResultSchema } from '../schema'
import type { Tool } from '../types'
import { checkFileStaleness, updateReadTimestamp } from './write'
import {
  checkSensitivePath,
  expandUser,
  jsonResult,
  toolError,
  toolResultFromJson
} from './utils'

const patchInputSchema = lazySchema(() =>
  z.strictObject({
    path: z.string().describe('Path to the file to edit'),
    old_string: z.string().describe('Exact text to replace'),
    new_string: z.string().describe('Replacement text'),
    replace_all: z
      .boolean()
      .optional()
      .describe('Replace every match instead of requiring exactly one unique match'),
    task_id: z.string().optional().describe('Optional logical task id for read tracking')
  })
)

const patchOutputSchema = lazySchema(() => toolExecuteResultSchema)

function patchReplace(
  fileContent: string,
  oldString: string,
  newString: string,
  replaceAll: boolean
): { next: string; replacements: number } | { error: string } {
  if (!oldString) {
    return { error: 'old_string must be non-empty' }
  }

  let count = 0
  let index = 0
  while ((index = fileContent.indexOf(oldString, index)) !== -1) {
    count += 1
    index += oldString.length
  }

  if (count === 0) {
    return { error: `Could not find old_string in file (${oldString.slice(0, 80)}...)` }
  }

  if (!replaceAll && count > 1) {
    return { error: `old_string matched ${count} times; require unique match or replace_all=true` }
  }

  const next = replaceAll
    ? fileContent.split(oldString).join(newString)
    : fileContent.replace(oldString, newString)

  return { next, replacements: replaceAll ? count : 1 }
}

async function patchToolImpl(
  filepath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
  taskId: string
): Promise<string> {
  const sensitiveError = checkSensitivePath(filepath)
  if (sensitiveError) {
    return toolError(sensitiveError)
  }

  try {
    const staleWarning = await checkFileStaleness(filepath, taskId)
    const expanded = expandUser(filepath)
    const raw = await fsp.readFile(expanded, 'utf8')
    const replaced = patchReplace(raw, oldString, newString, replaceAll)

    if ('error' in replaced) {
      let out = jsonResult({ error: replaced.error, path: filepath })
      if (replaced.error.includes('Could not find')) {
        out += '\n\n[Hint: old_string not found. Use read_file to verify the current content.]'
      }
      return out
    }

    await fsp.writeFile(expanded, replaced.next, 'utf8')

    const result: Record<string, unknown> = {
      ok: true,
      path: filepath,
      replacements: replaced.replacements
    }
    if (staleWarning) {
      result._warning = staleWarning
    }

    await updateReadTimestamp(filepath, taskId)
    return jsonResult(result)
  } catch (error) {
    return toolError(error instanceof Error ? error.message : String(error))
  }
}

export function createPatchTool(): Tool {
  return defineTool({
    name: 'patch',
    label: 'Patch file',
    priority: getToolPriority('patch'),
    description:
      'Edit one file by replacing old_string with new_string. ' +
      'Default behavior requires exactly one unique match; set replace_all=true to replace every match.',
    inputSchema: patchInputSchema,
    outputSchema: patchOutputSchema,
    execute: async (_id, params) => {
      const text = await patchToolImpl(
        params.path,
        params.old_string,
        params.new_string,
        params.replace_all ?? false,
        params.task_id || 'default'
      )
      return toolResultFromJson(text)
    }
  })
}
