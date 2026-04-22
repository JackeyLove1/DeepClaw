import { useEffect, useState } from 'react'
import { FiCopy, FiMinus, FiSquare, FiX } from 'react-icons/fi'
import { useI18n } from '../i18n'

export const DraggableTopBar = (): JSX.Element => {
  const [isMaximized, setIsMaximized] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    void window.context.windowIsMaximized().then((value) => {
      setIsMaximized(value)
    })
  }, [])

  const handleToggleMaximize = async (): Promise<void> => {
    await window.context.windowToggleMaximize()
    const nextState = await window.context.windowIsMaximized()
    setIsMaximized(nextState)
  }

  return (
    <header className="absolute inset-x-0 top-0 z-50 flex h-8 items-center justify-end bg-transparent [-webkit-app-region:drag]">
      <div className="flex items-center [-webkit-app-region:no-drag]">
        <button
          type="button"
          onClick={() => window.context.windowMinimize()}
          className="flex h-8 w-11 items-center justify-center text-[var(--ink-soft)] transition-colors hover:bg-white/60 hover:text-[var(--ink-main)]"
          title={t('topbar.minimize')}
        >
          <FiMinus size={16} />
        </button>
        <button
          type="button"
          onClick={handleToggleMaximize}
          className="flex h-8 w-11 items-center justify-center text-[var(--ink-soft)] transition-colors hover:bg-white/60 hover:text-[var(--ink-main)]"
          title={isMaximized ? t('topbar.restore') : t('topbar.maximize')}
        >
          {isMaximized ? <FiCopy size={14} /> : <FiSquare size={14} />}
        </button>
        <button
          type="button"
          onClick={() => window.context.windowClose()}
          className="flex h-8 w-11 items-center justify-center text-[var(--ink-soft)] transition-colors hover:bg-red-500 hover:text-white"
          title={t('topbar.close')}
        >
          <FiX size={16} />
        </button>
      </div>
    </header>
  )
}
