import type { CronDeliverTarget, CronJob, CronRun } from '@shared/types'
import {
  Clock3,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui'

type TaskFormState = {
  name: string
  prompt: string
  schedule: string
  timezone: string
  deliver: CronDeliverTarget
  skills: string
  maxRuns: string
  sourceSessionId: string
}

const createEmptyForm = (): TaskFormState => ({
  name: '',
  prompt: '',
  schedule: '',
  timezone: '',
  deliver: 'local_file',
  skills: '',
  maxRuns: '',
  sourceSessionId: ''
})

const toFormState = (job: CronJob): TaskFormState => ({
  name: job.name,
  prompt: job.prompt,
  schedule: job.schedule,
  timezone: job.timezone ?? '',
  deliver: job.deliver,
  skills: job.skills.join(', '),
  maxRuns: job.maxRuns == null ? '' : String(job.maxRuns),
  sourceSessionId: job.sourceSessionId ?? ''
})

const parseSkills = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)

const formatDateTime = (timestamp: number | null | undefined): string => {
  if (!timestamp) {
    return '未设置'
  }

  return new Intl.DateTimeFormat(window.context.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

const stateStyles: Record<CronJob['state'], string> = {
  scheduled: 'bg-[#eef6ff] text-[#225ea8]',
  paused: 'bg-[#f4f2ec] text-[#7d6740]',
  running: 'bg-[#eef8ef] text-[#2f7d46]',
  completed: 'bg-[#f3f3f6] text-[#6b6b7a]'
}

const runStateStyles: Record<CronRun['status'], string> = {
  running: 'bg-[#eef8ef] text-[#2f7d46]',
  success: 'bg-[#eef6ff] text-[#225ea8]',
  error: 'bg-[#fff1f2] text-[#b42318]'
}

export const TasksPage = () => {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [runs, setRuns] = useState<CronRun[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TaskFormState>(createEmptyForm())
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeJobAction, setActiveJobAction] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId]
  )

  const selectedRuns = useMemo(() => {
    if (!selectedJob) {
      return []
    }

    return runs.filter((run) => run.jobId === selectedJob.id).slice(0, 8)
  }, [runs, selectedJob])

  const loadCronData = async (preferredJobId?: string | null) => {
    setIsLoading(true)
    setErrorMessage('')

    try {
      const [nextJobs, nextRuns] = await Promise.all([
        window.context.listCronJobs(),
        window.context.listCronRuns(200)
      ])
      setJobs(nextJobs)
      setRuns(nextRuns)

      const nextSelectedId =
        (preferredJobId && nextJobs.some((job) => job.id === preferredJobId) && preferredJobId) ||
        (selectedJobId && nextJobs.some((job) => job.id === selectedJobId) && selectedJobId) ||
        nextJobs[0]?.id ||
        null

      setSelectedJobId(nextSelectedId)
      if (!nextSelectedId) {
        setDraft(createEmptyForm())
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '加载 cron 任务失败。')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadCronData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selectedJob) {
      setDraft(toFormState(selectedJob))
      setStatusMessage('')
      setErrorMessage('')
      return
    }

    if (selectedJobId == null) {
      setDraft(createEmptyForm())
    }
  }, [selectedJob, selectedJobId])

  const handleDraftChange = <K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setStatusMessage('')
    setErrorMessage('')
  }

  const handleNewDraft = () => {
    setSelectedJobId(null)
    setDraft(createEmptyForm())
    setStatusMessage('')
    setErrorMessage('')
  }

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.prompt.trim() || !draft.schedule.trim()) {
      setErrorMessage('名称、Prompt 和 Schedule 为必填项。')
      return
    }

    const maxRuns =
      draft.maxRuns.trim().length > 0 ? Number.parseInt(draft.maxRuns.trim(), 10) : null
    if (draft.maxRuns.trim().length > 0 && (!Number.isInteger(maxRuns) || (maxRuns ?? 0) <= 0)) {
      setErrorMessage('Max runs 必须是正整数。')
      return
    }

    setIsSaving(true)
    setErrorMessage('')
    setStatusMessage('')

    try {
      if (selectedJob) {
        const updated = await window.context.updateCronJob(selectedJob.id, {
          name: draft.name.trim(),
          prompt: draft.prompt.trim(),
          schedule: draft.schedule.trim(),
          timezone: draft.timezone.trim() || null,
          deliver: draft.deliver,
          skills: parseSkills(draft.skills),
          maxRuns
        })
        setStatusMessage('任务已更新。')
        await loadCronData(updated.id)
      } else {
        const created = await window.context.createCronJob({
          name: draft.name.trim(),
          prompt: draft.prompt.trim(),
          schedule: draft.schedule.trim(),
          timezone: draft.timezone.trim() || null,
          deliver: draft.deliver,
          skills: parseSkills(draft.skills),
          maxRuns,
          sourceSessionId: draft.sourceSessionId.trim() || null
        })
        setStatusMessage('任务已创建。')
        await loadCronData(created.id)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存 cron 任务失败。')
    } finally {
      setIsSaving(false)
    }
  }

  const handleJobAction = async (
    job: CronJob,
    action: 'pause' | 'resume' | 'run' | 'remove'
  ) => {
    if (action === 'remove') {
      const confirmed = window.confirm(`确定删除任务 “${job.name}” 吗？`)
      if (!confirmed) {
        return
      }
    }

    setActiveJobAction(action === 'run' ? `${job.id}:run` : `${job.id}:${action}`)
    setErrorMessage('')
    setStatusMessage('')

    try {
      if (action === 'pause') {
        const updated = await window.context.pauseCronJob(job.id)
        setStatusMessage(`已暂停：${updated.name}`)
        await loadCronData(updated.id)
      }

      if (action === 'resume') {
        const updated = await window.context.resumeCronJob(job.id)
        setStatusMessage(`已恢复：${updated.name}`)
        await loadCronData(updated.id)
      }

      if (action === 'run') {
        await window.context.runCronJob(job.id)
        setStatusMessage(`已触发执行：${job.name}`)
        await loadCronData(job.id)
      }

      if (action === 'remove') {
        await window.context.removeCronJob(job.id)
        setStatusMessage(`已删除：${job.name}`)
        await loadCronData(job.id === selectedJobId ? null : selectedJobId)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '执行任务操作失败。')
    } finally {
      setActiveJobAction(null)
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--content-bg)]">
      <aside className="flex w-[332px] min-w-[332px] flex-col border-r border-[var(--border-soft)] px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[24px] font-semibold text-[var(--ink-main)]">任务</p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--ink-faint)]">
              展示和维护 cron jobs。支持查看状态、编辑配置、暂停恢复和手动触发。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void loadCronData(selectedJobId)}
            disabled={isLoading}
            className="h-10 w-10 rounded-2xl border-[var(--border-soft)] bg-white"
          >
            {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <div className="mt-5 rounded-3xl border border-[var(--border-soft)] bg-white p-3 shadow-[0_10px_30px_rgba(15,15,20,0.05)]">
          <button
            type="button"
            onClick={handleNewDraft}
            className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${
              selectedJobId === null
                ? 'border-[#d8d8e3] bg-[#f5f5fa]'
                : 'border-transparent bg-[#fbfbfe] hover:bg-[#f5f5fa]'
            }`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#eef0f8] text-[var(--ink-main)]">
              <Plus className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-[var(--ink-main)]">新建任务</span>
              <span className="mt-1 block text-[12px] text-[var(--ink-faint)]">
                创建一个新的 cron job 草稿
              </span>
            </span>
          </button>

          <div className="mt-3 max-h-[calc(100vh-270px)] space-y-2 overflow-auto pr-1">
            {jobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[#fafafc] px-4 py-6 text-[13px] leading-6 text-[var(--ink-faint)]">
                还没有 cron 任务。点击上方“新建任务”开始配置。
              </div>
            ) : (
              jobs.map((job) => {
                const isSelected = job.id === selectedJobId

                return (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedJobId(job.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                      isSelected
                        ? 'border-[#d8d8e3] bg-[#f6f6fb] shadow-[0_10px_20px_rgba(15,15,20,0.04)]'
                        : 'border-transparent bg-[#fbfbfe] hover:bg-[#f5f5fa]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-[var(--ink-main)]">
                          {job.name}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-[12px] text-[var(--ink-faint)]">
                          <Clock3 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{job.schedule}</span>
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${stateStyles[job.state]}`}
                      >
                        {job.state}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[var(--ink-faint)]">
                      <span className="truncate">下次执行：{formatDateTime(job.nextRunAt)}</span>
                      <span className="shrink-0">Run #{job.runCount}</span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 justify-center overflow-auto px-8 py-8">
        <div className="w-full max-w-[980px]">
          <div className="rounded-3xl border border-[var(--border-soft)] bg-white px-8 py-7 shadow-[0_14px_38px_rgba(15,15,20,0.05)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-[28px] font-semibold text-[var(--ink-main)]">
                  {selectedJob ? '编辑任务' : '新建任务'}
                </h1>
                <p className="mt-2 text-[14px] text-[var(--ink-faint)]">
                  {selectedJob
                    ? `任务 ID: ${selectedJob.id}`
                    : '填写名称、Prompt 和 Schedule，保存后即可由主进程后台调度。'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedJob ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void handleJobAction(
                          selectedJob,
                          selectedJob.state === 'paused' ? 'resume' : 'pause'
                        )
                      }
                      disabled={activeJobAction !== null || selectedJob.state === 'completed'}
                      className="rounded-2xl border-[var(--border-soft)]"
                    >
                      {activeJobAction ===
                      `${selectedJob.id}:${selectedJob.state === 'paused' ? 'resume' : 'pause'}` ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : selectedJob.state === 'paused' ? (
                        <Play className="mr-2 h-4 w-4" />
                      ) : (
                        <Pause className="mr-2 h-4 w-4" />
                      )}
                      {selectedJob.state === 'paused' ? '恢复' : '暂停'}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleJobAction(selectedJob, 'run')}
                      disabled={activeJobAction !== null || selectedJob.state === 'running'}
                      className="rounded-2xl border-[var(--border-soft)]"
                    >
                      {activeJobAction === `${selectedJob.id}:run` ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      立即运行
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void handleJobAction(selectedJob, 'remove')}
                      disabled={activeJobAction !== null || selectedJob.state === 'running'}
                      className="rounded-2xl"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      删除
                    </Button>
                  </>
                ) : null}

                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="rounded-2xl bg-[var(--ink-main)] text-white hover:bg-[#2c2c34]"
                >
                  {isSaving ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {selectedJob ? '保存修改' : '创建任务'}
                </Button>
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-5 rounded-2xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-[13px] text-[#b42318]">
                {errorMessage}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="mt-5 rounded-2xl border border-[#d7e7d8] bg-[#f3faf4] px-4 py-3 text-[13px] text-[#2f7d46]">
                {statusMessage}
              </div>
            ) : null}

            <div className="mt-8 grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-[15px] font-semibold text-[var(--ink-main)]">
                  Name
                </label>
                <input
                  value={draft.name}
                  onChange={(event) => handleDraftChange('name', event.target.value)}
                  placeholder="例如：Daily briefing"
                  className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 text-[14px] text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-[15px] font-semibold text-[var(--ink-main)]">
                  Schedule
                </label>
                <input
                  value={draft.schedule}
                  onChange={(event) => handleDraftChange('schedule', event.target.value)}
                  placeholder="30m / every 2h / 0 9 * * * / 2026-04-18T09:00:00Z"
                  className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 text-[14px] text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-[15px] font-semibold text-[var(--ink-main)]">
                  Prompt
                </label>
                <textarea
                  value={draft.prompt}
                  onChange={(event) => handleDraftChange('prompt', event.target.value)}
                  placeholder="填写 cron job 执行时发给 agent 的任务说明"
                  className="min-h-[150px] w-full rounded-2xl border border-[var(--border-soft)] bg-[#fbfbfe] px-4 py-3 text-[14px] leading-7 text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-[15px] font-semibold text-[var(--ink-main)]">
                  Deliver
                </label>
                <select
                  value={draft.deliver}
                  onChange={(event) =>
                    handleDraftChange('deliver', event.target.value as CronDeliverTarget)
                  }
                  className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 text-[14px] text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white"
                >
                  <option value="local_file">local_file</option>
                  <option value="origin_session">origin_session</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-[15px] font-semibold text-[var(--ink-main)]">
                  Timezone
                </label>
                <input
                  value={draft.timezone}
                  onChange={(event) => handleDraftChange('timezone', event.target.value)}
                  placeholder="留空则使用本机时区，例如 Asia/Shanghai"
                  className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 text-[14px] text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-[15px] font-semibold text-[var(--ink-main)]">
                  Skills
                </label>
                <input
                  value={draft.skills}
                  onChange={(event) => handleDraftChange('skills', event.target.value)}
                  placeholder="多个 skill 以逗号分隔"
                  className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 text-[14px] text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-[15px] font-semibold text-[var(--ink-main)]">
                  Max runs
                </label>
                <input
                  value={draft.maxRuns}
                  onChange={(event) => handleDraftChange('maxRuns', event.target.value)}
                  placeholder="留空表示不限制"
                  className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 text-[14px] text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-[15px] font-semibold text-[var(--ink-main)]">
                  Source session ID
                </label>
                <input
                  value={draft.sourceSessionId}
                  onChange={(event) => handleDraftChange('sourceSessionId', event.target.value)}
                  disabled={Boolean(selectedJob)}
                  placeholder="创建时可选；用于 deliver=origin_session"
                  className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 text-[14px] text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white disabled:cursor-not-allowed disabled:bg-[#f3f3f6] disabled:text-[var(--ink-faint)]"
                />
                <p className="mt-2 text-[12px] text-[var(--ink-faint)]">
                  现有任务的 source session 目前在编辑页只读展示，不支持修改。
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-[var(--border-soft)] bg-white px-8 py-7 shadow-[0_14px_38px_rgba(15,15,20,0.05)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-[22px] font-semibold text-[var(--ink-main)]">最近运行</h2>
                <p className="mt-2 text-[13px] text-[var(--ink-faint)]">
                  {selectedJob ? `展示 ${selectedJob.name} 的最近运行记录` : '选中一个任务后查看运行记录'}
                </p>
              </div>
              {selectedJob ? (
                <span className="text-[12px] text-[var(--ink-faint)]">
                  共 {selectedRuns.length} 条可见记录
                </span>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {!selectedJob ? (
                <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[#fafafc] px-4 py-6 text-[13px] text-[var(--ink-faint)]">
                  左侧选择一个 cron job 后，这里会展示它的执行结果和最近状态。
                </div>
              ) : selectedRuns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[#fafafc] px-4 py-6 text-[13px] text-[var(--ink-faint)]">
                  该任务还没有运行记录。你可以点击“立即运行”先触发一次。
                </div>
              ) : (
                selectedRuns.map((run) => (
                  <article
                    key={run.id}
                    className="rounded-2xl border border-[var(--border-soft)] bg-[#fbfbfe] px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-[var(--ink-main)]">
                          {run.triggerKind} · {formatDateTime(run.startedAt)}
                        </p>
                        <p className="mt-1 text-[12px] text-[var(--ink-faint)]">
                          完成时间：{formatDateTime(run.finishedAt)}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-medium ${runStateStyles[run.status]}`}
                      >
                        {run.status}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-[12px] text-[var(--ink-faint)] md:grid-cols-2">
                      <span>Model: {run.model ?? '未记录'}</span>
                      <span>Tokens: {run.inputTokens + run.outputTokens}</span>
                      <span>输出文件: {run.outputPath ?? '无'}</span>
                      <span>下一次执行: {formatDateTime(run.nextRunAt)}</span>
                    </div>

                    <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-[13px] leading-6 text-[var(--ink-soft)]">
                      {run.errorText || run.outputPreview || '无输出预览'}
                    </p>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
