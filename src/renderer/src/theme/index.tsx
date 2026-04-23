import type { AppPreferences, MainPanelTheme } from '@shared/types'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

interface MainPanelThemeContextValue {
  mainPanelTheme: MainPanelTheme
  isLoadingMainPanelTheme: boolean
  setMainPanelTheme: (theme: MainPanelTheme) => Promise<void>
}

const DEFAULT_MAIN_PANEL_THEME: MainPanelTheme = 'light'

const MainPanelThemeContext = createContext<MainPanelThemeContextValue | null>(null)

const normalizePreferences = (
  preferences: AppPreferences | null | undefined
): Pick<AppPreferences, 'mainPanelTheme'> => ({
  mainPanelTheme:
    preferences?.mainPanelTheme === 'dark' ? 'dark' : DEFAULT_MAIN_PANEL_THEME
})

export const MainPanelThemeProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [mainPanelTheme, setMainPanelThemeState] = useState<MainPanelTheme>(
    DEFAULT_MAIN_PANEL_THEME
  )
  const [isLoadingMainPanelTheme, setIsLoadingMainPanelTheme] = useState(true)

  useEffect(() => {
    let active = true

    void window.context
      .getAppPreferences()
      .then((preferences) => {
        if (!active) return
        setMainPanelThemeState(normalizePreferences(preferences).mainPanelTheme)
      })
      .catch((error) => {
        console.warn('[theme] failed to load app preferences', error)
      })
      .finally(() => {
        if (active) {
          setIsLoadingMainPanelTheme(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  const setMainPanelTheme = useCallback(async (theme: MainPanelTheme) => {
    const normalizedTheme = theme === 'dark' ? 'dark' : DEFAULT_MAIN_PANEL_THEME
    const previousTheme = mainPanelTheme
    setMainPanelThemeState(normalizedTheme)

    try {
      const preferences = await window.context.saveAppPreferences({
        mainPanelTheme: normalizedTheme
      })
      setMainPanelThemeState(normalizePreferences(preferences).mainPanelTheme)
    } catch (error) {
      setMainPanelThemeState(previousTheme)
      throw error
    }
  }, [mainPanelTheme])

  const value = useMemo<MainPanelThemeContextValue>(
    () => ({
      mainPanelTheme,
      isLoadingMainPanelTheme,
      setMainPanelTheme
    }),
    [isLoadingMainPanelTheme, mainPanelTheme, setMainPanelTheme]
  )

  return (
    <MainPanelThemeContext.Provider value={value}>{children}</MainPanelThemeContext.Provider>
  )
}

export const useMainPanelTheme = (): MainPanelThemeContextValue => {
  const value = useContext(MainPanelThemeContext)

  if (!value) {
    throw new Error('useMainPanelTheme must be used within MainPanelThemeProvider')
  }

  return value
}

