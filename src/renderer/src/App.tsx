import type { SessionMeta } from '@shared/models'
import type { ComponentType, ReactNode } from 'react'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import * as DraggableTopBarModule from './components/DraggableTopBar'
import {
  chatViewReducer,
  createInitialChatViewState,
  selectVisibleSessions,
  type AssistantTranscriptEntry,
  type SystemTranscriptEntry,
  type ToolGroupView,
  type TranscriptEntry,
  type UserTranscriptEntry
} from './chat/reducer'

const DraggableTopBar =
  (DraggableTopBarModule as { DraggableTopBar?: ComponentType }).DraggableTopBar ??
  (DraggableTopBarModule as { default?: ComponentType }).default ??
  (() => null)

const APP_TABS = ['对话', '工作室']

const CAPABILITY_ITEMS = [
  {
    icon: 'brief',
    title: '我能做什么?',
    description: '追踪 GDP、利率、CPI 等关键宏观经济数据，也能继续承接你的日常研究与分析任务。'
  },
  {
    icon: 'spark',
    title: '我是怎么做?',
    description: '支持长对话、多步推理、工具调用与结果整合，适合整理材料、生成方案和跟进执行。'
  }
]

const SCENARIO_ITEMS = [
  '想了解当前经济处于什么周期阶段',
  '想知道利率变化会如何影响资产配置',
  '想把一组公开数据整理成结构化结论'
]

const QUICK_PROMPTS = ['最新的 GDP 增速和 CPI 数据是多少?', '目前加息周期到哪个阶段了?']

const INPUT_CHIPS = ['默认大模型', '技能', '找灵感']

const formatClockTime = (timestamp: number): string =>
  new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(timestamp)

const formatSessionTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`

  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(timestamp)
}

const iconClassName =
  'h-9 w-9 rounded-2xl border border-[var(--border-soft)] bg-white/82 text-[var(--ink-subtle)] shadow-[0_10px_30px_rgba(56,61,72,0.06)] transition hover:-translate-y-0.5 hover:text-[var(--ink-main)]'

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
)

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
)

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v5l3 2" />
  </svg>
)

const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 19a7 7 0 0 1 14 0" />
  </svg>
)

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M7 18 3 21V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H7Z" />
    <path d="M8 10h8" />
    <path d="M8 14h5" />
  </svg>
)

const SparkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
  </svg>
)

const TaskIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <circle cx="12" cy="12" r="8" />
    <path d="m9.5 12 1.8 1.8 3.7-4.1" />
  </svg>
)

const CompassIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <circle cx="12" cy="12" r="8" />
    <path d="m15.5 8.5-2.2 6.1-6.1 2.2 2.2-6.1 6.1-2.2Z" />
  </svg>
)

const BoltIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
  </svg>
)

const BriefIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
    <path d="M4 9.5A1.5 1.5 0 0 1 5.5 8h13A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-8Z" />
    <path d="M4 12h16" />
  </svg>
)

const MagicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="m4 20 8.5-8.5" />
    <path d="m13.5 6.5 4 4" />
    <path d="m12 4 1 2" />
    <path d="m18 10 2 1" />
    <path d="m7 13-3-1" />
    <path d="m16 3-1 3" />
  </svg>
)

const WrenchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="m14 7 3-3a4 4 0 0 1-5 5l-6.5 6.5a2 2 0 1 1-2.8-2.8L9.2 6.2a4 4 0 0 1 5-5l-3 3 2.8 2.8Z" />
  </svg>
)

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M21 3 10 14" />
    <path d="m21 3-7 18-4-7-7-4 18-7Z" />
  </svg>
)

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
    <rect x="6.5" y="6.5" width="11" height="11" rx="2.2" />
  </svg>
)

const ChevronIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${className}`}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

