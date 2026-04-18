import { describe, expect, it } from 'vitest'

import { isLinux, isMacOS, isWindows, resolvePlatformShellKind } from './platform'

describe('platform utils', () => {
  it('resolves PowerShell for windows', () => {
    expect(isWindows('win32')).toBe(true)
    expect(resolvePlatformShellKind('win32')).toBe('powershell')
  })

  it('resolves bash for macOS and linux', () => {
    expect(isMacOS('darwin')).toBe(true)
    expect(isLinux('linux')).toBe(true)
    expect(resolvePlatformShellKind('darwin')).toBe('bash')
    expect(resolvePlatformShellKind('linux')).toBe('bash')
  })
})
