import type { ShellPermissionDecision, ShellPermissionOptions, ShellRule } from '../ShellTool'
import { evaluateShellPermission } from '../ShellTool'

export const BASH_BUILT_IN_DENY_RULES: ShellRule[] = [
  {
    name: 'bash-rm-rf-wildcard',
    reason: 'Refusing destructive recursive deletion such as rm -rf * or rm -rf /.',
    pattern: /\brm\s+-[^\n]*r[^\n]*f[^\n]*\s+(?:\/|~|\*|\.\.?)(?:\s|$)/i
  },
  {
    name: 'bash-curl-pipe-shell',
    reason: 'Refusing download-and-execute patterns such as curl|bash or wget|sh.',
    pattern: /\b(?:curl|wget)\b[^\n|;]*\|\s*(?:bash|sh)\b/i
  },
  {
    name: 'bash-privilege-escalation',
    reason: 'Refusing commands that attempt privilege escalation.',
    pattern: /\b(?:sudo|su)\b/i
  },
  {
    name: 'bash-disk-destruction',
    reason: 'Refusing direct disk formatting or raw disk writes.',
    pattern: /\b(?:mkfs(?:\.\w+)?|dd\s+[^|;\n]*\bof=\/dev\/)\b/i
  },
  {
    name: 'bash-chmod-root',
    reason: 'Refusing recursive permission changes on the root filesystem.',
    pattern: /\bchmod\s+-[^\n]*R[^\n]*\s+777\s+\/(?:\s|$)/i
  },
  {
    name: 'bash-fork-bomb',
    reason: 'Refusing shell fork bomb syntax.',
    pattern: /:\(\)\s*\{\s*:\|:\s*&\s*\};:/i
  },
  {
    name: 'bash-system-shutdown',
    reason: 'Refusing shutdown or reboot commands.',
    pattern: /\b(?:shutdown|reboot|halt|poweroff)\b/i
  }
]

export function evaluateBashPermission(
  command: string,
  options: ShellPermissionOptions
): ShellPermissionDecision {
  return evaluateShellPermission(command, {
    ...options,
    builtInDenyRules: BASH_BUILT_IN_DENY_RULES
  })
}