const StatusBadge = ({ status }: { status: SessionMeta['status'] }) => {
  const config =
    status === 'running'
      ? { label: '进行中', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
      : status === 'error'
        ? { label: '异常', className: 'bg-rose-50 text-rose-700 border-rose-200' }
        : status === 'cancelled'
          ? { label: '已中止', className: 'bg-slate-100 text-slate-600 border-slate-200' }
          : { label: '就绪', className: 'bg-white/80 text-slate-500 border-[var(--border-soft)]' }

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}

const ToolGroupPanel = ({ toolGroup }: { toolGroup: ToolGroupView }) => (
  <details className="group rounded-[24px] border border-[var(--border-soft)] bg-[#faf7f1] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-left">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white text-[var(--ink-subtle)]">
          <WrenchIcon />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-[var(--ink-main)]">{toolGroup.summary}</div>
          <div className="text-[11px] text-[var(--ink-soft)]">
            {toolGroup.calls.length} 次调用
            {toolGroup.totalDurationMs > 0 ? ` · ${toolGroup.totalDurationMs}ms` : ''}
          </div>
        </div>
      </div>
      <ChevronIcon className="text-[var(--ink-soft)] transition-transform duration-200 group-open:rotate-90" />
    </summary>
    <div className="border-t border-[var(--border-soft)] px-4 py-2">
      {toolGroup.calls.map((call) => (
        <div key={call.id} className="border-b border-[var(--border-soft)] py-3 last:border-b-0">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[12px] text-[var(--ink-main)]">{call.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                call.status === 'error'
                  ? 'bg-rose-100 text-rose-700'
                  : call.status === 'running'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {call.status}
            </span>
          </div>
          {call.argsSummary ? (
            <p className="mt-1 text-[11.5px] leading-5 text-[var(--ink-soft)]">{call.argsSummary}</p>
          ) : null}
          {call.outputSummary ? (
            <p className="mt-1 text-[11.5px] leading-5 text-[var(--ink-soft)]">{call.outputSummary}</p>
          ) : null}
        </div>
      ))}
    </div>
  </details>
)

const SessionRow = ({
  session,
  isActive,
  onSelect
}: {
  session: SessionMeta
  isActive: boolean
  onSelect: () => void
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={`group flex w-full items-start gap-3 rounded-[18px] px-3 py-2.5 text-left transition ${
      isActive
        ? 'bg-white shadow-[0_18px_32px_rgba(66,53,22,0.08)] ring-1 ring-[rgba(215,209,198,0.88)]'
        : 'hover:bg-white/72'
    }`}
  >
    <span
      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
        isActive ? 'bg-[#f4efe6] text-[#6e5d3f]' : 'bg-white/80 text-[var(--ink-soft)]'
      }`}
    >
      <ChatIcon />
    </span>
    <span className="min-w-0 flex-1">
      <span className="line-clamp-1 text-[14px] font-semibold text-[var(--ink-main)]">{session.title}</span>
      <span className="mt-0.5 block text-[12px] leading-5 text-[var(--ink-soft)]">
        {session.status === 'running' ? '正在生成回复…' : `${session.messageCount} 条消息`}
      </span>
    </span>
    <span className="pt-0.5 text-[11px] text-[var(--ink-faint)]">{formatSessionTime(session.updatedAt)}</span>
  </button>
)

const NavRailButton = ({
  label,
  active,
  children
}: {
  label: string
  active?: boolean
  children: ReactNode
}) => (
  <button
    type="button"
    className={`flex flex-col items-center gap-1.5 rounded-[20px] px-2 py-3 text-[11px] font-medium transition ${
      active ? 'bg-white text-[var(--ink-main)] shadow-[0_14px_30px_rgba(66,53,22,0.08)]' : 'text-[var(--ink-soft)] hover:text-[var(--ink-main)]'
    }`}
  >
    <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[#f6f2ea]">{children}</span>
    <span>{label}</span>
  </button>
)

const TranscriptItem = ({ entry }: { entry: TranscriptEntry }) => {
  if (entry.kind === 'user') {
    const message = entry as UserTranscriptEntry
    return (
      <div className="flex justify-end">
        <div className="max-w-[62%] rounded-[22px] bg-[#f8ebe7] px-4 py-3.5 text-[14px] leading-7 text-[var(--ink-main)] shadow-[0_16px_34px_rgba(167,126,110,0.08)]">
          <p className="whitespace-pre-wrap">{message.text}</p>
          <time className="mt-2 block text-[11px] text-[#b1938d]">{formatClockTime(message.createdAt)}</time>
        </div>
      </div>
    )
  }

  if (entry.kind === 'assistant') {
    const message = entry as AssistantTranscriptEntry
    return (
      <div className="max-w-[78%]">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#edf4ff] text-[#3d77d7]">
            <BoltIcon />
          </span>
          <span className="text-[12px] font-semibold text-[#3d77d7]">龙虾管家</span>
          {message.isStreaming ? <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-dot" /> : null}
        </div>
        <div className="rounded-[24px] bg-white/85 px-5 py-4 text-[14px] leading-7 text-[var(--ink-main)] shadow-[0_16px_34px_rgba(66,53,22,0.05)]">
          <p className="whitespace-pre-wrap">{message.text || '处理中…'}</p>
          {message.toolGroup ? <div className="mt-4"><ToolGroupPanel toolGroup={message.toolGroup} /></div> : null}
          <time className="mt-3 block text-[11px] text-[var(--ink-faint)]">
            {message.isStreaming ? '实时生成中' : formatClockTime(message.completedAt ?? message.createdAt)}
          </time>
        </div>
      </div>
    )
  }

  const message = entry as SystemTranscriptEntry
  return (
    <div
      className={`rounded-[22px] border px-4 py-3 text-[13px] leading-6 ${
        message.tone === 'error'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-[var(--border-soft)] bg-[#f7f3eb] text-[var(--ink-soft)]'
      }`}
    >
      {message.text}
    </div>
  )
}

const EmptyState = ({ status }: { status: SessionMeta['status'] | undefined }) => (
  <div className="mx-auto flex h-full w-full max-w-[820px] flex-col px-6 pt-20">
    <div className="flex justify-end">
      <div className="rounded-[18px] bg-[#f8ebe7] px-4 py-3 text-[14px] font-semibold text-[#6d5147] shadow-[0_20px_36px_rgba(170,131,117,0.08)]">
        经济数据查询能帮我做什么呢?
      </div>
    </div>

    <div className="mt-20 max-w-[640px] animate-fade-up">
      {status ? (
        <div className="mb-5">
          <StatusBadge status={status} />
        </div>
      ) : null}

      {CAPABILITY_ITEMS.map((item) => (
        <section key={item.title} className="mb-6">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-[var(--ink-main)]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-[0_10px_18px_rgba(66,53,22,0.05)]">
              {item.icon === 'brief' ? <BriefIcon /> : <MagicIcon />}
            </span>
            {item.title}
          </div>
          <p className="mt-2 pl-9 text-[15px] leading-7 text-[var(--ink-soft)]">{item.description}</p>
        </section>
      ))}

      <section className="mt-2">
        <h3 className="text-[16px] font-semibold text-[var(--ink-main)]">适用场景:</h3>
        <div className="mt-4 space-y-3 pl-1">
          {SCENARIO_ITEMS.map((item, index) => (
            <div key={item} className="flex items-center gap-3 text-[15px] text-[var(--ink-main)]">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] ${
                  index === 0 ? 'bg-[#e9f4f1]' : index === 1 ? 'bg-[#edf2ff]' : 'bg-[#f5efe6]'
                }`}
              >
                {index === 0 ? '📊' : index === 1 ? '✅' : '🌍'}
              </span>
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h3 className="text-[16px] font-semibold text-[var(--ink-main)]">可以试试这么问我:</h3>
        <div className="mt-5 space-y-3">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="flex w-full items-center justify-between rounded-[20px] bg-white/78 px-5 py-4 text-left text-[15px] text-[var(--ink-soft)] shadow-[0_14px_30px_rgba(66,53,22,0.05)] ring-1 ring-[rgba(220,214,203,0.8)] transition hover:bg-white hover:text-[var(--ink-main)]"
            >
              <span>{prompt}</span>
              <ArrowIcon />
            </button>
          ))}
        </div>
      </section>
    </div>
  </div>
)

