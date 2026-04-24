import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

import type { ChatEvent } from '@shared/models'
import type {
  ToolInstallEvent,
  ToolInstallStatus,
  ToolInstallTarget,
  ToolInstallTargetId
} from '@shared/types'

import { AnthropicChatRuntime } from '../agent'
import { validateRuntimeConfig } from '../agent/config'
import { loadInstalledSkillsFromDir } from '../agent/skills/loadSkillsDir'
import { createToolsAsync } from '../agent/tools'
import type { Tool } from '../agent/tools'
import { ChatSessionStore } from '../chat/session-store'

const execFileAsync = promisify(execFile)

type PlatformId = 'win32' | 'darwin'

type ToolTargetDefinition = {
  id: ToolInstallTargetId
  name: string
  description: string
  platforms: PlatformId[]
  statusChecks: Array<{
    command: string
    args: string[]
    parseVersion?: (output: string) => string | null
    isInstalled?: (output: string) => boolean
  }>
}

type ActiveInstallRun = {
  runId: string
  targetId: ToolInstallTargetId
  abortController: AbortController
  cancelled: boolean
}

class ToolInstallerUsageStore extends ChatSessionStore {
  override async appendUsageRecord(): Promise<void> {
    return
  }

  override appendToolUsageRecord(): void {
    return
  }

  override appendSkillUsageRecord(): void {
    return
  }
}

const firstLine = (text: string): string | null => {
  const line = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean)
  return line ?? null
}

const parseSemver = (text: string): string | null => {
  const match = text.match(/\d+\.\d+(?:\.\d+)?/)
  return match?.[0] ?? firstLine(text)
}

const commandForPlatform = (command: string): string => {
  if (process.platform !== 'win32') {
    return command
  }

  if (['npx', 'pnpm'].includes(command)) {
    return `${command}.cmd`
  }

  return command
}

const PYTHON_COMMAND_CANDIDATES =
  process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python']

const TOOL_TARGETS: ToolTargetDefinition[] = [
  {
    id: 'nodejs-lts',
    name: 'Node.js LTS',
    description: 'Runtime and npm toolchain for JavaScript and TypeScript workflows.',
    platforms: ['win32', 'darwin'],
    statusChecks: [{ command: 'node', args: ['--version'], parseVersion: parseSemver }]
  },
  {
    id: 'python',
    name: 'Python + pip',
    description: 'User Python interpreter and pip package manager used by scripts and skills.',
    platforms: ['win32', 'darwin'],
    statusChecks: []
  },
  {
    id: 'playwright-browsers',
    name: 'Playwright Browsers',
    description: 'Browser binaries used by Playwright for browser automation and testing.',
    platforms: ['win32', 'darwin'],
    statusChecks: [
      {
        command: 'npx',
        args: ['playwright', '--version'],
        parseVersion: parseSemver,
        isInstalled: (output) => /version\s+\d+\.\d+/i.test(output)
      }
    ]
  },
  {
    id: 'ripgrep',
    name: 'ripgrep',
    description: 'Fast text search used by development and agent workflows.',
    platforms: ['win32', 'darwin'],
    statusChecks: [{ command: 'rg', args: ['--version'], parseVersion: parseSemver }]
  },
  {
    id: 'git',
    name: 'Git',
    description: 'Version control command-line tools.',
    platforms: ['win32', 'darwin'],
    statusChecks: [{ command: 'git', args: ['--version'], parseVersion: parseSemver }]
  },
  {
    id: 'pnpm',
    name: 'pnpm',
    description: 'Fast package manager for Node.js projects.',
    platforms: ['win32', 'darwin'],
    statusChecks: [{ command: 'pnpm', args: ['--version'], parseVersion: parseSemver }]
  }
]

