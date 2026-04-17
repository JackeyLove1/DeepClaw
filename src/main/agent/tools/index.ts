import { createEchoTool } from './echo'
import { createGetSystemInfoTool } from './get-system-info'
import { createGetTimeTool } from './get-time'
import type { ReadOnlyTool } from './types'

const toolFactories: Array<() => ReadOnlyTool> = [
  createGetTimeTool,
  createGetSystemInfoTool,
  createEchoTool
]

export function createReadOnlyTools(): ReadOnlyTool[] {
  return toolFactories.map((factory) => factory())
}

export type { ReadOnlyTool } from './types'
