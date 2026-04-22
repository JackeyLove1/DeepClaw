import { ComponentProps } from 'react'
import { twMerge } from 'tailwind-merge'
import { FiClock, FiFileText, FiSettings } from 'react-icons/fi'
import { useI18n } from '../../i18n'

export const SidebarNav = ({ className, ...props }: ComponentProps<'div'>): JSX.Element => {
  const { t } = useI18n()

  return (
    <div className={twMerge('px-2 pb-2', className)} {...props}>
      <button type="button" className="sidebar-nav-item w-full">
        <FiClock size={16} />
        <span>{t('notes.recent')}</span>
      </button>
      <button type="button" className="sidebar-nav-item w-full">
        <FiFileText size={16} />
        <span>{t('notes.allPages')}</span>
      </button>
      <button type="button" className="sidebar-nav-item w-full">
        <FiSettings size={16} />
        <span>{t('notes.settingsMembers')}</span>
      </button>
    </div>
  )
}
