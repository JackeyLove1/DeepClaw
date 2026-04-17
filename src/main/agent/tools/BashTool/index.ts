import { createShellTool, type ShellToolOptions } from '../ShellTool'
import { evaluateBashPermission } from './permission'
import { BASH_TOOL_PROMPT } from './prompt'

export type BashToolOptions = Omit<ShellToolOptions, 'description' | 'label' | 'name' | 'shellExecutable' | 'shellArgs' | 'permission'>

export function createBashTool(options: BashToolOptions = {}) {
  return createShellTool({
    ...options,
    name: 'bash',
    label: 'Bash',
    description: BASH_TOOL_PROMPT,
    shellExecutable: 'bash',
    shellArgs: (command) => ['-lc', command],
    permission: evaluateBashPermission
  })
}
