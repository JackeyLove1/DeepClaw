import { useEffect } from 'react'
import { AppRouter } from './router'
import { Toaster } from 'sonner'

const ScriptEventLogger = (): null => {
  useEffect(() => {
    const ctx = (window as Window & { context?: Record<string, unknown> }).context
    const subscribe = ctx?.['subscribeScriptEvents'] as
      | ((listener: (event: { type: string; script?: string; data?: string; code?: number | null }) => void) => () => void)
      | undefined

    if (!subscribe) return

    const unsubscribe = subscribe((event) => {
      const prefix = '%c[pre-install]'
      switch (event.type) {
        case 'start':
          console.log(prefix, 'color:#2563eb;font-weight:bold', `Starting: ${event.script}`)
          break
        case 'stdout':
          console.log(prefix, 'color:#16a34a', event.data?.trimEnd())
          break
        case 'stderr':
          console.warn(prefix, 'color:#dc2626', event.data?.trimEnd())
          break
        case 'exit':
          console.log(
            prefix,
            event.code === 0 ? 'color:#16a34a;font-weight:bold' : 'color:#dc2626;font-weight:bold',
            `Exited with code ${event.code}`
          )
          break
      }
    })

    return unsubscribe
  }, [])

  return null
}

const App = () => (
  <>
    <ScriptEventLogger />
    <AppRouter />
    <Toaster richColors position="top-center" />
  </>
)

export default App
