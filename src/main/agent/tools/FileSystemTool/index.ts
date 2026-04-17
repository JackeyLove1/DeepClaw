import type { Tool } from '../types'
import { createPatchTool } from './patch'
import { createReadFileTool } from './read'
import { createWriteFileTool } from './write'
import {
  clearFileOpsCache,
  clearReadTracker,
  getReadFilesSummary,
  notifyOtherToolCall,
  registerInternalBlockedDirectories,
  resetFileDedup
} from './utils'

export function createFileSystemTools(): Tool[] {
  return [createReadFileTool(), createWriteFileTool(), createPatchTool()]
}

export {
  clearFileOpsCache,
  clearReadTracker,
  createPatchTool,
  createReadFileTool,
  createWriteFileTool,
  getReadFilesSummary,
  notifyOtherToolCall,
  registerInternalBlockedDirectories,
  resetFileDedup
}
