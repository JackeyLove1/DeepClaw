import { Button } from '@/components/ui'
import type {
  ToolInstallEvent,
  ToolInstallStatus,
  ToolInstallTarget,
  ToolInstallTargetId
} from '@shared/types'
import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  LoaderCircle,
  RefreshCw,
  SquareTerminal,
  Wrench
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useI18n, type TranslationKey } from '../i18n'

type InstallLogLine = {
  id: string
  runId: string
  targetId: ToolInstallTargetId
  level: 'info' | 'error'
  text: string
  timestamp: number
}

const STATUS_STYLE: Record<ToolInstallStatus, string> = {
  installed: 'bg-[#eef8ef] text-[#2f7d46]',
  missing: 'bg-[#fff7ed] text-[#9a3412]',
  running: 'bg-[#eef5ff] text-[#1d4ed8]',
  failed: 'bg-[#fff1f2] text-[#b42318]',
  unknown: 'bg-[#f3f3f6] text-[#6b6b7a]'
}

const TARGET_ICON: Record<ToolInstallTargetId, string> = {
  'nodejs-lts': 'JS',
  python: 'PY',
  'playwright-browsers': 'PW',
  ripgrep: 'RG',
  git: 'GT',
  pnpm: 'PN'
}

const formatPlatform = (platform: string): string => {
  if (platform === 'win32') return 'Windows'
  if (platform === 'darwin') return 'macOS'
  return platform
}

const getStatusKey = (status: ToolInstallStatus): TranslationKey =>
  `tools.status.${status}` as TranslationKey

const toLogLine = (event: ToolInstallEvent): InstallLogLine | null => {
  if (event.type === 'start') {
    return {
      id: `${event.runId}-${event.timestamp}-start`,
      runId: event.runId,
      targetId: event.targetId,
      level: 'info',
      text: `Started ${event.targetName} installer.`,
      timestamp: event.timestamp
    }
  }

  if (event.type === 'log') {
    return {
      id: `${event.runId}-${event.timestamp}-log`,
      runId: event.runId,
      targetId: event.targetId,
      level: 'info',
      text: event.message,
      timestamp: event.timestamp
    }
  }

  if (event.type === 'tool') {
    return {
      id: `${event.runId}-${event.timestamp}-${event.toolName}`,
      runId: event.runId,
      targetId: event.targetId,
      level: event.isError ? 'error' : 'info',
      text: `${event.toolName}: ${event.summary}`,
      timestamp: event.timestamp
    }
  }

  if (event.type === 'finish' || event.type === 'error') {
    return {
      id: `${event.runId}-${event.timestamp}-${event.type}`,
      runId: event.runId,
      targetId: event.targetId,
      level: event.type === 'error' || event.status === 'failed' ? 'error' : 'info',
      text: event.message,
      timestamp: event.timestamp
    }
  }

  return null
}

