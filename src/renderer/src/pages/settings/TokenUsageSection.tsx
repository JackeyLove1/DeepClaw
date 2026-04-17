import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ToolCallUsageRecord, UsageOverview, UsageRecord } from '@shared/types'

type UsageTab = 'token' | 'tool'
const PAGE_SIZE = 10

const formatNumber = (value: number): string => value.toLocaleString()

const formatTimestamp = (value: number): string =>
  new Date(value).toLocaleString('zh-CN', {
    hour12: false
  })

const usageKindLabel: Record<UsageRecord['kind'], string> = {
  chat_turn: '对话请求',
  title_gen: '标题生成',
  connection_test: '连接测试'
}

export const TokenUsageSection = () => {
  const [usageTab, setUsageTab] = useState<UsageTab>('token')
  const [isUsageLoading, setIsUsageLoading] = useState(true)
  const [usageError, setUsageError] = useState('')
  const [usageOverview, setUsageOverview] = useState<UsageOverview | null>(null)
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([])
  const [toolRecords, setToolRecords] = useState<ToolCallUsageRecord[]>([])
  const [tokenPage, setTokenPage] = useState(1)
  const [toolPage, setToolPage] = useState(1)

  useEffect(() => {
    let isMounted = true

    const loadUsage = async () => {
      setIsUsageLoading(true)
      setUsageError('')

      try {
        const [overview, records, toolCallRecords] = await Promise.all([
          window.context.getUsageOverview(),
          window.context.listUsageRecords(200),
          window.context.listToolCallRecords(200)
        ])
        if (!isMounted) return

        setUsageOverview(overview)
        setUsageRecords(records)
        setToolRecords(toolCallRecords)
        setTokenPage(1)
        setToolPage(1)
      } catch (error) {
        if (!isMounted) return
        setUsageError(error instanceof Error ? error.message : '读取用量数据失败，请稍后重试。')
      } finally {
        if (isMounted) {
          setIsUsageLoading(false)
        }
      }
    }

    void loadUsage()

    return () => {
      isMounted = false
    }
  }, [])

  const handleRefreshUsage = async () => {
    setIsUsageLoading(true)
    setUsageError('')

    try {
      const [overview, records, toolCallRecords] = await Promise.all([
        window.context.getUsageOverview(),
        window.context.listUsageRecords(200),
        window.context.listToolCallRecords(200)
      ])
      setUsageOverview(overview)
      setUsageRecords(records)
      setToolRecords(toolCallRecords)
      setTokenPage(1)
      setToolPage(1)
    } catch (error) {
      setUsageError(error instanceof Error ? error.message : '读取用量数据失败，请稍后重试。')
    } finally {
      setIsUsageLoading(false)
    }
  }

  const tokenTotalPages = Math.max(1, Math.ceil(usageRecords.length / PAGE_SIZE))
  const toolTotalPages = Math.max(1, Math.ceil(toolRecords.length / PAGE_SIZE))
  const safeTokenPage = Math.min(tokenPage, tokenTotalPages)
  const safeToolPage = Math.min(toolPage, toolTotalPages)
  const tokenStart = (safeTokenPage - 1) * PAGE_SIZE
  const toolStart = (safeToolPage - 1) * PAGE_SIZE
  const pagedUsageRecords = usageRecords.slice(tokenStart, tokenStart + PAGE_SIZE)
  const pagedToolRecords = toolRecords.slice(toolStart, toolStart + PAGE_SIZE)

  return (
    <div className="rounded-3xl border border-[var(--border-soft)] bg-white px-8 py-7 shadow-[0_14px_38px_rgba(15,15,20,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-semibold text-[var(--ink-main)]">用量统计</h2>
          <p className="mt-2 text-[14px] text-[var(--ink-faint)]">
            统计模型 API 的 token 用量，并展示每次 tool/mcp 调用明细。
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefreshUsage}
          disabled={isUsageLoading}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--border-soft)] bg-white px-4 text-[14px] font-medium text-[var(--ink-main)] transition-all hover:bg-[#f6f6fb] disabled:cursor-not-allowed disabled:bg-[#f4f4f7] disabled:text-[#9ca0ad]"
        >
          {isUsageLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          <span>{isUsageLoading ? '刷新中...' : '刷新数据'}</span>
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[#fafafe] px-4 py-3">
          <p className="text-[13px] text-[var(--ink-faint)]">总会话数</p>
          <p className="mt-2 text-[34px] font-semibold leading-none text-[var(--ink-main)]">
            {usageOverview ? formatNumber(usageOverview.totalSessions) : '--'}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[#fafafe] px-4 py-3">
          <p className="text-[13px] text-[var(--ink-faint)]">总对话数</p>
          <p className="mt-2 text-[34px] font-semibold leading-none text-[var(--ink-main)]">
            {usageOverview ? formatNumber(usageOverview.totalMessages) : '--'}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[#fafafe] px-4 py-3">
          <p className="text-[13px] text-[var(--ink-faint)]">今日消耗 Token</p>
          <p className="mt-2 text-[34px] font-semibold leading-none text-[var(--ink-main)]">
            {usageOverview ? formatNumber(usageOverview.todayTokenUsage) : '--'}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-soft)] bg-[#fafafe] px-4 py-3">
          <p className="text-[13px] text-[var(--ink-faint)]">今日剩余 Token</p>
          <p className="mt-2 text-[34px] font-semibold leading-none text-[var(--ink-main)]">
            {usageOverview?.remainingTokens != null ? formatNumber(usageOverview.remainingTokens) : '--'}
          </p>
        </div>
      </div>

      {usageOverview ? (
        <div className="mt-4 rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 py-2 text-[13px] text-[var(--ink-faint)]">
          今日细分：输入 {formatNumber(usageOverview.todayInputTokens)} / 输出{' '}
          {formatNumber(usageOverview.todayOutputTokens)} / CacheCreate{' '}
          {formatNumber(usageOverview.todayCacheCreationTokens)} / CacheRead{' '}
          {formatNumber(usageOverview.todayCacheReadTokens)}
        </div>
      ) : null}

      {usageError ? (
        <div className="mt-4 rounded-xl border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-[13px] text-[#b91c1c]">
          {usageError}
        </div>
      ) : null}

      <div className="mt-6 inline-flex rounded-xl border border-[var(--border-soft)] bg-[#f6f6fb] p-1">
        <button
          type="button"
          onClick={() => setUsageTab('token')}
          className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
            usageTab === 'token'
              ? 'bg-white text-[var(--ink-main)] shadow-[0_2px_10px_rgba(15,15,20,0.08)]'
              : 'text-[var(--ink-faint)]'
          }`}
        >
          Token 使用详情
        </button>
        <button
          type="button"
          onClick={() => setUsageTab('tool')}
          className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all ${
            usageTab === 'tool'
              ? 'bg-white text-[var(--ink-main)] shadow-[0_2px_10px_rgba(15,15,20,0.08)]'
              : 'text-[var(--ink-faint)]'
          }`}
        >
          Tool/MCP 调用详情
        </button>
      </div>

      {usageTab === 'token' ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border-soft)]">
          <table className="min-w-full border-collapse text-left text-[13px]">
            <thead className="bg-[#f8f8fc] text-[var(--ink-faint)]">
              <tr>
                <th className="px-3 py-2 font-medium">时间</th>
                <th className="px-3 py-2 font-medium">类型</th>
                <th className="px-3 py-2 font-medium">模型</th>
                <th className="px-3 py-2 font-medium">输入</th>
                <th className="px-3 py-2 font-medium">输出</th>
                <th className="px-3 py-2 font-medium">合计</th>
              </tr>
            </thead>
            <tbody>
              {usageRecords.length ? (
                pagedUsageRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="border-t border-[var(--border-soft)] text-[var(--ink-main)]"
                  >
                    <td className="px-3 py-2">{formatTimestamp(record.timestamp)}</td>
                    <td className="px-3 py-2">{usageKindLabel[record.kind]}</td>
                    <td className="px-3 py-2">{record.model}</td>
                    <td className="px-3 py-2">{formatNumber(record.inputTokens)}</td>
                    <td className="px-3 py-2">{formatNumber(record.outputTokens)}</td>
                    <td className="px-3 py-2 font-medium">{formatNumber(record.totalTokens)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-7 text-center text-[var(--ink-faint)]" colSpan={6}>
                    暂无 token 使用记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {usageRecords.length ? (
            <div className="flex items-center justify-between border-t border-[var(--border-soft)] bg-[#fcfcff] px-3 py-2 text-[12px] text-[var(--ink-faint)]">
              <span>
                第 {safeTokenPage}/{tokenTotalPages} 页 · 每页最多 {PAGE_SIZE} 条
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safeTokenPage <= 1}
                  onClick={() => setTokenPage((page) => Math.max(1, page - 1))}
                  className="rounded-lg border border-[var(--border-soft)] bg-white px-2 py-1 text-[12px] text-[var(--ink-main)] disabled:cursor-not-allowed disabled:text-[#9ca0ad]"
                >
                  上一页
                </button>
                <button
                  type="button"
                  disabled={safeTokenPage >= tokenTotalPages}
                  onClick={() => setTokenPage((page) => Math.min(tokenTotalPages, page + 1))}
                  className="rounded-lg border border-[var(--border-soft)] bg-white px-2 py-1 text-[12px] text-[var(--ink-main)] disabled:cursor-not-allowed disabled:text-[#9ca0ad]"
                >
                  下一页
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border-soft)]">
          <table className="min-w-full border-collapse text-left text-[13px]">
            <thead className="bg-[#f8f8fc] text-[var(--ink-faint)]">
              <tr>
                <th className="px-3 py-2 font-medium">时间</th>
                <th className="px-3 py-2 font-medium">调用类型</th>
                <th className="px-3 py-2 font-medium">工具名</th>
                <th className="px-3 py-2 font-medium">阶段</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">耗时</th>
              </tr>
            </thead>
            <tbody>
              {toolRecords.length ? (
                pagedToolRecords.map((record) => (
                  <tr
                    key={record.eventId}
                    className="border-t border-[var(--border-soft)] text-[var(--ink-main)]"
                  >
                    <td className="px-3 py-2">{formatTimestamp(record.timestamp)}</td>
                    <td className="px-3 py-2">{record.callType.toUpperCase()}</td>
                    <td className="px-3 py-2">{record.toolName}</td>
                    <td className="px-3 py-2">{record.phase}</td>
                    <td className="px-3 py-2">{record.status}</td>
                    <td className="px-3 py-2">
                      {record.durationMs != null ? `${record.durationMs}ms` : '--'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-7 text-center text-[var(--ink-faint)]" colSpan={6}>
                    暂无 tool/mcp 调用记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {toolRecords.length ? (
            <div className="flex items-center justify-between border-t border-[var(--border-soft)] bg-[#fcfcff] px-3 py-2 text-[12px] text-[var(--ink-faint)]">
              <span>
                第 {safeToolPage}/{toolTotalPages} 页 · 每页最多 {PAGE_SIZE} 条
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safeToolPage <= 1}
                  onClick={() => setToolPage((page) => Math.max(1, page - 1))}
                  className="rounded-lg border border-[var(--border-soft)] bg-white px-2 py-1 text-[12px] text-[var(--ink-main)] disabled:cursor-not-allowed disabled:text-[#9ca0ad]"
                >
                  上一页
                </button>
                <button
                  type="button"
                  disabled={safeToolPage >= toolTotalPages}
                  onClick={() => setToolPage((page) => Math.min(toolTotalPages, page + 1))}
                  className="rounded-lg border border-[var(--border-soft)] bg-white px-2 py-1 text-[12px] text-[var(--ink-main)] disabled:cursor-not-allowed disabled:text-[#9ca0ad]"
                >
                  下一页
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
