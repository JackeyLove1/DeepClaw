import { useEffect, useState } from 'react'
import { FiCopy, FiMinus, FiSquare, FiX } from 'react-icons/fi'

export const DraggableTopBar = (): JSX.Element => {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    void window.context.windowIsMaximized().then(setIsMaximized)
  }, [])

  const handleToggleMaximize = async (): Promise<void> => {
    const nextState = await window.context.windowToggleMaximize()
    setIsMaximized(nextState)
  }

  return (
    <header className="absolute inset-x-0 top-0 z-50 h-8 bg-transparent flex items-center justify-end [-webkit-app-region:drag]">
      <div className="flex items-center [-webkit-app-region:no-drag]">
        <button
          type="button"
          onClick={() => window.context.windowMinimize()}
          className="w-11 h-8 flex items-center justify-center hover:bg-notion-hover transition-colors"
          title="Minimize"
        >
          <FiMinus size={16} />
        </button>
        <button
          type="button"
          onClick={handleToggleMaximize}
          className="w-11 h-8 flex items-center justify-center hover:bg-notion-hover transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <FiCopy size={14} /> : <FiSquare size={14} />}
        </button>
        <button
          type="button"
          onClick={() => window.context.windowClose()}
          className="w-11 h-8 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
          title="Close"
        >
          <FiX size={16} />
        </button>
      </div>
    </header>
  )
}
