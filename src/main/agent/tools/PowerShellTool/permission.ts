import type { ShellPermissionDecision, ShellPermissionOptions, ShellRule } from '../ShellTool'
import { evaluateShellPermission } from '../ShellTool'

export const POWERSHELL_BUILT_IN_DENY_RULES: ShellRule[] = [
  {
    name: 'powershell-remove-item-recursive-force',
    reason: 'Refusing destructive recursive deletion with Remove-Item -Recurse -Force.',
    pattern: /\bRemove-Item\b[^\n]*(?:-Recurse\b[^\n]*-Force\b|-Force\b[^\n]*-Recurse\b)/i
  },
  {
    name: 'powershell-stop-computer',
    reason: 'Refusing shutdown or restart commands.',
    pattern: /\b(?:Stop-Computer|Restart-Computer)\b/i
  },
  {
    name: 'powershell-expression-eval',
    reason: 'Refusing PowerShell expression evaluation commands.',
    pattern: /\b(?:Invoke-Expression|iex)\b/i
  },
  {
    name: 'powershell-download-and-execute',
    reason: 'Refusing download-and-execute patterns.',
    pattern: /\b(?:Invoke-WebRequest|iwr|curl)\b[^\n|;]*\|\s*(?:Invoke-Expression|iex)\b/i
  },
  {
    name: 'powershell-runas',
    reason: 'Refusing elevation requests via Start-Process -Verb RunAs.',
    pattern: /\bStart-Process\b[^\n]*\b-Verb\s+RunAs\b/i
  },
  {
    name: 'powershell-disk-destruction',
    reason: 'Refusing destructive disk management commands.',
    pattern: /\b(?:Format-Volume|Clear-Disk|Remove-Partition)\b/i
  }
]

export function evaluatePowerShellPermission(
  command: string,
  options: ShellPermissionOptions
): ShellPermissionDecision {
  return evaluateShellPermission(command, {
    ...options,
    builtInDenyRules: POWERSHELL_BUILT_IN_DENY_RULES
  })
}
