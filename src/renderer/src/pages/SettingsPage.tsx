import { Activity, KeyRound, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { CommonSettingsSection } from './settings/CommonSettingsSection'
import { ThirdPartyApiKeysSection } from './settings/ThirdPartyApiKeysSection'
import { TokenUsageSection } from './settings/TokenUsageSection'

type SettingsSection = 'common' | 'apiKeys' | 'usage'

const navButtonClassName = (active: boolean, className = 'mt-1'): string =>
  `${className} flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[14px] font-medium transition-colors ${
    active
      ? 'bg-[#f5f5fa] text-[var(--ink-main)]'
      : 'text-[var(--ink-faint)] hover:bg-[#f8f8fc]'
  }`

export const SettingsPage = () => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('common')

  return (
    <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--content-bg)]">
      <aside className="w-[220px] border-r border-[var(--border-soft)] px-4 py-6">
        <p className="text-[22px] font-semibold text-[var(--ink-main)]">Settings</p>
        <div className="mt-5 rounded-2xl border border-[var(--border-soft)] bg-white p-2 shadow-[0_8px_24px_rgba(15,15,20,0.04)]">
          <button
            type="button"
            onClick={() => setActiveSection('common')}
            className={navButtonClassName(activeSection === 'common', '')}
          >
            <Settings2 className="h-4 w-4" />
            <span>General</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('apiKeys')}
            className={navButtonClassName(activeSection === 'apiKeys')}
          >
            <KeyRound className="h-4 w-4" />
            <span>Third-party APIs</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('usage')}
            className={navButtonClassName(activeSection === 'usage')}
          >
            <Activity className="h-4 w-4" />
            <span>Usage</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 justify-center overflow-auto px-8 py-8">
        <div className="w-full max-w-[860px]">
          {activeSection === 'common' ? <CommonSettingsSection /> : null}
          {activeSection === 'apiKeys' ? <ThirdPartyApiKeysSection /> : null}
          {activeSection === 'usage' ? <TokenUsageSection /> : null}
        </div>
      </div>
    </section>
  )
}
