import type { CronRunTriggerKind } from '@shared/types'
import type { CronJob } from './types'
import type { CronService } from './service'

type CronSchedulerOptions = {
  tickMs?: number
  maxConcurrency?: number
  now?: () => number
}

export class CronScheduler {
  private readonly service: CronService

  private readonly tickMs: number

  private readonly maxConcurrency: number

  private readonly now: () => number

  private intervalId: NodeJS.Timeout | null = null

  private activeRuns = 0

  private draining = false

  constructor(service: CronService, options: CronSchedulerOptions = {}) {
    this.service = service
    this.tickMs = options.tickMs ?? 30_000
    this.maxConcurrency = options.maxConcurrency ?? 2
    this.now = options.now ?? (() => Date.now())
  }

  start(): void {
    if (this.intervalId) {
      return
    }

    this.intervalId = setInterval(() => {
      void this.drain()
    }, this.tickMs)
    void this.drain()
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  notifyResume(): void {
    void this.drain()
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return
    }

    this.draining = true
    try {
      while (this.activeRuns < this.maxConcurrency) {
        const freeSlots = this.maxConcurrency - this.activeRuns
        const claimedJobs = this.service.claimDueJobs(freeSlots)
        if (claimedJobs.length === 0) {
          break
        }

        for (const job of claimedJobs) {
          this.activeRuns += 1
          const triggerKind = this.resolveTriggerKind(job)
          void this.service.executeClaimedJob(job, triggerKind).finally(() => {
            this.activeRuns = Math.max(0, this.activeRuns - 1)
            void this.drain()
          })
        }
      }
    } finally {
      this.draining = false
    }
  }

  private resolveTriggerKind(job: CronJob): CronRunTriggerKind {
    const nextRunAt = job.nextRunAt
    if (nextRunAt != null && this.now() - nextRunAt > this.tickMs) {
      return 'recovered'
    }

    return 'scheduled'
  }
}
