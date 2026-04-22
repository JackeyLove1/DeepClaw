import type { AiChannelConfig, AiChannelSettings } from '@shared/types'
import { Check, Eye, EyeOff, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n'

type SaveState = 'idle' | 'saved' | 'error'
type TestState = 'idle' | 'success' | 'error'

const createEmptyChannel = (): AiChannelConfig => ({
  id: crypto.randomUUID(),
  name: '',
  baseUrl: '',
  apiKey: '',
  model: ''
})

const isChannelComplete = (channel: AiChannelConfig | null): boolean =>
  Boolean(
    channel &&
      channel.name.trim() &&
      channel.baseUrl.trim() &&
      channel.apiKey.trim() &&
      channel.model.trim()
  )

const selectInitialChannelId = (settings: AiChannelSettings): string | null =>
  settings.activeChannelId ?? settings.channels[0]?.id ?? null

export const CommonSettingsSection = () => {
  const { t } = useI18n()
  const [settings, setSettings] = useState<AiChannelSettings>({ channels: [], activeChannelId: null })
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [testState, setTestState] = useState<TestState>('idle')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const selectedChannel = useMemo(
    () => settings.channels.find((channel) => channel.id === selectedChannelId) ?? null,
    [selectedChannelId, settings.channels]
  )

  const canSave = useMemo(() => {
    if (isLoading || isSaving) {
      return false
    }

    return settings.channels.every((channel) => isChannelComplete(channel))
  }, [isLoading, isSaving, settings.channels])

  const canTest = useMemo(
    () => !isLoading && !isTesting && isChannelComplete(selectedChannel),
    [isLoading, isTesting, selectedChannel]
  )

  useEffect(() => {
    let disposed = false

    const loadSettings = async () => {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const nextSettings = await window.context.getAiChannelSettings()
        if (disposed) return

        setSettings(nextSettings)
        setSelectedChannelId(selectInitialChannelId(nextSettings))
      } catch (error) {
        if (!disposed) {
          setErrorMessage(error instanceof Error ? error.message : t('settings.aiChannels.loadFailed'))
        }
      } finally {
        if (!disposed) {
          setIsLoading(false)
        }
      }
    }

    void loadSettings()
    return () => {
      disposed = true
    }
  }, [])

  const updateSelectedChannel = (patch: Partial<AiChannelConfig>) => {
    if (!selectedChannelId) return

    setSettings((current) => ({
      ...current,
      channels: current.channels.map((channel) =>
        channel.id === selectedChannelId ? { ...channel, ...patch } : channel
      )
    }))
    setSaveState('idle')
    setTestState('idle')
    setFeedbackMessage('')
    setErrorMessage('')
  }

  const handleAddChannel = () => {
    const nextChannel = createEmptyChannel()

    setSettings((current) => ({
      channels: [...current.channels, nextChannel],
      activeChannelId: current.activeChannelId ?? nextChannel.id
    }))
    setSelectedChannelId(nextChannel.id)
    setSaveState('idle')
    setTestState('idle')
    setFeedbackMessage('')
    setErrorMessage('')
    setShowApiKey(false)
  }

  const handleDeleteChannel = () => {
    if (!selectedChannelId) return

    setSettings((current) => {
      const nextChannels = current.channels.filter((channel) => channel.id !== selectedChannelId)
      const nextActiveChannelId =
        current.activeChannelId === selectedChannelId
          ? (nextChannels[0]?.id ?? null)
          : current.activeChannelId

      return {
        channels: nextChannels,
        activeChannelId: nextActiveChannelId
      }
    })

    setSelectedChannelId((current) => {
      if (current !== selectedChannelId) {
        return current
      }

      const remaining = settings.channels.filter((channel) => channel.id !== selectedChannelId)
      return remaining[0]?.id ?? null
    })
    setSaveState('idle')
    setTestState('idle')
    setFeedbackMessage('')
    setErrorMessage('')
    setShowApiKey(false)
  }

  const handleSave = async () => {
    if (!canSave) return

    setIsSaving(true)
    setSaveState('idle')
    setTestState('idle')
    setFeedbackMessage('')
    setErrorMessage('')

    try {
      const nextSettings = await window.context.saveAiChannelSettings(settings)
      setSettings(nextSettings)
      setSelectedChannelId((current) => current ?? selectInitialChannelId(nextSettings))
      setSaveState('saved')
      setFeedbackMessage(t('settings.aiChannels.saved'))
    } catch (error) {
      setSaveState('error')
      setErrorMessage(error instanceof Error ? error.message : t('settings.aiChannels.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestConnection = async () => {
    if (!selectedChannel || !canTest) return

    setIsTesting(true)
    setTestState('idle')
    setFeedbackMessage('')
    setErrorMessage('')

    try {
      const result = await window.context.testAiChannelConnection(selectedChannel)
      setTestState('success')
      setFeedbackMessage(
        t('settings.aiChannels.connected', {
          provider: result.provider,
          model: result.model,
          latencyMs: result.latencyMs,
          baseUrl: result.baseUrl
            ? t('settings.aiChannels.connectedVia', { baseUrl: result.baseUrl })
            : ''
        })
      )
    } catch (error) {
      setTestState('error')
      setFeedbackMessage(
        error instanceof Error ? error.message : t('settings.aiChannels.connectionFailed')
      )
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <>
      <div className="rounded-3xl border border-[var(--border-soft)] bg-white px-8 py-7 shadow-[0_14px_38px_rgba(15,15,20,0.05)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold text-[var(--ink-main)]">
              {t('settings.aiChannels.title')}
            </h1>
            <p className="mt-2 max-w-[620px] text-[14px] leading-6 text-[var(--ink-faint)]">
              {t('settings.aiChannels.description')}
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddChannel}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-[var(--border-soft)] bg-[#f8f8fb] px-4 text-[14px] font-medium text-[var(--ink-main)] transition hover:bg-white"
          >
            <Plus className="h-4 w-4" />
            <span>{t('settings.aiChannels.newChannel')}</span>
          </button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-3xl border border-[var(--border-soft)] bg-[#fbfbfe] p-3">
            <div className="space-y-2">
              {settings.channels.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border-soft)] px-4 py-6 text-[13px] leading-6 text-[var(--ink-faint)]">
                  {t('settings.aiChannels.empty')}
                </div>
              ) : (
                settings.channels.map((channel) => {
                  const isSelected = channel.id === selectedChannelId
                  const isActive = channel.id === settings.activeChannelId

                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => {
                        setSelectedChannelId(channel.id)
                        setShowApiKey(false)
                        setTestState('idle')
                        setFeedbackMessage('')
                        setErrorMessage('')
                      }}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? 'border-[var(--ink-main)] bg-white shadow-[0_8px_18px_rgba(15,15,20,0.06)]'
                          : 'border-transparent bg-transparent hover:border-[var(--border-soft)] hover:bg-white/90'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-semibold text-[var(--ink-main)]">
                            {channel.name || t('settings.aiChannels.untitled')}
                          </div>
                          <div className="mt-1 truncate text-[12px] text-[var(--ink-faint)]">
                            {channel.model || t('settings.aiChannels.noModel')}
                          </div>
                        </div>
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#eef6ee] px-2.5 py-1 text-[11px] font-semibold text-[#166534]">
                            <Check className="h-3.5 w-3.5" />
                            {t('settings.aiChannels.active')}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--border-soft)] bg-white px-6 py-6">
            {selectedChannel ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[18px] font-semibold text-[var(--ink-main)]">
                      {t('settings.aiChannels.details')}
                    </div>
                    <div className="mt-2 text-[13px] leading-6 text-[var(--ink-faint)]">
                      {t('settings.aiChannels.detailsDescription')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSettings((current) => ({
                          ...current,
                          activeChannelId: selectedChannel.id
                        }))
                      }
                      className={`inline-flex h-10 items-center rounded-xl px-4 text-[13px] font-medium transition ${
                        settings.activeChannelId === selectedChannel.id
                          ? 'bg-[#111214] text-white'
                          : 'border border-[var(--border-soft)] bg-white text-[var(--ink-main)] hover:bg-[#f6f6fb]'
                      }`}
                    >
                      {settings.activeChannelId === selectedChannel.id
                        ? t('settings.aiChannels.activeDefault')
                        : t('settings.aiChannels.setActive')}
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteChannel}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#f3d0d0] bg-[#fff7f7] px-4 text-[13px] font-medium text-[#b42318] transition hover:bg-[#fff1f1]"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>{t('settings.aiChannels.delete')}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label
                      htmlFor="ai-channel-name"
                      className="mb-2 block text-[14px] font-semibold text-[var(--ink-main)]"
                    >
                      {t('settings.aiChannels.channelName')}
                    </label>
                    <input
                      id="ai-channel-name"
                      value={selectedChannel.name}
                      onChange={(event) => updateSelectedChannel({ name: event.target.value })}
                      placeholder="OpenRouter Claude"
                      className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 text-[14px] text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label
                      htmlFor="ai-channel-base-url"
                      className="mb-2 block text-[14px] font-semibold text-[var(--ink-main)]"
                    >
                      Base URL
                    </label>
                    <input
                      id="ai-channel-base-url"
                      value={selectedChannel.baseUrl}
                      onChange={(event) => updateSelectedChannel({ baseUrl: event.target.value })}
                      placeholder="https://api.anthropic.com"
                      className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 text-[14px] text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label
                      htmlFor="ai-channel-api-key"
                      className="mb-2 block text-[14px] font-semibold text-[var(--ink-main)]"
                    >
                      {t('settings.aiChannels.apiKey')}
                    </label>
                    <div className="flex h-11 items-center rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] pr-2 transition-all focus-within:border-[#b9b9ca] focus-within:bg-white">
                      <input
                        id="ai-channel-api-key"
                        type={showApiKey ? 'text' : 'password'}
                        value={selectedChannel.apiKey}
                        onChange={(event) => updateSelectedChannel({ apiKey: event.target.value })}
                        placeholder={t('settings.aiChannels.apiKeyPlaceholder')}
                        className="h-full min-w-0 flex-1 rounded-l-xl bg-transparent px-3 text-[14px] text-[var(--ink-main)] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((value) => !value)}
                        aria-label={
                          showApiKey
                            ? t('settings.aiChannels.hideApiKey')
                            : t('settings.aiChannels.showApiKey')
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-subtle)] transition-colors hover:bg-[#efeff5] hover:text-[var(--ink-main)]"
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label
                      htmlFor="ai-channel-model"
                      className="mb-2 block text-[14px] font-semibold text-[var(--ink-main)]"
                    >
                      {t('settings.aiChannels.model')}
                    </label>
                    <input
                      id="ai-channel-model"
                      value={selectedChannel.model}
                      onChange={(event) => updateSelectedChannel({ model: event.target.value })}
                      placeholder="claude-sonnet-4-5"
                      className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 text-[14px] text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white"
                    />
                  </div>
                </div>

                {!isChannelComplete(selectedChannel) ? (
                  <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                    {t('settings.aiChannels.incomplete')}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-[var(--border-soft)] bg-[#fbfbfe] px-6 text-center text-[14px] leading-7 text-[var(--ink-faint)]">
                {t('settings.aiChannels.selectOrCreate')}
              </div>
            )}

            {errorMessage ? (
              <div className="mt-5 rounded-xl border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-[13px] text-[#b91c1c]">
                {errorMessage}
              </div>
            ) : null}

            {feedbackMessage ? (
              <div
                className={`mt-5 rounded-xl border px-3 py-2 text-[13px] ${
                  testState === 'error' || saveState === 'error'
                    ? 'border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]'
                    : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'
                }`}
              >
                {feedbackMessage}
              </div>
            ) : null}

            <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={!canTest}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--border-soft)] bg-white px-4 text-[14px] font-medium text-[var(--ink-main)] transition-all hover:bg-[#f6f6fb] disabled:cursor-not-allowed disabled:bg-[#f4f4f7] disabled:text-[#9ca0ad]"
              >
                {isTesting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                <span>
                  {isTesting
                    ? t('settings.aiChannels.testing')
                    : t('settings.aiChannels.testConnection')}
                </span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--ink-main)] px-5 text-[14px] font-medium text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[#c3c3cf]"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span>
                  {isSaving
                    ? t('settings.aiChannels.saving')
                    : t('settings.aiChannels.saveChannels')}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 text-[13px] text-[var(--ink-faint)]">
          {t('settings.aiChannels.loading')}
        </div>
      ) : null}
    </>
  )
}
