import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type {
  CronDeliverTarget,
  CronJob,
  CronRun,
  CronRunTriggerKind,
  CreateCronJobInput,
  UpdateCronJobInput
} from '@shared/types'
import { loadInstalledSkillsFromDir } from '../skills/loadSkillsDir'
import { resolveDeepClawPath } from '../utils'
import type { ExecuteCronJobResult, OriginSessionPublisher } from './types'
import { CronExecutor } from './executor'
import { CronRepository } from './repository'
import {
  assertValidTimeZone,
  computeNextRunAt,
  detectScheduleKind,
  resolveMaxRuns
} from './schedule'

type CronServiceOptions = {
  repository?: CronRepository
  executor?: CronExecutor
  now?: () => number
  outputRootDir?: string
  originSessionPublisher?: OriginSessionPublisher
}

const DEFAULT_MISFIRE_POLICY = 'run_once_on_resume'

const formatDeliveredText = (job: CronJob, text: string): string =>
  [`Cron Job: ${job.name}`, '', text.trim()].join('\n').trim()

export class CronService {
  private readonly repository: CronRepository

  private readonly executor: CronExecutor

  private readonly now: () => number

  private readonly outputRootDir: string

  private originSessionPublisher: OriginSessionPublisher | null

  constructor(options: CronServiceOptions = {}) {
    this.repository = options.repository ?? new CronRepository()
    this.executor = options.executor ?? new CronExecutor()
    this.now = options.now ?? (() => Date.now())
    this.outputRootDir = options.outputRootDir ?? resolveDeepClawPath('cron', 'output')
    this.originSessionPublisher = options.originSessionPublisher ?? null
  }

  setOriginSessionPublisher(publisher: OriginSessionPublisher): void {
    this.originSessionPublisher = publisher
  }

  async listJobs(): Promise<CronJob[]> {
    return this.repository.listJobs()
  }

  async listRuns(limit = 100): Promise<CronRun[]> {
    return this.repository.listRuns(limit)
  }

  async createJob(input: CreateCronJobInput): Promise<CronJob> {
    const now = this.now()
    const scheduleKind = detectScheduleKind(input.schedule)
    const maxRuns = resolveMaxRuns(scheduleKind, input.maxRuns)
    const timezone = assertValidTimeZone(input.timezone)
    const skills = this.validateSkills(input.skills ?? [])
    const sourceSessionId = input.sourceSessionId?.trim() || null
    const deliver = this.resolveDeliverTarget(input.deliver, sourceSessionId)
    this.assertScriptSupported(input.script ?? null)

    const nextRunAt = computeNextRunAt({
      schedule: input.schedule.trim(),
      scheduleKind,
      timezone,
      fromTime: now,
      runCount: 0,
      maxRuns
    })

    const job: CronJob = {
      id: `cron_${randomUUID()}`,
      name: input.name.trim(),
      prompt: input.prompt.trim(),
      schedule: input.schedule.trim(),
      scheduleKind,
      timezone,
      state: nextRunAt == null ? 'completed' : 'scheduled',
      nextRunAt,
      lastRunAt: null,
      sourceSessionId,
      deliver,
      skills,
      script: null,
      runCount: 0,
      maxRuns,
      misfirePolicy: DEFAULT_MISFIRE_POLICY,
      createdAt: now,
      updatedAt: now
    }

    this.assertJob(job)
    return this.repository.insertJob(job)
  }

  async updateJob(jobId: string, input: UpdateCronJobInput): Promise<CronJob> {
    const current = this.repository.readJob(jobId)
    if (current.state === 'running') {
      throw new Error('Cannot update a cron job while it is running.')
    }

    const now = this.now()
    const schedule = input.schedule?.trim() ?? current.schedule
    const scheduleKind = input.schedule ? detectScheduleKind(schedule) : current.scheduleKind
    const timezone =
      input.timezone !== undefined ? assertValidTimeZone(input.timezone) : current.timezone
    const skills = input.skills ? this.validateSkills(input.skills) : current.skills
    const maxRuns =
      input.maxRuns !== undefined ? resolveMaxRuns(scheduleKind, input.maxRuns) : current.maxRuns
    this.assertScriptSupported(input.script !== undefined ? input.script : current.script)
    const updatedBase: CronJob = {
      ...current,
      name: input.name?.trim() ?? current.name,
      prompt: input.prompt?.trim() ?? current.prompt,
      schedule,
      scheduleKind,
      timezone,
      deliver: input.deliver ?? current.deliver,
      skills,
      script: null,
      maxRuns,
      updatedAt: now
    }

    const nextRunAt = computeNextRunAt({
      schedule,
      scheduleKind,
      timezone,
      fromTime: now,
      runCount: updatedBase.runCount,
      maxRuns
    })

    const nextState =
      updatedBase.state === 'paused'
        ? 'paused'
        : nextRunAt == null
          ? 'completed'
          : 'scheduled'
    const updatedJob: CronJob = {
      ...updatedBase,
      state: nextState,
      nextRunAt
    }

    this.assertJob(updatedJob)
    return this.repository.updateJob(updatedJob)
  }

  async pauseJob(jobId: string): Promise<CronJob> {
    const current = this.repository.readJob(jobId)
    if (current.state === 'running') {
      throw new Error('Cannot pause a cron job while it is running.')
    }

    if (current.state === 'completed') {
      return current
    }

    return this.repository.updateJob({
      ...current,
      state: 'paused',
      updatedAt: this.now()
    })
  }

