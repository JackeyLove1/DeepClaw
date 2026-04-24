import {
  AlarmClockCheck,
  Check,
  ChevronDown,
  Languages,
  MessageCircleMore,
  Network,
  QrCode,
  Settings,
  Sparkles,
  Wrench
} from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import appIcon from '../assets/icon.png'
import * as DraggableTopBarModule from '../components/DraggableTopBar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../components/ui/dropdown-menu'
import { useI18n, type LocaleCode } from '../i18n'
import { useMainPanelTheme } from '../theme'

const DraggableTopBar = DraggableTopBarModule.DraggableTopBar ?? (() => null)

const navIconClassName = 'h-4 w-4 stroke-2 transition-all group-aria-[current=page]:stroke-[2.7]'
const utilityIconClassName = 'h-4 w-4 stroke-2 transition-all group-active:stroke-[2.7]'
const utilityButtonClassName =
  'group flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--sidebar-control-bg)] text-[var(--ink-subtle)] shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-all hover:bg-[var(--sidebar-control-hover-bg)] hover:text-[var(--ink-main)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.08)] active:bg-[var(--sidebar-control-active-bg)] active:text-[var(--ink-main)]'
const utilityLinkClassName =
  'group flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--sidebar-control-bg)] text-[var(--ink-subtle)] shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-all hover:bg-[var(--sidebar-control-hover-bg)] hover:text-[var(--ink-main)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.08)] active:bg-[var(--sidebar-control-active-bg)] active:text-[var(--ink-main)] aria-[current=page]:bg-[var(--sidebar-control-active-bg)] aria-[current=page]:text-[var(--ink-main)]'

interface NavRailLinkProps {
  label: string
  to: string
  icon: ReactNode
}

const NavRailLink = ({ label, to, icon }: NavRailLinkProps) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `group flex flex-col items-center gap-0.5 rounded-2xl px-2 py-2 text-[11px] tracking-wider transition-all ${
        isActive
          ? 'bg-[var(--sidebar-nav-active-bg)] text-[var(--ink-main)] shadow-[0_6px_18px_rgba(0,0,0,0.08)]'
          : 'text-[var(--ink-faint)] hover:bg-[var(--sidebar-nav-hover-bg)] hover:text-[var(--ink-main)]'
      }`
    }
  >
    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent bg-[var(--sidebar-icon-bg)] shadow-[0_3px_10px_rgba(0,0,0,0.05)] transition-all group-hover:bg-[var(--sidebar-icon-hover-bg)] group-active:bg-[var(--sidebar-icon-active-bg)] group-aria-[current=page]:bg-[var(--sidebar-icon-active-bg)]">
      {icon}
    </span>
    <span>{label}</span>
  </NavLink>
)

const availableLocales: LocaleCode[] = ['zh-CN', 'en-US']

export const AppShell = () => {
  const { locale, localeLabels, setLocale, t } = useI18n()
  const { mainPanelTheme } = useMainPanelTheme()

  return (
    <>
      <DraggableTopBar />

      <main className="h-screen overflow-hidden bg-[var(--app-bg)] px-4 pb-4 pt-10 text-[var(--ink-main)]">
        <div
          className="notemark-shell grid h-full overflow-hidden rounded-3xl border border-[var(--border-soft)] bg-[var(--shell-bg)] shadow-[var(--shadow-shell)]"
          data-main-panel-theme={mainPanelTheme}
        >
          <aside className="flex h-full flex-col justify-between border-r border-[var(--border-soft)] bg-[var(--rail-bg)] px-3 py-4 backdrop-blur-xl">
            <div className="space-y-4">
              <button
                type="button"
                className="mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
              >
                <img src={appIcon} alt={t('app.iconAlt')} className="h-full w-full object-cover" />
              </button>

              <div className="space-y-1">
                <NavRailLink
                  label={t('nav.chat')}
                  to="/chat"
                  icon={<MessageCircleMore className={navIconClassName} />}
                />
                <NavRailLink
                  label={t('nav.tasks')}
                  to="/tasks"
                  icon={<AlarmClockCheck className={navIconClassName} />}
                />
                <NavRailLink
                  label={t('nav.channels')}
                  to="/channels"
                  icon={<QrCode className={navIconClassName} />}
                />
                <NavRailLink
                  label={t('nav.skills')}
                  to="/skills"
                  icon={<Sparkles className={navIconClassName} />}
                />
                <NavRailLink
                  label={t('nav.tools')}
                  to="/tools"
                  icon={<Wrench className={navIconClassName} />}
                />
                <NavRailLink
                  label={t('nav.mcp')}
                  to="/mcp"
                  icon={<Network className={navIconClassName} />}
                />
              </div>
            </div>

            <div className="space-y-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={utilityButtonClassName}
                    aria-label={t('language.switch')}
                    title={t('language.switch')}
                  >
                    <Languages className={utilityIconClassName} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  side="right"
                  className="w-[180px] rounded-2xl border border-[#e7e8ef] bg-white p-1.5 shadow-[0_18px_48px_rgba(15,15,20,0.14)]"
                >
                  <DropdownMenuLabel className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <span>{t('language.current')}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {availableLocales.map((localeCode) => (
                    <DropdownMenuItem
                      key={localeCode}
                      className="rounded-xl px-3 py-2 text-[13px]"
                      onClick={() => void setLocale(localeCode)}
                    >
                      <span className="flex-1">{localeLabels[localeCode]}</span>
                      {locale === localeCode ? <Check className="h-4 w-4" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {/* <button type="button" className={utilityButtonClassName} aria-label={t('nav.help')}>
                <CircleHelp className={utilityIconClassName} />
              </button> */}
              <NavLink
                to="/settings"
                className={utilityLinkClassName}
                aria-label={t('nav.settings')}
              >
                <Settings className={utilityIconClassName} />
              </NavLink>
            </div>
          </aside>

          <div className="col-span-2 flex min-w-0 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </main>
    </>
  )
}
