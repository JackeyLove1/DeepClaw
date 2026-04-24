import os from 'node:os'
import path from 'node:path'

const DEEPCLAW_DIRNAME = '.deepclaw'

export function resolveDeepClawHomeDir(): string {
  return path.join(os.homedir(), DEEPCLAW_DIRNAME)
}

export function resolveDeepClawPath(...segments: string[]): string {
  return path.join(resolveDeepClawHomeDir(), ...segments)
}

export function resolveDefaultWorkingDir(): string {
  return resolveDeepClawHomeDir()
}

export function resolveTmpDir(): string {
  return resolveDeepClawPath('tmp')
}

export function resolveMemoriesDir(): string {
  return resolveDeepClawPath('memories')
}

export function resolveSkillsDir(): string {
  return resolveDeepClawPath('skills')
}

export function resolveLogsDir(): string {
  return resolveDeepClawPath('logs')
}

export function resolveEnvFilePath(): string {
  return resolveDeepClawPath('.env')
}

export function resolveMcpConfigPath(): string {
  return resolveDeepClawPath('mcp.json')
}

export function resolveAiChannelsFilePath(): string {
  return resolveDeepClawPath('ai-channels.json')
}

export function resolveThirdPartyApiKeysFilePath(): string {
  return resolveDeepClawPath('third-party-api-keys.json')
}

export function resolveAppPreferencesFilePath(): string {
  return resolveDeepClawPath('app-preferences.json')
}

export function resolveDatabasePath(): string {
  return resolveDeepClawPath('deepclaw.db')
}
