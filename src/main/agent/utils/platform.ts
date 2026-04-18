export type PlatformShellKind = 'powershell' | 'bash'

export function isWindows(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32'
}

export function isMacOS(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'darwin'
}

export function isLinux(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'linux'
}

export function resolvePlatformShellKind(
  platform: NodeJS.Platform = process.platform
): PlatformShellKind {
  return isWindows(platform) ? 'powershell' : 'bash'
}
