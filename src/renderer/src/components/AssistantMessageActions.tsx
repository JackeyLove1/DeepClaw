import type { ReactNode } from 'react'
import type { AssistantFeedback } from '../chat/messageActions'

type AssistantMessageActionsProps = {
  copied: boolean
  feedback: AssistantFeedback
  disableCopy: boolean
  disableRetry: boolean
  onCopy: () => void
  onFeedback: (value: Exclude<AssistantFeedback, null>) => void
  onRetry: () => void
}

const ActionButton = ({
  label,
  active,
  disabled,
  onClick,
  children
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-[var(--ink-faint)] transition ${
      active
        ? 'border-[#c7c9d2] bg-[#f2f3f8] text-[#3a3d47]'
        : 'border-transparent hover:border-[#e1e2e9] hover:bg-[#f6f7fb] hover:text-[#474a55]'
    } disabled:cursor-not-allowed disabled:opacity-50`}
  >
    {children}
  </button>
)

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </svg>
)

const ThumbsUpIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <path d="M14 9V5a3 3 0 0 0-3-3l-1 5-3 4v9h11a2 2 0 0 0 2-2l1-6a2 2 0 0 0-2-2h-5Z" />
    <path d="M7 11H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3" />
  </svg>
)

const ThumbsDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <path d="M10 15v4a3 3 0 0 0 3 3l1-5 3-4V4H6a2 2 0 0 0-2 2l-1 6a2 2 0 0 0 2 2h5Z" />
    <path d="M17 13h3a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-3" />
  </svg>
)

const RetryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
)

export const AssistantMessageActions = ({
  copied,
  feedback,
  disableCopy,
  disableRetry,
  onCopy,
  onFeedback,
  onRetry
}: AssistantMessageActionsProps) => (
  <div className="mt-2 flex items-center gap-1 text-[#8f93a1]">
    <ActionButton label={copied ? '已复制' : '复制'} disabled={disableCopy} onClick={onCopy}>
      <CopyIcon />
    </ActionButton>
    <ActionButton
      label={feedback === 'up' ? '取消点赞' : '点赞'}
      active={feedback === 'up'}
      onClick={() => onFeedback('up')}
    >
      <ThumbsUpIcon />
    </ActionButton>
    <ActionButton
      label={feedback === 'down' ? '取消点踩' : '点踩'}
      active={feedback === 'down'}
      onClick={() => onFeedback('down')}
    >
      <ThumbsDownIcon />
    </ActionButton>
    <ActionButton label="重试" disabled={disableRetry} onClick={onRetry}>
      <RetryIcon />
    </ActionButton>
  </div>
)
