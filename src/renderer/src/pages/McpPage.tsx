import { Button, Switch } from '@/components/ui'
import type { McpConnection, McpConnectionStatus, McpServerConfig } from '@shared/types'
import {
  CircleAlert,
  CircleDashed,
  LoaderCircle,
  Network,
  Plus,
  RefreshCw,
  Save,
  Trash2
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../i18n'

type McpDraft = {
  originalName: string | null
  name: string
  command: string
  argsText: string
  cwd: string
  envText: string
  disabled: boolean
}

const POLL_INTERVAL_MS = 30_000

const emptyDraft = (): McpDraft => ({
  originalName: null,
  name: 'new-server',
  command: '',
  argsText: '',
  cwd: '',
  envText: '{}',
  disabled: false
})

const STATUS_STYLE: Record<McpConnectionStatus['status'], string> = {
  ok: 'bg-[#eef8ef] text-[#2f7d46]',
  disabled: 'bg-[#f3f3f6] text-[#6b6b7a]',
  error: 'bg-[#fff1f2] text-[#b42318]',
  checking: 'bg-[#eef5ff] text-[#1d4ed8]'
}

const draftFromConnection = (connection: McpConnection): McpDraft => ({
  originalName: connection.name,
  name: connection.name,
  command: connection.config.command,
  argsText: connection.config.args?.join('\n') ?? '',
  cwd: connection.config.cwd ?? '',
  envText: JSON.stringify(connection.config.env ?? {}, null, 2),
  disabled: Boolean(connection.config.disabled)
})

const parseEnvText = (source: string): Record<string, string> | undefined => {
  const trimmed = source.trim()
  if (!trimmed || trimmed === '{}') {
    return undefined
  }

  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Environment must be a JSON object.')
  }

  const entries = Object.entries(parsed as Record<string, unknown>)
    .map(([key, value]) => [key.trim(), String(value)] as const)
    .filter(([key]) => Boolean(key))

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

const configFromDraft = (draft: McpDraft): McpServerConfig => {
  const command = draft.command.trim()
  if (!command) {
    throw new Error('Command is required.')
  }

  const args = draft.argsText
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
  const cwd = draft.cwd.trim()

  return {
    command,
    args: args.length > 0 ? args : undefined,
    env: parseEnvText(draft.envText),
    cwd: cwd || undefined,
    disabled: draft.disabled
  }
}

const getStatusLabel = (status: McpConnectionStatus | undefined): string => {
  if (!status) return 'unknown'
  return status.status
}

export const McpPage = () => {
  const { t, formatDateTime } = useI18n()
  const [connections, setConnections] = useState<McpConnection[]>([])
  const [configPath, setConfigPath] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [draft, setDraft] = useState<McpDraft>(emptyDraft)
  const [statuses, setStatuses] = useState<Record<string, McpConnectionStatus>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.name === selectedName) ?? null,
    [connections, selectedName]
  )

  const selectedStatus = selectedName ? statuses[selectedName] : undefined
  const okCount = useMemo(
    () => Object.values(statuses).filter((status) => status.status === 'ok').length,
    [statuses]
  )

  const applySettings = useCallback((nextConnections: McpConnection[], nextPath: string) => {
    setConnections(nextConnections)
    setConfigPath(nextPath)
    setSelectedName((current) => {
      if (current && nextConnections.some((connection) => connection.name === current)) {
        return current
      }
      return nextConnections[0]?.name ?? null
    })
  }, [])

  const refreshStatuses = useCallback(async () => {
    setIsChecking(true)
    setStatuses((current) => {
      const next = { ...current }
      for (const connection of connections) {
        next[connection.name] = {
          name: connection.name,
          status: connection.config.disabled ? 'disabled' : 'checking',
          latencyMs: null,
          toolCount: 0,
          tools: [],
          error: null,
          checkedAt: Date.now()
        }
      }
      return next
    })

    try {
      const results = await window.context.testMcpConnections()
      setStatuses(Object.fromEntries(results.map((status) => [status.name, status])))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('mcp.checkFailed'))
    } finally {
      setIsChecking(false)
    }
  }, [connections, t])

  const loadConnections = useCallback(async () => {
    setIsLoading(true)
    try {
      const settings = await window.context.listMcpConnections()
      applySettings(settings.servers, settings.filePath)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('mcp.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }, [applySettings, t])

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  useEffect(() => {
    if (selectedConnection) {
      setDraft(draftFromConnection(selectedConnection))
      return
    }

    if (connections.length === 0) {
      setDraft(emptyDraft())
    }
  }, [connections.length, selectedConnection])

  useEffect(() => {
    if (connections.length === 0) {
      setStatuses({})
      return
    }

    void refreshStatuses()
    const timer = window.setInterval(() => {
      void refreshStatuses()
    }, POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [connections.length, refreshStatuses])

  const handleAdd = () => {
    setSelectedName(null)
    setDraft(emptyDraft())
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const name = draft.name.trim()
      if (!name) {
        throw new Error('Name is required.')
      }

      const settings = await window.context.saveMcpConnection({
        originalName: draft.originalName,
        name,
        config: configFromDraft(draft)
      })
      applySettings(settings.servers, settings.filePath)
      setSelectedName(name)
      toast.success(t('mcp.saved'))
      void refreshStatuses()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('mcp.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!draft.originalName) {
      handleAdd()
      return
    }

    const confirmed = window.confirm(t('mcp.deleteConfirm', { name: draft.originalName }))
    if (!confirmed) {
      return
    }

    try {
      const settings = await window.context.removeMcpConnection(draft.originalName)
      applySettings(settings.servers, settings.filePath)
      toast.success(t('mcp.deleted'))
      void refreshStatuses()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('mcp.deleteFailed'))
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--content-bg)]">
      <aside className="flex w-[340px] min-w-[340px] flex-col border-r border-[var(--border-soft)] px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[24px] font-semibold text-[var(--ink-main)]">{t('mcp.title')}</p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--ink-faint)]">
              {t('mcp.description', { ok: okCount, total: connections.length })}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void refreshStatuses()}
            disabled={isLoading || isChecking || connections.length === 0}
            aria-label={t('common.refresh')}
          >
            {isChecking ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          </Button>
        </div>

        <p className="mt-4 truncate text-[11px] text-[var(--ink-faint)]" title={configPath}>
          {configPath || t('common.notSet')}
        </p>

        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {connections.length === 0 && !isLoading ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[#fafafc] px-4 py-6 text-[13px] leading-6 text-[var(--ink-faint)]">
              {t('mcp.empty')}
            </div>
          ) : null}

          {connections.map((connection) => {
            const isSelected = selectedName === connection.name
            const status = statuses[connection.name]
            return (
              <button
                key={connection.name}
                type="button"
                className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-all ${
                  isSelected
                    ? 'bg-[var(--sidebar-nav-active-bg)] text-[var(--ink-main)] shadow-[0_8px_24px_rgba(0,0,0,0.06)]'
                    : 'text-[var(--ink-subtle)] hover:bg-[var(--sidebar-nav-hover-bg)] hover:text-[var(--ink-main)]'
                }`}
                onClick={() => setSelectedName(connection.name)}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--sidebar-icon-bg)]">
                  <Network className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-medium">{connection.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                        status ? STATUS_STYLE[status.status] : 'bg-[#f3f3f6] text-[#6b6b7a]'
                      }`}
                    >
                      {getStatusLabel(status)}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-[12px] text-[var(--ink-faint)]">
                    {connection.config.command}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <Button type="button" className="mt-4" onClick={handleAdd}>
          <Plus />
          {t('mcp.addConnection')}
        </Button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-auto px-8 py-7">
        <header className="flex items-start justify-between gap-6 border-b border-[var(--border-soft)] pb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--shell-bg)]">
                <Network className="h-5 w-5 text-[var(--ink-main)]" />
              </div>
              <div>
                <p className="text-[26px] font-semibold text-[var(--ink-main)]">
                  {draft.originalName ? draft.originalName : t('mcp.newConnection')}
                </p>
                <p className="mt-1 text-[13px] text-[var(--ink-faint)]">{t('mcp.pollingHint')}</p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void refreshStatuses()}>
              {isChecking ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              {t('mcp.testNow')}
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleRemove()}>
              <Trash2 />
              {t('common.delete')}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? <LoaderCircle className="animate-spin" /> : <Save />}
              {t('common.save')}
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px] gap-6 pt-6">
          <form
            className="flex min-w-0 flex-col gap-4"
            onSubmit={(event) => event.preventDefault()}
          >
            <label className="flex flex-col gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                {t('mcp.name')}
              </span>
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                className="h-11 rounded-xl border border-[var(--border-soft)] bg-white px-3 text-[14px] outline-none focus:border-[var(--border-medium)]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                {t('mcp.command')}
              </span>
              <input
                value={draft.command}
                placeholder="npx"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, command: event.target.value }))
                }
                className="h-11 rounded-xl border border-[var(--border-soft)] bg-white px-3 text-[14px] outline-none focus:border-[var(--border-medium)]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                {t('mcp.args')}
              </span>
              <textarea
                value={draft.argsText}
                placeholder={'-y\n@playwright/mcp@latest'}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, argsText: event.target.value }))
                }
                className="min-h-[140px] rounded-xl border border-[var(--border-soft)] bg-white px-3 py-3 font-mono text-[12px] leading-6 outline-none focus:border-[var(--border-medium)]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                {t('mcp.cwd')}
              </span>
              <input
                value={draft.cwd}
                placeholder={t('mcp.cwdPlaceholder')}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, cwd: event.target.value }))
                }
                className="h-11 rounded-xl border border-[var(--border-soft)] bg-white px-3 text-[14px] outline-none focus:border-[var(--border-medium)]"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                {t('mcp.env')}
              </span>
              <textarea
                value={draft.envText}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, envText: event.target.value }))
                }
                className="min-h-[150px] rounded-xl border border-[var(--border-soft)] bg-white px-3 py-3 font-mono text-[12px] leading-6 outline-none focus:border-[var(--border-medium)]"
              />
            </label>
          </form>

          <aside className="flex min-h-0 flex-col gap-4">
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--shell-bg)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-[var(--ink-main)]">
                    {t('mcp.enabled')}
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--ink-faint)]">
                    {t('mcp.enabledDescription')}
                  </p>
                </div>
                <Switch
                  checked={!draft.disabled}
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({ ...current, disabled: !checked }))
                  }
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--shell-bg)] p-4">
              <div className="flex items-center gap-2">
                {selectedStatus?.status === 'ok' ? (
                  <Network className="h-4 w-4 text-[#2f7d46]" />
                ) : selectedStatus?.status === 'checking' ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-[#1d4ed8]" />
                ) : selectedStatus?.status === 'error' ? (
                  <CircleAlert className="h-4 w-4 text-[#b42318]" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-[var(--ink-faint)]" />
                )}
                <span className="text-[13px] font-semibold text-[var(--ink-main)]">
                  {getStatusLabel(selectedStatus)}
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-3 text-[12px] leading-5 text-[var(--ink-faint)]">
                <span>{t('mcp.toolCount', { count: selectedStatus?.toolCount ?? 0 })}</span>
                <span>
                  {t('mcp.latency', {
                    latency:
                      selectedStatus?.latencyMs == null
                        ? t('common.notSet')
                        : `${selectedStatus.latencyMs}ms`
                  })}
                </span>
                <span>
                  {t('mcp.lastChecked', {
                    time: formatDateTime(selectedStatus?.checkedAt)
                  })}
                </span>
                {selectedStatus?.error ? (
                  <span className="break-words text-[#b42318]">{selectedStatus.error}</span>
                ) : null}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--border-soft)] bg-[#0f1115]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/70">
                  {t('mcp.tools')}
                </span>
                <span className="text-[12px] text-white/40">
                  {selectedStatus?.tools.length ?? 0}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-[12px] leading-6 text-white/78">
                {selectedStatus?.tools.length ? (
                  selectedStatus.tools.map((tool) => <div key={tool}>{tool}</div>)
                ) : (
                  <div className="flex h-full items-center justify-center text-white/35">
                    {t('mcp.noTools')}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
