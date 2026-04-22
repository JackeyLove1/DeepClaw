import { ComponentProps } from 'react'
import { twMerge } from 'tailwind-merge'
import { FiPlus } from 'react-icons/fi'
import { cn } from '@renderer/utils'
import { useI18n } from '../../i18n'

export const BlockHandle = ({ className, ...props }: ComponentProps<'div'>): JSX.Element => {
  const { t } = useI18n()

  return (
    <div
      className={cn(
        'absolute -left-16 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5',
        className
      )}
      {...props}
    >
      <button
        type="button"
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-notion-hover text-notion-text-tertiary hover:text-notion-text transition-colors cursor-grab"
        title={t('notes.dragToMove')}
      >
        <span className="text-xs tracking-widest">⋮⋮</span>
      </button>
      <button
        type="button"
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-notion-hover text-notion-text-tertiary hover:text-notion-text transition-colors"
        title={t('notes.addBlock')}
      >
        <FiPlus size={14} />
      </button>
    </div>
  )
}
