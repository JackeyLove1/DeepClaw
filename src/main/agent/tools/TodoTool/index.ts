import { getToolPriority } from '../priorities'
import { defineTool, lazySchema, toolExecuteResultSchema } from '../schema'
import type { Tool, ToolExecuteResult } from '../types'
import { todoInputSchema, type TodoItem, type TodoStatus, VALID_STATUSES } from './input'

// ---------------------------------------------------------------------------
// TodoStore - in-memory task list (one per session)
// ---------------------------------------------------------------------------

/**
 * In-memory todo list store. One instance per AIAgent (one per session).
 *
 * Items are ordered — list position is priority. Each item has:
 * - id: unique string identifier
 * - content: task description
 * - status: pending | in_progress | completed | cancelled
 */
export class TodoStore {
  private _items: TodoItem[] = []

  /**
   * Write todos to the store.
   *
   * @param todos - list of todo items to write
   * @param merge - if false, replace entire list. If true, update by id and append new ones.
   * @returns the full current list after writing.
   */
  write(todos: TodoItem[], merge = false): TodoItem[] {
    if (!merge) {
      // Replace mode: new list entirely
      this._items = todos.map((t) => TodoStore._validate(t))
    } else {
      // Merge mode: update existing items by id, append new ones
      const existing = new Map(this._items.map((item) => [item.id, item]))

      for (const t of todos) {
        const itemId = t.id.trim()
        if (!itemId) continue // Can't merge without an id

        if (existing.has(itemId)) {
          // Update only the fields provided
          const existingItem = existing.get(itemId)!
          if (t.content.trim()) {
            existingItem.content = t.content.trim()
          }
          if (t.status && VALID_STATUSES.includes(t.status)) {
            existingItem.status = t.status
          }
        } else {
          // New item -- validate fully and append
          const validated = TodoStore._validate(t)
          existing.set(validated.id, validated)
          this._items.push(validated)
        }
      }

      // Rebuild _items preserving original order for existing items
      const seen = new Set<string>()
      const rebuilt: TodoItem[] = []
      for (const item of this._items) {
        const current = existing.get(item.id) ?? item
        if (!seen.has(current.id)) {
          rebuilt.push(current)
          seen.add(current.id)
        }
      }
      this._items = rebuilt
    }

    return this.read()
  }

  /**
   * Read the current todo list.
   * @returns a copy of the current list.
   */
  read(): TodoItem[] {
    return this._items.map((item) => ({ ...item }))
  }

  /**
   * Check if there are any items in the list.
   */
  hasItems(): boolean {
    return this._items.length > 0
  }

  /**
   * Render the todo list for post-compression injection.
   *
   * Returns a human-readable string for appending to compressed message history,
   * or null if no active items exist.
   *
   * Only injects pending/in_progress items — completed/cancelled ones cause
   * the model to re-do finished work after compression.
   */
  formatForInjection(): string | null {
    if (!this._items.length) return null

    // Status markers for compact display
    const markers: Record<TodoStatus, string> = {
      completed: '[x]',
      in_progress: '[>]',
      pending: '[ ]',
      cancelled: '[~]'
    }

    const activeItems = this._items.filter((item) =>
      ['pending', 'in_progress'].includes(item.status)
    )
    if (!activeItems.length) return null

    const lines = ['[Your active task list was preserved across context compression]']
    for (const item of activeItems) {
      const marker = markers[item.status] ?? '[?]'
      lines.push(`- ${marker} ${item.id}. ${item.content} (${item.status})`)
    }

    return lines.join('\n')
  }

  /**
   * Validate and normalize a todo item.
   * Returns a clean dict with only {id, content, status}.
   */
  private static _validate(
    item: { id?: string; content?: string; status?: string }
  ): TodoItem {
    let itemId = item.id?.trim() ?? ''
    if (!itemId) itemId = '?'

    let content = item.content?.trim() ?? ''
    if (!content) content = '(no description)'

    let status = item.status?.trim().toLowerCase() as TodoStatus
    if (!VALID_STATUSES.includes(status)) status = 'pending'

    return { id: itemId, content, status }
  }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

const todoOutputSchema = lazySchema(() => toolExecuteResultSchema)

/**
 * Shared store instance. In a real multi-agent scenario this would be
 * injected per-agent. Here we export a module-level instance for simplicity.
 */
export const todoStore = new TodoStore()

export function createTodoTool(): Tool {
  return defineTool({
    name: 'todo',
    label: 'Task List',
    description:
      'Manage your task list for the current session. Use for complex tasks ' +
      'with 3+ steps or when the user provides multiple tasks. ' +
      'Call with no parameters to read the current list.\n\n' +
      'Writing:\n' +
      '- Provide todos array to create/update items\n' +
      '- merge=false (default): replace the entire list with a fresh plan\n' +
      '- merge=true: update existing items by id, add any new ones\n\n' +
      'Each item: {id: string, content: string, ' +
      'status: pending|in_progress|completed|cancelled}\n' +
      'List order is priority. Only ONE item in_progress at a time.\n' +
      'Mark items completed immediately when done. If something fails, ' +
      'cancel it and add a revised item.\n\n' +
      'Always returns the full current list.',
    inputSchema: todoInputSchema,
    outputSchema: todoOutputSchema,
    priority: getToolPriority('todo'),
    execute: async (_id, params): Promise<ToolExecuteResult> => {
      let items: TodoItem[]

      if (params.todos != null) {
        items = todoStore.write(params.todos, params.merge ?? false)
      } else {
        items = todoStore.read()
      }

      // Build summary counts
      const summary = {
        total: items.length,
        pending: items.filter((i) => i.status === 'pending').length,
        in_progress: items.filter((i) => i.status === 'in_progress').length,
        completed: items.filter((i) => i.status === 'completed').length,
        cancelled: items.filter((i) => i.status === 'cancelled').length
      }

      const text = JSON.stringify({ todos: items, summary }, null, 0)

      return {
        content: [{ type: 'text', text }],
        details: {
          summary: `todo list: ${summary.total} items (${summary.in_progress} in progress)`
        }
      }
    }
  })
}