  async resumeJob(jobId: string): Promise<CronJob> {
    const current = this.repository.readJob(jobId)
    if (current.state !== 'paused') {
      return current
    }

    const now = this.now()
    const nextRunAt = computeNextRunAt({
      schedule: current.schedule,
      scheduleKind: current.scheduleKind,
      timezone: current.timezone,
      fromTime: now,
      runCount: current.runCount,
      maxRuns: current.maxRuns
    })

    return this.repository.updateJob({
      ...current,
      state: nextRunAt == null ? 'completed' : 'scheduled',
      nextRunAt,
      updatedAt: now
    })
  }

  async removeJob(jobId: string): Promise<void> {
    const current = this.repository.readJob(jobId)
    if (current.state === 'running') {
      throw new Error('Cannot remove a cron job while it is running.')
    }

    this.repository.removeJob(jobId)
  }

  claimDueJobs(limit: number): CronJob[] {
    return this.repository.claimDueJobs(this.now(), Math.max(0, limit))
  }

  async runJob(jobId: string): Promise<CronRun> {
    const job = this.repository.claimJob(jobId, this.now())
    return this.executeClaimedJob(job, 'manual')
  }

  async executeClaimedJob(job: CronJob, triggerKind: CronRunTriggerKind): Promise<CronRun> {
    const startedAt = this.now()
    const run: CronRun = {
      id: `cron_run_${randomUUID()}`,
      jobId: job.id,
      triggerKind,
      status: 'running',
      startedAt,
      finishedAt: null,
      linkedSessionId: job.deliver === 'origin_session' ? job.sourceSessionId : null,
      outputPreview: '',
      outputPath: null,
      errorText: null,
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      nextRunAt: job.nextRunAt
    }
    this.repository.insertRun(run)

    let execution: ExecuteCronJobResult
    try {
      execution = await this.executor.execute(job)
    } catch (error) {
      execution = {
        outputText: '',
        status: 'error',
        model: null,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        errorText: error instanceof Error ? error.message : String(error)
      }
    }

    const finishedAt = this.now()
    const deliveredText = formatDeliveredText(job, execution.outputText || execution.errorText || '')
    const nextRunCount = job.runCount + 1
    const nextRunAt = computeNextRunAt({
      schedule: job.schedule,
      scheduleKind: job.scheduleKind,
      timezone: job.timezone,
      fromTime: finishedAt,
      runCount: nextRunCount,
      maxRuns: job.maxRuns
    })

    let status = execution.status
    let outputPath: string | null = null
    let errorText = execution.errorText
    if (status === 'success') {
      try {
        outputPath = await this.deliver(job, run.id, deliveredText, status)
      } catch (error) {
        status = 'error'
        errorText = error instanceof Error ? error.message : String(error)
      }
    }
    const finalRun: CronRun = {
      ...run,
      status,
      finishedAt,
      outputPreview: this.executor.toPreview(deliveredText || execution.errorText || ''),
      outputPath,
      errorText,
      model: execution.model,
      inputTokens: execution.inputTokens,
      outputTokens: execution.outputTokens,
      cacheCreationTokens: execution.cacheCreationTokens,
      cacheReadTokens: execution.cacheReadTokens,
      nextRunAt
    }
    const nextJob: CronJob = {
      ...job,
      state: nextRunAt == null ? 'completed' : 'scheduled',
      nextRunAt,
      lastRunAt: finishedAt,
      runCount: nextRunCount,
      updatedAt: finishedAt
    }

    this.repository.updateRun(finalRun)
    this.repository.updateJob(nextJob)

    if (status === 'error' && job.deliver === 'origin_session' && job.sourceSessionId) {
      await this.publishOriginSession(job.sourceSessionId, job, finalRun, errorText || '')
    }

    return finalRun
  }

  private async deliver(
    job: CronJob,
    runId: string,
    text: string,
    status: 'success' | 'error'
  ): Promise<string | null> {
    if (job.deliver === 'origin_session' && job.sourceSessionId) {
      await this.publishOriginSession(job.sourceSessionId, job, { id: runId } as CronRun, text, status)
      return null
    }

    mkdirSync(this.outputRootDir, { recursive: true })
    const filename = `${new Date(this.now()).toISOString().replace(/[:]/g, '-')}-${runId}.md`
    const outputPath = path.join(this.outputRootDir, filename)
    writeFileSync(outputPath, `${text}\n`, 'utf8')
    return outputPath
  }

  private async publishOriginSession(
    sessionId: string,
    job: CronJob,
    run: Pick<CronRun, 'id'>,
    text: string,
    status: 'success' | 'error' = 'success'
  ): Promise<void> {
    if (!this.originSessionPublisher) {
      return
    }

    try {
      await this.originSessionPublisher(sessionId, {
        job,
        run: { id: run.id } as CronRun,
        text,
        status
      })
    } catch (error) {
      console.warn('[cron] failed to publish origin session delivery', error)
    }
  }

  private resolveDeliverTarget(
    deliver: CronDeliverTarget | undefined,
    sourceSessionId: string | null
  ): CronDeliverTarget {
    if (deliver) {
      return deliver
    }

    return sourceSessionId ? 'origin_session' : 'local_file'
  }

  private validateSkills(skills: string[]): string[] {
    const installed = new Set(loadInstalledSkillsFromDir().map((skill) => skill.skillId))
    const normalized = skills
      .map((skill) => skill.trim())
      .filter(Boolean)

    for (const skillId of normalized) {
      if (!installed.has(skillId)) {
        throw new Error(`Unknown skill: ${skillId}`)
      }
    }

    return [...new Set(normalized)]
  }

  private assertScriptSupported(script: string | null): void {
    if (script != null && script.trim()) {
      throw new Error('Cron script preprocessors are reserved for a later version.')
    }
  }

  private assertJob(job: CronJob): void {
    if (!job.name.trim()) {
      throw new Error('Cron job name cannot be empty.')
    }

    if (!job.prompt.trim()) {
      throw new Error('Cron job prompt cannot be empty.')
    }
  }
}
