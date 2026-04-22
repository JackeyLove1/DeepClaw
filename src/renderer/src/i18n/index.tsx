import type { AppPreferences, LocaleCode } from '@shared/types'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { localeLabels, translations, type TranslationKey } from './translations'

type TranslationParams = Record<string, string | number | null | undefined>

interface I18nContextValue {
  locale: LocaleCode
  isLoadingLocale: boolean
  localeLabels: Record<LocaleCode, string>
  setLocale: (locale: LocaleCode) => Promise<void>
  t: (key: TranslationKey, params?: TranslationParams) => string
  formatNumber: (value: number) => string
  formatDateTime: (timestamp: number | null | undefined) => string
  formatClockTime: (timestamp: number) => string
  formatMonthDay: (timestamp: number) => string
}

const DEFAULT_LOCALE: LocaleCode = 'zh-CN'

const I18nContext = createContext<I18nContextValue | null>(null)

const interpolate = (template: string, params?: TranslationParams): string => {
  if (!params) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key]
    return value == null ? match : String(value)
  })
}

const normalizePreferences = (preferences: AppPreferences | null | undefined): AppPreferences => ({
  locale: preferences?.locale === 'en-US' ? 'en-US' : DEFAULT_LOCALE
})

export const I18nProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE)
  const [isLoadingLocale, setIsLoadingLocale] = useState(true)

  useEffect(() => {
    let active = true

    void window.context
      .getAppPreferences()
      .then((preferences) => {
        if (!active) return
        setLocaleState(normalizePreferences(preferences).locale)
      })
      .catch((error) => {
        console.warn('[i18n] failed to load app preferences', error)
      })
      .finally(() => {
        if (active) {
          setIsLoadingLocale(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback(async (nextLocale: LocaleCode) => {
    const normalizedLocale = nextLocale === 'en-US' ? 'en-US' : DEFAULT_LOCALE
    setLocaleState(normalizedLocale)

    try {
      const preferences = await window.context.saveAppPreferences({ locale: normalizedLocale })
      setLocaleState(normalizePreferences(preferences).locale)
    } catch (error) {
      console.warn('[i18n] failed to save app preferences', error)
    }
  }, [])

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams): string => {
      const value = translations[locale][key] ?? translations[DEFAULT_LOCALE][key] ?? key
      return interpolate(value, params)
    },
    [locale]
  )

  const value = useMemo<I18nContextValue>(() => {
    const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
    const clockFormatter = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit'
    })
    const monthDayFormatter = new Intl.DateTimeFormat(locale, {
      month: 'numeric',
      day: 'numeric'
    })
    const numberFormatter = new Intl.NumberFormat(locale)

    return {
      locale,
      isLoadingLocale,
      localeLabels,
      setLocale,
      t,
      formatNumber: (numberValue: number) => numberFormatter.format(numberValue),
      formatDateTime: (timestamp: number | null | undefined) => {
        if (!timestamp) {
          return t('common.notSet')
        }

        return dateTimeFormatter.format(new Date(timestamp))
      },
      formatClockTime: (timestamp: number) => clockFormatter.format(timestamp),
      formatMonthDay: (timestamp: number) => monthDayFormatter.format(timestamp)
    }
  }, [isLoadingLocale, locale, setLocale, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = (): I18nContextValue => {
  const value = useContext(I18nContext)

  if (!value) {
    throw new Error('useI18n must be used within I18nProvider')
  }

  return value
}

export type { LocaleCode, TranslationKey }