const getPlatformNotes = (): string => {
  if (process.platform === 'win32') {
    return [
      'Preferred Windows installers: winget install --exact --id OpenJS.NodeJS.LTS, Python.Python.3, BurntSushi.ripgrep.MSVC, Git.Git.',
      'For Python, first verify any existing user Python and pip with python --version or py --version plus python -m pip --version or py -m pip --version. Do not require Python 3.12.',
      'Use PowerShell-compatible commands. Refresh PATH when needed by reading machine/user environment variables.',
      'For pnpm, prefer corepack enable and corepack prepare pnpm@latest --activate after Node.js is available.',
      'For Playwright browsers, run npx playwright install chromium or the minimal browser set needed, then verify.'
    ].join('\n')
  }

  if (process.platform === 'darwin') {
    return [
      'Preferred macOS installer: Homebrew.',
      'Use brew install node python ripgrep git pnpm when missing.',
      'For Python, first verify any existing user Python and pip with python3 --version plus python3 -m pip --version. Do not require Python 3.12.',
      'For Playwright browsers, run npx playwright install chromium or the minimal browser set needed, then verify.',
      'If Homebrew is missing, explain the blocker and install it only if the shell command can run non-interactively.'
    ].join('\n')
  }

  return [
    'This UI is first-class for Windows and macOS. On other platforms, use the platform package manager when obvious.',
    'Prefer non-interactive commands and verify installation before finishing.'
  ].join('\n')
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const findTarget = (targetId: ToolInstallTargetId): ToolTargetDefinition => {
  const target = TOOL_TARGETS.find((item) => item.id === targetId)
  if (!target) {
    throw new Error(`Unknown tool target: ${targetId}`)
  }
  return target
}

const eventFromChatEvent = (
  runId: string,
  targetId: ToolInstallTargetId,
  event: ChatEvent
): ToolInstallEvent | null => {
  if (event.type === 'assistant.delta' && event.delta.trim()) {
    return {
      type: 'log',
      runId,
      targetId,
      message: event.delta,
      timestamp: Date.now()
    }
  }

  if (event.type === 'tool.called') {
    return {
      type: 'tool',
      runId,
      targetId,
      toolName: event.toolName,
      summary: event.argsSummary,
      isError: false,
      timestamp: Date.now()
    }
  }

  if (event.type === 'tool.completed') {
    return {
      type: 'tool',
      runId,
      targetId,
      toolName: event.toolName,
      summary: event.outputSummary,
      isError: event.isError,
      timestamp: Date.now()
    }
  }

  if (event.type === 'session.error') {
    return {
      type: 'error',
      runId,
      targetId,
      message: event.message,
      timestamp: Date.now()
    }
  }

  return null
}

const buildInstallPrompt = (target: ToolTargetDefinition): string => {
  return [
    'You are a tool installer sub-agent inside the DeepClaw desktop app.',
    'Install and verify exactly this requested developer tool.',
    '',
    `Target: ${target.name} (${target.id})`,
    `Purpose: ${target.description}`,
    `Current platform: ${process.platform}`,
    '',
    'Rules:',
    '- Use available shell, file, browser, MCP, and other tools when they help.',
    '- Prefer deterministic package-manager commands over manual downloads.',
    '- Use non-interactive commands where possible.',
    '- Diagnose and repair common install failures, including PATH refresh issues.',
    '- Do not modify this application source code.',
    '- Finish only after a verification command succeeds, or clearly state the blocker.',
    '',
    'Platform guidance:',
    getPlatformNotes()
  ].join('\n')
}

export class ToolInstallerService {
  private activeRun: ActiveInstallRun | null = null
  private readonly lastRunByTarget = new Map<
    ToolInstallTargetId,
    { runId: string; status: ToolInstallStatus; error: string | null }
  >()

  constructor(private readonly publish: (event: ToolInstallEvent) => void) {}

  async listTargets(): Promise<ToolInstallTarget[]> {
    return Promise.all(TOOL_TARGETS.map((target) => this.toTargetStatus(target)))
  }

  async startInstall(targetId: ToolInstallTargetId): Promise<{ runId: string }> {
    const target = findTarget(targetId)
    if (!target.platforms.includes(process.platform as PlatformId)) {
      throw new Error(`${target.name} installer is not configured for ${process.platform}.`)
    }

    const validation = validateRuntimeConfig()
    if (!validation.ok) {
      throw new Error(validation.message)
    }

    if (this.activeRun) {
      throw new Error('Another tool install is already running.')
    }

    const runId = `tool_install_${randomUUID()}`
    const abortController = new AbortController()
    this.activeRun = {
      runId,
      targetId,
      abortController,
      cancelled: false
    }
    this.lastRunByTarget.set(targetId, { runId, status: 'running', error: null })
    this.publish({
      type: 'start',
      runId,
      targetId,
      targetName: target.name,
      timestamp: Date.now()
    })

    void this.runInstall(target, runId, abortController).catch((error: unknown) => {
      this.finishRun(runId, targetId, 'failed', toErrorMessage(error))
    })

    return { runId }
  }

  async cancelInstall(runId: string): Promise<void> {
    if (!this.activeRun || this.activeRun.runId !== runId) {
      return
    }

    this.activeRun.cancelled = true
    this.activeRun.abortController.abort()
    this.publish({
      type: 'log',
      runId,
      targetId: this.activeRun.targetId,
      message: 'Cancellation requested.',
      timestamp: Date.now()
    })
  }

  private async runInstall(
    target: ToolTargetDefinition,
    runId: string,
    abortController: AbortController
  ): Promise<void> {
    const allTools = await createToolsAsync()
    const childTools = allTools.filter((tool: Tool) => tool.name !== 'sub_agent')
    const runtime = new AnthropicChatRuntime({
      usageStore: new ToolInstallerUsageStore(),
      installedSkills: loadInstalledSkillsFromDir(),
      toolsFactory: () => childTools
    })

    let finalText = ''
    let sawError = false

    for await (const event of runtime.runTurn({
      sessionId: runId,
      userText: buildInstallPrompt(target),
      history: [],
      maxTokens: 4096,
      signal: abortController.signal
    })) {
      const installEvent = eventFromChatEvent(runId, target.id, event)
      if (installEvent) {
        this.publish(installEvent)
      }

      if (event.type === 'assistant.completed') {
        finalText = event.text.trim()
      } else if (event.type === 'session.error') {
        sawError = true
      } else if (event.type === 'session.cancelled') {
        this.finishRun(runId, target.id, 'failed', 'Install was cancelled.')
        return
      }
    }

    const status = await this.checkTarget(target)
    if (status.status === 'installed') {
      this.finishRun(
        runId,
        target.id,
        'installed',
        status.version ? `${target.name} ready: ${status.version}` : `${target.name} is ready.`
      )
      return
    }

    const message =
      finalText ||
      status.lastError ||
      (sawError ? 'Installer agent reported an error.' : 'Install finished but verification failed.')
    this.finishRun(runId, target.id, 'failed', message)
  }

  private finishRun(
    runId: string,
    targetId: ToolInstallTargetId,
    status: Exclude<ToolInstallStatus, 'running'>,
    message: string
  ): void {
    if (this.activeRun?.runId === runId) {
      this.activeRun = null
    }

    this.lastRunByTarget.set(targetId, {
      runId,
      status,
      error: status === 'installed' ? null : message
    })
    this.publish({
      type: 'finish',
      runId,
      targetId,
      status,
      message,
      timestamp: Date.now()
    })
  }

  private async toTargetStatus(target: ToolTargetDefinition): Promise<ToolInstallTarget> {
    const lastRun = this.lastRunByTarget.get(target.id)
    const checked = await this.checkTarget(target)
    const isRunning = this.activeRun?.targetId === target.id

    return {
      id: target.id,
      name: target.name,
      description: target.description,
      platforms: target.platforms,
      status: isRunning ? 'running' : checked.status,
      version: checked.version,
      lastCheckedAt: Date.now(),
      lastRunId: lastRun?.runId ?? null,
      lastError: checked.status === 'installed' ? null : lastRun?.error ?? checked.lastError
    }
  }

  private async checkTarget(target: ToolTargetDefinition): Promise<{
    status: Exclude<ToolInstallStatus, 'running'>
    version: string | null
    lastError: string | null
  }> {
    if (!target.platforms.includes(process.platform as PlatformId)) {
      return {
        status: 'unknown',
        version: null,
        lastError: `Unsupported platform: ${process.platform}`
      }
    }

    if (target.id === 'python') {
      return this.checkPythonAndPip()
    }

    let lastError: string | null = null
    for (const check of target.statusChecks) {
      try {
        const { stdout, stderr } = await execFileAsync(commandForPlatform(check.command), check.args, {
          timeout: 12_000,
          windowsHide: true
        })
        const output = `${stdout ?? ''}\n${stderr ?? ''}`.trim()
        const installed = check.isInstalled ? check.isInstalled(output) : true
        if (installed) {
          return {
            status: 'installed',
            version: check.parseVersion?.(output) ?? firstLine(output),
            lastError: null
          }
        }
        lastError = `${target.name} was found but did not match the required version.`
      } catch (error) {
        lastError = toErrorMessage(error)
      }
    }

    return {
      status: 'missing',
      version: null,
      lastError
    }
  }

  private async checkPythonAndPip(): Promise<{
    status: Exclude<ToolInstallStatus, 'running'>
    version: string | null
    lastError: string | null
  }> {
    let lastError: string | null = null

    for (const command of PYTHON_COMMAND_CANDIDATES) {
      try {
        const pythonResult = await execFileAsync(commandForPlatform(command), ['--version'], {
          timeout: 12_000,
          windowsHide: true
        })
        const pythonOutput = `${pythonResult.stdout ?? ''}\n${pythonResult.stderr ?? ''}`.trim()
        const pythonVersion = firstLine(pythonOutput)

        const pipResult = await execFileAsync(commandForPlatform(command), ['-m', 'pip', '--version'], {
          timeout: 12_000,
          windowsHide: true
        })
        const pipOutput = `${pipResult.stdout ?? ''}\n${pipResult.stderr ?? ''}`.trim()
        const pipVersion = firstLine(pipOutput)

        return {
          status: 'installed',
          version: [pythonVersion, pipVersion].filter(Boolean).join(' / '),
          lastError: null
        }
      } catch (error) {
        lastError = `${command}: ${toErrorMessage(error)}`
      }
    }

    return {
      status: 'missing',
      version: null,
      lastError
    }
  }
}
