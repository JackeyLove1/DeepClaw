import { createBashTool, type BashToolOptions } from './BashTool';
import {
    createPatchTool,
    createReadFileTool,
    createSearchFilesTool,
    createWriteFileTool
} from './FileSystemTool';
import { createGetTimeTool } from './get-time';
import { createPowerShellTool, type PowerShellToolOptions } from './PowerShellTool';
import { DEFAULT_PRIORITY } from './priorities';
import type { PostToolUseHook, PreToolUseHook, ShellCommandRunner, ShellPermissionOptions } from './ShellTool';
import type { Tool, ToolFactory } from './types';

/**
 * Safe defaults for the chat runtime: time + read-only file inspection and search.
 * (No `write_file` / `patch` — add those via `createTools` or custom wiring.)
 */
export function createReadOnlyTools(): Tool[] {
  return [createGetTimeTool(), createReadFileTool(), createSearchFilesTool()].sort(
    (a, b) => (b.priority ?? DEFAULT_PRIORITY) - (a.priority ?? DEFAULT_PRIORITY)
  )
}

const toolFactories: ToolFactory[] = [
  createGetTimeTool,
  createReadFileTool,
  createWriteFileTool,
  createPatchTool,
  createSearchFilesTool
]

export type PlatformShellToolOptions = ShellPermissionOptions & {
  preToolUseHooks?: PreToolUseHook[]
  postToolUseHooks?: PostToolUseHook[]
  runCommand?: ShellCommandRunner
}

export type CreateToolsOptions = {
  platform?: NodeJS.Platform
  shellTool?: PlatformShellToolOptions
}

export function createPlatformShellTool(
  platform: NodeJS.Platform = process.platform,
  options: PlatformShellToolOptions = {}
): Tool {
  if (platform === 'win32') {
    const powerShellOptions: PowerShellToolOptions = { ...options }
    return createPowerShellTool(powerShellOptions)
  }

  const bashOptions: BashToolOptions = { ...options }
  return createBashTool(bashOptions)
}

/**
 * 实例化当前注册表中的全部工具（含文件写入与 patch）。
 * 按 priority 降序排列，高优先级工具排在前面。
 *
 * @returns 新数组，每个元素来自对应工厂的一次调用（非缓存单例）。
 */
export function createTools(options: CreateToolsOptions = {}): Tool[] {
  return [...toolFactories.map((factory) => factory()), createPlatformShellTool(options.platform, options.shellTool)]
    .sort((a, b) => (b.priority ?? DEFAULT_PRIORITY) - (a.priority ?? DEFAULT_PRIORITY))
}

export { createBashTool } from './BashTool';
export {
    clearFileOpsCache,
    clearReadTracker,
    createFileSystemTools,
    getReadFilesSummary,
    notifyOtherToolCall,
    registerInternalBlockedDirectories,
    resetFileDedup
} from './FileSystemTool';
export { createPowerShellTool } from './PowerShellTool';

export type {
    PostToolUseHook,
    PostToolUseHookContext,
    PostToolUseHookResult,
    PreToolUseHook,
    PreToolUseHookContext,
    PreToolUseHookResult,
    ShellCommandRunner,
    ShellExecutionOutput,
    ShellExecutionRequest,
    ShellPermissionDecision,
    ShellPermissionOptions,
    ShellRule,
    ShellToolOptions
} from './ShellTool';
export type { Tool, ToolExecuteResult, ToolFactory, ToolInputSchema, ToolResultTextBlock } from './types';