export const ToolsPage = () => {
  const { t, formatDateTime } = useI18n()
  const [targets, setTargets] = useState<ToolInstallTarget[]>([])
  const [selectedTargetId, setSelectedTargetId] = useState<ToolInstallTargetId | null>(null)
  const [logs, setLogs] = useState<InstallLogLine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)

  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === selectedTargetId) ?? targets[0] ?? null,
    [selectedTargetId, targets]
  )

  const selectedLogs = useMemo(
    () => logs.filter((line) => !selectedTarget || line.targetId === selectedTarget.id).slice(-120),
    [logs, selectedTarget]
  )

  const readyCount = useMemo(
    () => targets.filter((target) => target.status === 'installed').length,
    [targets]
  )

  const loadTargets = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }

    try {
      const nextTargets = await window.context.listToolInstallTargets()
      setTargets(nextTargets)
      setActiveRunId(nextTargets.find((target) => target.status === 'running')?.lastRunId ?? null)
      setSelectedTargetId((current) => {
        if (current && nextTargets.some((target) => target.id === current)) {
          return current
        }
        return nextTargets[0]?.id ?? null
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('tools.loadFailed'))
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [t])

  useEffect(() => {
    void loadTargets()
  }, [loadTargets])

  useEffect(() => {
    const unsubscribe = window.context.subscribeToolInstallEvents((event) => {
      const line = toLogLine(event)
      if (line) {
        setLogs((current) => [...current, line])
      }

      if (event.type === 'start') {
        setActiveRunId(event.runId)
        setSelectedTargetId(event.targetId)
        setTargets((current) =>
          current.map((target) =>
            target.id === event.targetId
              ? { ...target, status: 'running', lastRunId: event.runId, lastError: null }
              : target
          )
        )
      }

      if (event.type === 'finish') {
        setActiveRunId((current) => (current === event.runId ? null : current))
        setTargets((current) =>
          current.map((target) =>
            target.id === event.targetId
              ? {
                  ...target,
                  status: event.status,
                  lastRunId: event.runId,
                  lastError: event.status === 'installed' ? null : event.message
                }
              : target
          )
        )
        void loadTargets('refresh')
      }

      if (event.type === 'error') {
        toast.error(event.message)
      }
    })

    return unsubscribe
  }, [loadTargets])

  const handleInstall = async (target: ToolInstallTarget) => {
    try {
      setLogs((current) => current.filter((line) => line.targetId !== target.id))
      const { runId } = await window.context.startToolInstall(target.id)
      setActiveRunId(runId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('tools.installFailed'))
    }
  }

  const handleCancel = async () => {
    if (!activeRunId) {
      return
    }

    try {
      await window.context.cancelToolInstall(activeRunId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('tools.cancelFailed'))
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--content-bg)]">
      <aside className="flex w-[340px] min-w-[340px] flex-col border-r border-[var(--border-soft)] px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[24px] font-semibold text-[var(--ink-main)]">{t('tools.title')}</p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--ink-faint)]">
              {t('tools.description', { ready: readyCount, total: targets.length })}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void loadTargets('refresh')}
            disabled={isLoading || isRefreshing}
            aria-label={t('common.refresh')}
          >
            <RefreshCw className={isRefreshing ? 'animate-spin' : ''} />
          </Button>
        </div>

        <div className="mt-6 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {targets.map((target) => {
            const isSelected = selectedTarget?.id === target.id
            return (
              <button
                key={target.id}
                type="button"
                className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-all ${
                  isSelected
                    ? 'bg-[var(--sidebar-nav-active-bg)] text-[var(--ink-main)] shadow-[0_8px_24px_rgba(0,0,0,0.06)]'
                    : 'text-[var(--ink-subtle)] hover:bg-[var(--sidebar-nav-hover-bg)] hover:text-[var(--ink-main)]'
                }`}
                onClick={() => setSelectedTargetId(target.id)}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--sidebar-icon-bg)] text-[12px] font-semibold">
                  {TARGET_ICON[target.id]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-medium">{t(`tools.target.${target.id}.name` as TranslationKey)}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[target.status]}`}
                    >
                      {t(getStatusKey(target.status))}
                    </span>
                  </span>
                  <span className="mt-1 block line-clamp-2 text-[12px] leading-5 text-[var(--ink-faint)]">
                    {t(`tools.target.${target.id}.description` as TranslationKey)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col px-8 py-7">
        {selectedTarget ? (
          <>
            <header className="flex items-start justify-between gap-6 border-b border-[var(--border-soft)] pb-6">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--shell-bg)]">
                    <Wrench className="h-5 w-5 text-[var(--ink-main)]" />
                  </div>
                  <div>
                    <p className="text-[26px] font-semibold text-[var(--ink-main)]">
                      {t(`tools.target.${selectedTarget.id}.name` as TranslationKey)}
                    </p>
                    <p className="mt-1 text-[13px] text-[var(--ink-faint)]">
                      {selectedTarget.platforms.map(formatPlatform).join(' / ')}
                    </p>
                  </div>
                </div>
                <p className="mt-5 max-w-[720px] text-[14px] leading-7 text-[var(--ink-subtle)]">
                  {t(`tools.target.${selectedTarget.id}.description` as TranslationKey)}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {selectedTarget.status === 'running' ? (
                  <Button type="button" variant="outline" onClick={() => void handleCancel()}>
                    {t('common.stop')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  onClick={() => void handleInstall(selectedTarget)}
                  disabled={Boolean(activeRunId)}
                >
                  {selectedTarget.status === 'running' ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <SquareTerminal />
                  )}
                  {selectedTarget.status === 'installed'
                    ? t('tools.reinstall')
                    : t('tools.install')}
                </Button>
              </div>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] gap-6 pt-6">
              <div className="flex flex-col gap-3">
                <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--shell-bg)] p-4">
                  <div className="flex items-center gap-2">
                    {selectedTarget.status === 'installed' ? (
                      <CheckCircle2 className="h-4 w-4 text-[#2f7d46]" />
                    ) : selectedTarget.status === 'running' ? (
                      <LoaderCircle className="h-4 w-4 animate-spin text-[#1d4ed8]" />
                    ) : selectedTarget.status === 'failed' ? (
                      <CircleAlert className="h-4 w-4 text-[#b42318]" />
                    ) : (
                      <CircleDashed className="h-4 w-4 text-[var(--ink-faint)]" />
                    )}
                    <span className="text-[13px] font-semibold text-[var(--ink-main)]">
                      {t(getStatusKey(selectedTarget.status))}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 text-[12px] leading-5 text-[var(--ink-faint)]">
                    <span>{t('tools.version', { version: selectedTarget.version ?? t('common.notSet') })}</span>
                    <span>
                      {t('tools.lastChecked', {
                        time: formatDateTime(selectedTarget.lastCheckedAt)
                      })}
                    </span>
                    {selectedTarget.lastError ? (
                      <span className="text-[#b42318]">{selectedTarget.lastError}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col rounded-2xl border border-[var(--border-soft)] bg-[#0f1115]">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/70">
                    {t('tools.liveLog')}
                  </span>
                  <span className="text-[12px] text-white/40">{selectedLogs.length}</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-[12px] leading-6">
                  {selectedLogs.length > 0 ? (
                    selectedLogs.map((line) => (
                      <div
                        key={line.id}
                        className={line.level === 'error' ? 'text-[#ffb4ab]' : 'text-white/78'}
                      >
                        <span className="text-white/35">
                          {new Date(line.timestamp).toLocaleTimeString()}
                        </span>{' '}
                        {line.text}
                      </div>
                    ))
                  ) : (
                    <div className="flex h-full items-center justify-center text-white/35">
                      {t('tools.noLog')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--ink-faint)]">
            {isLoading ? t('common.loading') : t('tools.empty')}
          </div>
        )}
      </div>
    </section>
  )
}
