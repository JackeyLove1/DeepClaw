import type { CronService } from './service'

let cronService: CronService | null = null

export const setCronService = (service: CronService): void => {
  cronService = service
}

export const getCronService = (): CronService => {
  if (!cronService) {
    throw new Error('Cron service is not initialized.')
  }

  return cronService
}
