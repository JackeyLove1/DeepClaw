import type { ThirdPartyApiKeySettings } from '@shared/types'
import { Eye, EyeOff, KeyRound, LoaderCircle, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type SaveState = 'idle' | 'saved' | 'error'

export const ThirdPartyApiKeysSection = () => {
  const [settings, setSettings] = useState<ThirdPartyApiKeySettings>({ tavilyApiKey: '' })
  const [showTavilyKey, setShowTavilyKey] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState('')

  const hasTavilyKey = useMemo(() => Boolean(settings.tavilyApiKey.trim()), [settings.tavilyApiKey])
  const canSave = !isLoading && !isSaving

  useEffect(() => {
    let disposed = false

    const loadSettings = async () => {
      setIsLoading(true)
      setMessage('')

      try {
        const nextSettings = await window.context.getThirdPartyApiKeySettings()
        if (disposed) return

        setSettings(nextSettings)
      } catch (error) {
        if (!disposed) {
          setSaveState('error')
          setMessage(error instanceof Error ? error.message : 'Failed to load API key settings.')
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

  const updateTavilyApiKey = (value: string) => {
    setSettings((current) => ({ ...current, tavilyApiKey: value }))
    setSaveState('idle')
    setMessage('')
  }

  const saveSettings = async (nextSettings: ThirdPartyApiKeySettings) => {
    if (!canSave) return

    setIsSaving(true)
    setSaveState('idle')
    setMessage('')

    try {
      const savedSettings = await window.context.saveThirdPartyApiKeySettings(nextSettings)
      setSettings(savedSettings)
      setSaveState('saved')
      setMessage(
        savedSettings.tavilyApiKey
          ? 'Tavily API key saved. Web search and extraction are available in new agent turns.'
          : 'Tavily API key cleared. Web tools will be hidden from new agent turns.'
      )
    } catch (error) {
      setSaveState('error')
      setMessage(error instanceof Error ? error.message : 'Failed to save API key settings.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = () => {
    void saveSettings(settings)
  }

  const handleClear = () => {
    void saveSettings({ ...settings, tavilyApiKey: '' })
    setShowTavilyKey(false)
  }

  return (
    <div className="rounded-3xl border border-[var(--border-soft)] bg-white px-8 py-7 shadow-[0_14px_38px_rgba(15,15,20,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-semibold text-[var(--ink-main)]">Third-party APIs</h2>
          <p className="mt-2 max-w-[620px] text-[14px] leading-6 text-[var(--ink-faint)]">
            Store provider keys used by optional agent tools. Keys stay on this device and are
            loaded by the main process when a tool needs them.
          </p>
        </div>
        <span
          className={`inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold ${
            hasTavilyKey ? 'bg-[#eef6ee] text-[#166534]' : 'bg-[#f4f4f7] text-[var(--ink-faint)]'
          }`}
        >
          {hasTavilyKey ? 'Tavily enabled' : 'Tavily not configured'}
        </span>
      </div>

      <div className="mt-8 rounded-3xl border border-[var(--border-soft)] bg-[#fbfbfe] px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[var(--ink-main)] shadow-[0_6px_18px_rgba(15,15,20,0.06)]">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[18px] font-semibold text-[var(--ink-main)]">Tavily</div>
              <div className="mt-2 max-w-[560px] text-[13px] leading-6 text-[var(--ink-faint)]">
                Enables the agent web tool for Tavily Search and Extract. There is no connection
                test here because real calls consume Tavily API credits.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <label
            htmlFor="tavily-api-key"
            className="mb-2 block text-[14px] font-semibold text-[var(--ink-main)]"
          >
            API Key
          </label>
          <div className="flex h-11 items-center rounded-xl border border-[var(--border-soft)] bg-white pr-2 transition-all focus-within:border-[#b9b9ca]">
            <input
              id="tavily-api-key"
              type={showTavilyKey ? 'text' : 'password'}
              value={settings.tavilyApiKey}
              onChange={(event) => updateTavilyApiKey(event.target.value)}
              placeholder="tvly-YOUR_API_KEY"
              className="h-full min-w-0 flex-1 rounded-l-xl bg-transparent px-3 text-[14px] text-[var(--ink-main)] outline-none"
            />
            <button
              type="button"
              onClick={() => setShowTavilyKey((value) => !value)}
              aria-label={showTavilyKey ? 'Hide Tavily API key' : 'Show Tavily API key'}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-subtle)] transition-colors hover:bg-[#efeff5] hover:text-[var(--ink-main)]"
            >
              {showTavilyKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {message ? (
          <div
            className={`mt-5 rounded-xl border px-3 py-2 text-[13px] ${
              saveState === 'error'
                ? 'border-[#fecaca] bg-[#fff1f2] text-[#b91c1c]'
                : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'
            }`}
          >
            {message}
          </div>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClear}
            disabled={!canSave || !hasTavilyKey}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#f3d0d0] bg-[#fff7f7] px-4 text-[14px] font-medium text-[#b42318] transition-all hover:bg-[#fff1f1] disabled:cursor-not-allowed disabled:border-[var(--border-soft)] disabled:bg-[#f4f4f7] disabled:text-[#9ca0ad]"
          >
            <Trash2 className="h-4 w-4" />
            <span>Clear</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--ink-main)] px-5 text-[14px] font-medium text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[#c3c3cf]"
          >
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>{isSaving ? 'Saving...' : 'Save Key'}</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 text-[13px] text-[var(--ink-faint)]">
          Loading third-party API key settings...
        </div>
      ) : null}
    </div>
  )
}