const BootErrorState = ({ message }: { message: string }) => (
  <div className="mx-auto mt-12 max-w-[720px] rounded-[28px] border border-rose-200 bg-rose-50/80 px-6 py-6 shadow-[0_20px_40px_rgba(153,27,27,0.08)]">
    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-500">启动异常</div>
    <h3 className="mt-3 text-[20px] font-semibold text-rose-950">会话界面初始化失败</h3>
    <pre className="mt-4 whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-rose-700">{message}</pre>
  </div>
)

const InputBar = ({
  draft,
  isRunning,
  isCancelling,
  currentSessionId,
  onDraftChange,
  onSend,
  onCancel
}: {
  draft: string
  isRunning: boolean
  isCancelling: boolean
  currentSessionId: string | null
  onDraftChange: (value: string) => void
  onSend: () => void
  onCancel: () => void
}) => (
  <div className="rounded-[30px] border border-[var(--border-soft)] bg-white/88 px-5 py-4 shadow-[0_26px_50px_rgba(66,53,22,0.08)] backdrop-blur-md">
    <textarea
      value={draft}
      onChange={(event) => onDraftChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onSend()
        }
      }}
      rows={3}
      placeholder="可以描述任务或提问任何问题"
      className="min-h-[74px] w-full resize-none bg-transparent text-[15px] leading-7 text-[var(--ink-main)] outline-none placeholder:text-[var(--ink-faint)]"
    />

    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {INPUT_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-[#f6f3ee] px-3 py-2 text-[12px] font-medium text-[var(--ink-soft)] transition hover:bg-[#efebe4] hover:text-[var(--ink-main)]"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[var(--ink-soft)]">
              {chip === '默认大模型' ? <BoltIcon /> : chip === '技能' ? <SparkIcon /> : <CompassIcon />}
            </span>
            {chip}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {isRunning ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={isCancelling}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 text-[13px] font-medium text-[var(--ink-soft)] transition hover:bg-[#f7f3eb] disabled:opacity-50"
          >
            <StopIcon />
            {isCancelling ? '停止中…' : '停止回答'}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onSend}
          disabled={!draft.trim() || isRunning || !currentSessionId}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#efe7dc] text-[#6b5a3b] transition hover:bg-[#e5dacb] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="发送消息"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  </div>
)

const App = () => {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [isBooting, setIsBooting] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [state, dispatch] = useReducer(chatViewReducer, undefined, createInitialChatViewState)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const visibleSessions = useMemo(() => selectVisibleSessions(sessions), [sessions])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [state.transcript, state.isRunning])

  useEffect(() => {
    let disposed = false

    const refreshSessions = async (): Promise<SessionMeta[]> => {
      if (!window.context) {
        throw new Error('Preload API is unavailable. Check the Electron main/preload process logs.')
      }

      const next = await window.context.listSessions()
      if (!disposed) setSessions(next)
      return next
    }

    const openFirstSession = async (): Promise<void> => {
      try {
        const listed = await refreshSessions()
        if (disposed) return

        const target = listed[0] ?? (await window.context.createSession())
        if (!listed[0]) await refreshSessions()

        const snapshot = await window.context.openSession(target.id)
        if (disposed) return

        setCurrentSessionId(target.id)
        dispatch({ type: 'snapshot.loaded', snapshot })
        setBootError(null)
      } catch (error) {
        if (!disposed) {
          setBootError(
            error instanceof Error ? error.message : 'Failed to bootstrap chat sessions.'
          )
        }
      } finally {
        if (!disposed) setIsBooting(false)
      }
    }

    void openFirstSession()
    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (!currentSessionId) return
    let disposed = false

    const refreshSessions = async (): Promise<void> => {
      try {
        const next = await window.context.listSessions()
        if (!disposed) setSessions(next)
      } catch (error) {
        if (!disposed) {
          setBootError(error instanceof Error ? error.message : 'Failed to refresh sessions.')
        }
      }
    }

    const unsubscribe = window.context.subscribeChatEvents(currentSessionId, (event) => {
      if (disposed) return

      dispatch({ type: 'event.received', event })

      if (
        event.type === 'user.message' ||
        event.type === 'assistant.completed' ||
        event.type === 'session.title.updated' ||
        event.type === 'session.error' ||
        event.type === 'session.cancelled'
      ) {
        void refreshSessions()
      }
    })

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [currentSessionId])

  const openSession = async (sessionId: string): Promise<void> => {
    const snapshot = await window.context.openSession(sessionId)
    setCurrentSessionId(sessionId)
    dispatch({ type: 'snapshot.loaded', snapshot })
    setBootError(null)
  }

  const createSession = async (): Promise<void> => {
    const created = await window.context.createSession()
    const next = await window.context.listSessions()
    setSessions(next)
    await openSession(created.id)
    setDraft('')
    setBootError(null)
  }

  const handleSend = async (): Promise<void> => {
    if (!currentSessionId || !draft.trim() || state.isRunning) return

    const message = draft
    setDraft('')
    dispatch({ type: 'run.requested' })

    try {
      await window.context.sendMessage(currentSessionId, message)
    } catch (error) {
      dispatch({
        type: 'event.received',
        event: {
          type: 'session.error',
          eventId: `local_error_${Date.now()}`,
          sessionId: currentSessionId,
          timestamp: Date.now(),
          message: error instanceof Error ? error.message : 'Unable to send the message.'
        }
      })
    }
  }

  const handleCancel = async (): Promise<void> => {
    if (!currentSessionId || !state.isRunning) return
    dispatch({ type: 'cancel.requested' })
    await window.context.cancelRun(currentSessionId)
  }

  return (
    <>
      <DraggableTopBar />

      <main className="h-screen overflow-hidden bg-[var(--app-bg)] px-4 pb-4 pt-10 text-[var(--ink-main)]">
        <div className="notemark-shell grid h-full overflow-hidden rounded-[34px] border border-[var(--border-soft)] bg-[var(--shell-bg)] shadow-[var(--shadow-shell)]">
          <aside className="flex h-full flex-col justify-between border-r border-[var(--border-soft)] bg-[var(--rail-bg)] px-3 py-4">
            <div className="space-y-4">
              <button type="button" className="mx-auto flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#c48a4b] text-[#1d2330] shadow-[0_18px_32px_rgba(120,76,23,0.18)]">
                <span className="text-[22px]">🦅</span>
              </button>

              <div className="space-y-1">
                <NavRailButton label="对话" active>
                  <ChatIcon />
                </NavRailButton>
                <NavRailButton label="灵感">
                  <SparkIcon />
                </NavRailButton>
                <NavRailButton label="任务">
                  <TaskIcon />
                </NavRailButton>
              </div>
            </div>

            <div className="space-y-2">
              <button type="button" className={iconClassName} aria-label="帮助">
                <span className="text-[15px]">?</span>
              </button>
              <button type="button" className={iconClassName} aria-label="设备">
                <span className="text-[15px]">◐</span>
              </button>
              <button type="button" className={iconClassName} aria-label="设置">
                <span className="text-[15px]">⚙</span>
              </button>
              <button type="button" className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[#3caf64] text-white shadow-[0_12px_24px_rgba(60,175,100,0.3)]" aria-label="在线状态">
                <span className="text-[14px]">↑</span>
              </button>
            </div>
          </aside>

          <aside className="flex h-full flex-col border-r border-[var(--border-soft)] bg-[var(--sidebar-bg)] px-3 py-4">
            <div className="space-y-3">
              <label className="flex h-11 items-center gap-2 rounded-full bg-white/72 px-4 text-[var(--ink-faint)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="搜索"
                  className="w-full bg-transparent text-[14px] text-[var(--ink-main)] outline-none placeholder:text-[var(--ink-faint)]"
                />
              </label>

              <button
                type="button"
                onClick={() => void createSession()}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white/88 text-[15px] font-semibold text-[var(--ink-main)] shadow-[0_18px_30px_rgba(66,53,22,0.06)] ring-1 ring-[rgba(219,213,202,0.9)] transition hover:bg-white"
              >
                <PlusIcon />
                新建 Agent
              </button>
            </div>

            <div className="mt-5 rounded-[26px] bg-gradient-to-br from-white to-[#fbf8f2] p-4 shadow-[0_24px_40px_rgba(66,53,22,0.08)] ring-1 ring-[rgba(219,213,202,0.82)]">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#fff0ea] text-[#ff7b52] shadow-[0_10px_24px_rgba(255,123,82,0.18)]">
                  <BoltIcon />
                </div>
                <div>
                  <div className="text-[19px] font-semibold text-[var(--ink-main)]">QClaw</div>
                  <div className="text-[13px] text-[var(--ink-soft)]">随时随地，帮您高效干活</div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex-1 overflow-y-auto pr-1">
              <div className="space-y-1.5">
                {visibleSessions.length === 0 && !isBooting ? (
                  <div className="rounded-[20px] bg-white/60 px-4 py-5 text-[13px] text-[var(--ink-soft)]">
                    暂无会话，点击上方按钮开始新建。
                  </div>
                ) : (
                  visibleSessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isActive={session.id === currentSessionId}
                      onSelect={() => void openSession(session.id)}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="mt-4 rounded-[22px] bg-white/82 p-3 shadow-[0_16px_30px_rgba(66,53,22,0.05)] ring-1 ring-[rgba(219,213,202,0.78)]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#fff4e8] text-[#ff8b21]">📦</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-[var(--ink-main)]">发现新版本!</div>
                  <div className="text-[12px] text-[var(--ink-soft)]">界面已更新为新的工作台布局</div>
                </div>
                <button type="button" className="rounded-full bg-[#1b1c20] px-3 py-1.5 text-[12px] font-semibold text-white">
                  更新
                </button>
              </div>
            </div>
          </aside>

          <section className="flex min-w-0 flex-col bg-[var(--content-bg)]">
            <header className="flex shrink-0 items-center justify-between gap-4 px-6 py-4">
              <div className="flex items-center gap-5">
                <div className="inline-flex rounded-full bg-[#f4efe7] p-1">
                  {APP_TABS.map((tab, index) => (
                    <button
                      key={tab}
                      type="button"
                      className={`rounded-full px-5 py-2 text-[14px] font-semibold transition ${
                        index === 0 ? 'bg-white text-[var(--ink-main)] shadow-[0_8px_18px_rgba(66,53,22,0.08)]' : 'text-[var(--ink-soft)]'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="hidden items-center gap-2 text-[15px] font-semibold text-[#4f93ff] md:flex">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#edf4ff]">
                    <SparkIcon />
                  </span>
                  龙虾管家
                </div>
              </div>

              <div className="flex items-center gap-4 text-[13px] text-[var(--ink-soft)]">
                <div className="hidden items-center gap-2 sm:flex">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/84 shadow-[0_10px_18px_rgba(66,53,22,0.05)]">
                    <CompassIcon />
                  </span>
                  已用 11.2 万，剩余 99%
                </div>
                <button type="button" className={iconClassName} aria-label="时间">
                  <ClockIcon />
                </button>
                <button type="button" className={iconClassName} aria-label="用户">
                  <UserIcon />
                </button>
              </div>
            </header>

            <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {isBooting ? (
                <div className="flex h-full items-center justify-center text-[14px] text-[var(--ink-soft)]">
                  正在加载会话…
                </div>
              ) : bootError ? (
                <BootErrorState message={bootError} />
              ) : state.transcript.length > 0 ? (
                <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-6 py-6">
                  {state.transcript.map((entry) => (
                    <TranscriptItem key={entry.id} entry={entry} />
                  ))}
                </div>
              ) : (
                <EmptyState status={state.meta?.status} />
              )}
            </div>

            <div className="shrink-0 px-6 pb-6 pt-2">
              <div className="mx-auto max-w-[860px]">
                <InputBar
                  draft={draft}
                  isRunning={state.isRunning}
                  isCancelling={state.isCancelling}
                  currentSessionId={currentSessionId}
                  onDraftChange={setDraft}
                  onSend={() => void handleSend()}
                  onCancel={() => void handleCancel()}
                />
                <div className="mt-2 text-center text-[11px] text-[var(--ink-faint)]">内容由 AI 生成，请仔细甄别</div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}

export default App
