import { useNoteStore } from '@renderer/store/noteStore'
import { ComponentProps } from 'react'
import { FiMenu } from 'react-icons/fi'
import { twMerge } from 'tailwind-merge'
import { Breadcrumbs } from './Breadcrumbs'
import { useI18n } from '../../i18n'

export const Topbar = ({ className, ...props }: ComponentProps<'header'>): JSX.Element => {
  const toggleSidebar = useNoteStore((state) => state.toggleSidebar)
  const { t } = useI18n()

  return (
    <header
      className={twMerge(
        'h-[45px] flex items-center justify-between px-4 border-b border-notion-border bg-white',
        className
      )}
      {...props}
    >
      {/* Left section: hamburger + breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-notion-hover text-notion-text-secondary hover:text-notion-text transition-colors"
        >
          <FiMenu size={18} />
        </button>
        <Breadcrumbs />
      </div>

      {/* Right section: page actions */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-notion-hover text-notion-text-secondary hover:text-notion-text transition-colors"
          title={t('notes.pageInfo')}
        >
          {/* <FiInfo size={16} /> */}
        </button>
        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-notion-hover text-notion-text-secondary hover:text-notion-text transition-colors"
          title={t('notes.share')}
        >
          {/* <FiShare2 size={16} /> */}
        </button>
        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-notion-hover text-notion-text-secondary hover:text-notion-text transition-colors"
          title={t('notes.star')}
        >
          {/* <FiStar size={16} /> */}
        </button>
        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-notion-hover text-notion-text-secondary hover:text-notion-text transition-colors"
          title={t('notes.moreOptions')}
        >
          {/* <FiMoreHorizontal size={16} /> */}
        </button>
      </div>
    </header>
  )
}
