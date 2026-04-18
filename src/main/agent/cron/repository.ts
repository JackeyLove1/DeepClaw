import type Database from 'better-sqlite3'
import type { CronJob, CronRun } from '@shared/types'
import { ensureChatSchema } from '../../chat/sqlite-schema'
import { getDatabase } from '../../lib/database'

type CronJobRow = Omit<CronJob, 'skills'> & {
  skillsJson: string
}

const rowToCronJob = (row: CronJobRow): CronJob => ({
  id: row.id,
  name: row.name,
  prompt: row.prompt,
  schedule: row.schedule,
  scheduleKind: row.scheduleKind,
  timezone: row.timezone,
  state: row.state,
  nextRunAt: row.nextRunAt,
  lastRunAt: row.lastRunAt,
  sourceSessionId: row.sourceSessionId,
  deliver: row.deliver,
  skills: JSON.parse(row.skillsJson || '[]') as string[],
  script: row.script,
  runCount: row.runCount,
  maxRuns: row.maxRuns,
  misfirePolicy: row.misfirePolicy,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

const jobToParams = (job: CronJob): CronJobRow => ({
  ...job,
  skillsJson: JSON.stringify(job.skills)
})

export class CronRepository {
  private readonly db: Database.Database

  constructor(database: Database.Database = getDatabase()) {
    this.db = database
    ensureChatSchema(this.db)
  }

  listJobs(): CronJob[] {
    const rows = this.db
      .prepare(
        `
        SELECT *
        FROM cron_jobs
        ORDER BY updatedAt DESC, createdAt DESC
        `
      )
      .all() as CronJobRow[]

    return rows.map(rowToCronJob)
  }

  listRuns(limit = 100): CronRun[] {
    return this.db
      .prepare(
        `
        SELECT *
        FROM cron_runs
        ORDER BY startedAt DESC, id DESC
        LIMIT ?
        `
      )
      .all(limit) as CronRun[]
  }

  readJob(jobId: string): CronJob {
    const row = this.db
      .prepare(
        `
        SELECT *
        FROM cron_jobs
        WHERE id = ?
        `
      )
      .get(jobId) as CronJobRow | undefined

    if (!row) {
      throw new Error(`Cron job not found: ${jobId}`)
    }

    return rowToCronJob(row)
  }

  insertJob(job: CronJob): CronJob {
    this.db
      .prepare(
        `
        INSERT INTO cron_jobs (
          id,
          name,
          prompt,
          schedule,
          scheduleKind,
          timezone,
          state,
          nextRunAt,
          lastRunAt,
          sourceSessionId,
          deliver,
          skillsJson,
          script,
          runCount,
          maxRuns,
          misfirePolicy,
          createdAt,
          updatedAt
        )
        VALUES (
          @id,
          @name,
          @prompt,
          @schedule,
          @scheduleKind,
          @timezone,
          @state,
          @nextRunAt,
          @lastRunAt,
          @sourceSessionId,
          @deliver,
          @skillsJson,
          @script,
          @runCount,
          @maxRuns,
          @misfirePolicy,
          @createdAt,
          @updatedAt
        )
        `
      )
      .run(jobToParams(job))

    return job
  }

  updateJob(job: CronJob): CronJob {
    this.db
      .prepare(
        `
        UPDATE cron_jobs
        SET
          name = @name,
          prompt = @prompt,
          schedule = @schedule,
          scheduleKind = @scheduleKind,
          timezone = @timezone,
          state = @state,
          nextRunAt = @nextRunAt,
          lastRunAt = @lastRunAt,
          sourceSessionId = @sourceSessionId,
          deliver = @deliver,
          skillsJson = @skillsJson,
          script = @script,
          runCount = @runCount,
          maxRuns = @maxRuns,
          misfirePolicy = @misfirePolicy,
          createdAt = @createdAt,
          updatedAt = @updatedAt
        WHERE id = @id
        `
      )
      .run(jobToParams(job))

    return job
  }

  removeJob(jobId: string): void {
    this.db
      .prepare(
        `
        DELETE FROM cron_jobs
        WHERE id = ?
        `
      )
      .run(jobId)
  }

  insertRun(run: CronRun): CronRun {
    this.db
      .prepare(
        `
        INSERT INTO cron_runs (
          id,
          jobId,
          triggerKind,
          status,
          startedAt,
          finishedAt,
          linkedSessionId,
          outputPreview,
          outputPath,
          errorText,
          model,
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          nextRunAt
        )
        VALUES (
          @id,
          @jobId,
          @triggerKind,
          @status,
          @startedAt,
          @finishedAt,
          @linkedSessionId,
          @outputPreview,
          @outputPath,
          @errorText,
          @model,
          @inputTokens,
          @outputTokens,
          @cacheCreationTokens,
          @cacheReadTokens,
          @nextRunAt
        )
        `
      )
      .run(run)

    return run
  }

  updateRun(run: CronRun): CronRun {
    this.db
      .prepare(
        `
        UPDATE cron_runs
        SET
          triggerKind = @triggerKind,
          status = @status,
          startedAt = @startedAt,
          finishedAt = @finishedAt,
          linkedSessionId = @linkedSessionId,
          outputPreview = @outputPreview,
          outputPath = @outputPath,
          errorText = @errorText,
          model = @model,
          inputTokens = @inputTokens,
          outputTokens = @outputTokens,
          cacheCreationTokens = @cacheCreationTokens,
          cacheReadTokens = @cacheReadTokens,
          nextRunAt = @nextRunAt
        WHERE id = @id
        `
      )
      .run(run)

    return run
  }

  claimDueJobs(now: number, limit: number): CronJob[] {
    const transaction = this.db.transaction((currentTime: number, take: number) => {
      const rows = this.db
        .prepare(
          `
          SELECT *
          FROM cron_jobs
          WHERE state = 'scheduled'
            AND nextRunAt IS NOT NULL
            AND nextRunAt <= ?
          ORDER BY nextRunAt ASC, createdAt ASC
          LIMIT ?
          `
        )
        .all(currentTime, take) as CronJobRow[]

      const claimed: CronJob[] = []
      for (const row of rows) {
        const updatedAt = currentTime
        const result = this.db
          .prepare(
            `
            UPDATE cron_jobs
            SET state = 'running', updatedAt = ?
            WHERE id = ?
              AND state = 'scheduled'
            `
          )
          .run(updatedAt, row.id)

        if (result.changes > 0) {
          claimed.push(
            rowToCronJob({
              ...row,
              state: 'running',
              updatedAt
            })
          )
        }
      }

      return claimed
    })

    return transaction(now, limit)
  }

  claimJob(jobId: string, now: number): CronJob {
    const transaction = this.db.transaction((targetJobId: string, currentTime: number) => {
      const row = this.db
        .prepare(
          `
          SELECT *
          FROM cron_jobs
          WHERE id = ?
          `
        )
        .get(targetJobId) as CronJobRow | undefined

      if (!row) {
        throw new Error(`Cron job not found: ${targetJobId}`)
      }

      if (row.state === 'running') {
        throw new Error(`Cron job is already running: ${targetJobId}`)
      }

      this.db
        .prepare(
          `
          UPDATE cron_jobs
          SET state = 'running', updatedAt = ?
          WHERE id = ?
          `
        )
        .run(currentTime, targetJobId)

      return rowToCronJob({
        ...row,
        state: 'running',
        updatedAt: currentTime
      })
    })

    return transaction(jobId, now)
  }

  countRunningJobs(): number {
    const row = this.db
      .prepare(
        `
        SELECT COUNT(*) as count
        FROM cron_jobs
        WHERE state = 'running'
        `
      )
      .get() as { count: number }

    return row.count
  }
}
