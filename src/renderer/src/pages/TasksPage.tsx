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
import { useI18n } from '../i18n'

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
  const { t, formatDateTime } = useI18n()
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
      setErrorMessage(error instanceof Error ? error.message : t('tasks.loadFailed'))
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
      setErrorMessage(t('tasks.requiredFields'))
      return
    }

    const maxRuns =
      draft.maxRuns.trim().length > 0 ? Number.parseInt(draft.maxRuns.trim(), 10) : null
    if (draft.maxRuns.trim().length > 0 && (!Number.isInteger(maxRuns) || (maxRuns ?? 0) <= 0)) {
      setErrorMessage(t('tasks.maxRunsPositive'))
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
        setStatusMessage(t('tasks.updated'))
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
        setStatusMessage(t('tasks.created'))
        await loadCronData(created.id)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('tasks.saveFailed'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleJobAction = async (
    job: CronJob,
    action: 'pause' | 'resume' | 'run' | 'remove'
  ) => {
    if (action === 'remove') {
      const confirmed = window.confirm(t('tasks.deleteConfirm', { name: job.name }))
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
        setStatusMessage(t('tasks.paused', { name: updated.name }))
        await loadCronData(updated.id)
      }

      if (action === 'resume') {
        const updated = await window.context.resumeCronJob(job.id)
        setStatusMessage(t('tasks.resumed', { name: updated.name }))
        await loadCronData(updated.id)
      }

      if (action === 'run') {
        await window.context.runCronJob(job.id)
        setStatusMessage(t('tasks.triggered', { name: job.name }))
        await loadCronData(job.id)
      }

      if (action === 'remove') {
        await window.context.removeCronJob(job.id)
        setStatusMessage(t('tasks.deleted', { name: job.name }))
        await loadCronData(job.id === selectedJobId ? null : selectedJobId)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('tasks.actionFailed'))
    } finally {
      setActiveJobAction(null)
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--content-bg)]">
      <aside className="flex w-[332px] min-w-[332px] flex-col border-r border-[var(--border-soft)] px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[24px] font-semibold text-[var(--ink-main)]">{t('tasks.title')}</p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--ink-faint)]">
              {t('tasks.description')}
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
              <span className="block text-[14px] font-semibold text-[var(--ink-main)]">
                {t('tasks.newTask')}
              </span>
              <span className="mt-1 block text-[12px] text-[var(--ink-faint)]">
                {t('tasks.newTaskDescription')}
              </span>
            </span>
          </button>

          <div className="mt-3 max-h-[calc(100vh-270px)] space-y-2 overflow-auto pr-1">
            {jobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[#fafafc] px-4 py-6 text-[13px] leading-6 text-[var(--ink-faint)]">
                {t('tasks.empty')}
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
                      <span className="truncate">
                        {t('tasks.nextRun', { time: formatDateTime(job.nextRunAt) })}
                      </span>
                      <span className="shrink-0">{t('tasks.runCount', { count: job.runCount })}</span>
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
                  {selectedJob ? t('tasks.editTask') : t('tasks.newTask')}
                </h1>
                <p className="mt-2 text-[14px] text-[var(--ink-faint)]">
                  {selectedJob
                    ? t('tasks.taskId', { id: selectedJob.id })
                    : t('tasks.formDescription')}
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
                      {selectedJob.state === 'paused' ? t('tasks.resume') : t('tasks.pause')}
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
                      {t('tasks.runNow')}
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void handleJobAction(selectedJob, 'remove')}
                      disabled={activeJobAction !== null || selectedJob.state === 'running'}
                      className="rounded-2xl"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('common.delete')}
                    </Button>
                  </>
                ) : null}

                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="rounded-2xl bg-[var(--ink-main)] text-[var(--primary-ink)] hover:opacity-90"
                >
                  {isSaving ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {selectedJob ? t('tasks.saveChanges') : t('tasks.createTask')}
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
                  {t('tasks.name')}
                </label>
                <input
                  value={draft.name}
                  onChange={(event) => handleDraftChange('name', event.target.value)}
                  placeholder={t('tasks.namePlaceholder')}
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
                  placeholder={t('tasks.promptPlaceholder')}
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
                  placeholder={t('tasks.timezonePlaceholder')}
                  className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 text-[14px] text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-[15px] font-semibold text-[var(--ink-main)]">
                  {t('tasks.skills')}
                </label>
                <input
                  value={draft.skills}
                  onChange={(event) => handleDraftChange('skills', event.target.value)}
                  placeholder={t('tasks.skillsPlaceholder')}
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
                  placeholder={t('tasks.maxRunsPlaceholder')}
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
                  placeholder={t('tasks.sourceSessionPlaceholder')}
                  className="h-11 w-full rounded-xl border border-[var(--border-soft)] bg-[#fbfbfe] px-3 text-[14px] text-[var(--ink-main)] outline-none transition-all focus:border-[#b9b9ca] focus:bg-white disabled:cursor-not-allowed disabled:bg-[#f3f3f6] disabled:text-[var(--ink-faint)]"
                />
                <p className="mt-2 text-[12px] text-[var(--ink-faint)]">
                  {t('tasks.sourceReadonly')}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-[var(--border-soft)] bg-white px-8 py-7 shadow-[0_14px_38px_rgba(15,15,20,0.05)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-[22px] font-semibold text-[var(--ink-main)]">
                  {t('tasks.recentRuns')}
                </h2>
                <p className="mt-2 text-[13px] text-[var(--ink-faint)]">
                  {selectedJob
                    ? t('tasks.recentRunsFor', { name: selectedJob.name })
                    : t('tasks.recentRunsEmptySelection')}
                </p>
              </div>
              {selectedJob ? (
                <span className="text-[12px] text-[var(--ink-faint)]">
                  {t('tasks.visibleCount', { count: selectedRuns.length })}
                </span>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {!selectedJob ? (
                <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[#fafafc] px-4 py-6 text-[13px] text-[var(--ink-faint)]">
                  {t('tasks.selectForRuns')}
                </div>
              ) : selectedRuns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[#fafafc] px-4 py-6 text-[13px] text-[var(--ink-faint)]">
                  {t('tasks.noRuns')}
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
                          {t('tasks.finishedAt', { time: formatDateTime(run.finishedAt) })}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-medium ${runStateStyles[run.status]}`}
                      >
                        {run.status}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-[12px] text-[var(--ink-faint)] md:grid-cols-2">
                      <span>{t('tasks.model', { model: run.model ?? t('common.notRecorded') })}</span>
                      <span>Tokens: {run.inputTokens + run.outputTokens}</span>
                      <span>{t('tasks.outputFile', { path: run.outputPath ?? t('common.none') })}</span>
                      <span>{t('tasks.nextRunInline', { time: formatDateTime(run.nextRunAt) })}</span>
                    </div>

                    <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-[13px] leading-6 text-[var(--ink-soft)]">
                      {run.errorText || run.outputPreview || t('tasks.noOutput')}
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
