import { z } from 'zod'

import { lazySchema } from '../schema'

/**
 * Valid status values for todo items.
 */
export const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const

export type TodoStatus = (typeof VALID_STATUSES)[number]

/**
 * A single todo item in the list.
 */
export interface TodoItem {
  id: string
  content: string
  status: TodoStatus
}

/**
 * Zod schema for a single todo item.
 */
const todoItemSchema = z.strictObject({
  id: z.string().describe('Unique item identifier'),
  content: z.string().describe('Task description'),
  status: z.enum(VALID_STATUSES).describe('Current status')
})

/**
 * Input schema for the todo tool.
 * - Omit `todos` to read the current list.
 * - Provide `todos` array to write (optionally with `merge: true`).
 */
export const todoInputSchema = lazySchema(() =>
  z.strictObject({
    todos: z
      .array(todoItemSchema)
      .optional()
      .describe('Task items to write. Omit to read current list.'),
    merge: z
      .boolean()
      .default(false)
      .describe(
        'true: update existing items by id, add new ones. false (default): replace the entire list.'
      ),
    // Merged by agent-loop for session correlation; same pattern as Shell/FileSystem tools.
    task_id: z.string().optional()
  })
)
