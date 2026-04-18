import type {
  CronDeliverTarget,
  CronJob,
  CronJobState,
  CronMisfirePolicy,
  CronRun,
  CronRunStatus,
  CronRunTriggerKind,
  CronScheduleKind,
  CreateCronJobInput,
  UpdateCronJobInput
} from '@shared/types'

export type {
  CronDeliverTarget,
  CronJob,
  CronJobState,
  CronMisfirePolicy,
  CronRun,
  CronRunStatus,
  CronRunTriggerKind,
  CronScheduleKind,
  CreateCronJobInput,
  UpdateCronJobInput
}

export interface ExecuteCronJobResult {
  outputText: string
  status: Exclude<CronRunStatus, 'running'>
  model: string | null
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  errorText: string | null
}

export type OriginSessionPublisher = (
  sessionId: string,
  payload: {
    job: CronJob
    run: CronRun
    text: string
    status: 'success' | 'error'
  }
) => Promise<void>
