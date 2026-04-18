import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CronJob } from '@shared/types'
import { ensureChatSchema } from '../../chat/sqlite-schema'
import { CronRepository } from './repository'
import { CronService } from './service'
import type { ExecuteCronJobResult } from './types'

class StubExecutor {
  constructor(private readonly result: ExecuteCronJobResult) {}

  async execute(_job: CronJob): Promise<ExecuteCronJobResult> {
    return this.result
  }

  toPreview(text: string): string {
    return text.slice(0, 240)
  }
}

const cleanupPaths: string[] = []

afterEach(() => {
  for (const target of cleanupPaths.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true })
  }
})

const createService = (options: {
  now?: () => number
  result?: ExecuteCronJobResult
  publisher?: Parameters<CronService['setOriginSessionPublisher']>[0]
}) => {
  const database = new Database(':memory:')
  ensureChatSchema(database)
  const repository = new CronRepository(database)
  const outputRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notemark-cron-'))
  cleanupPaths.push(outputRootDir)

  return {
    database,
    service: new CronService({
      repository,
      now: options.now,
      executor: new StubExecutor(
        options.result ?? {
          outputText: 'ok',
          status: 'success',
          model: 'test-model',
          inputTokens: 10,
          outputTokens: 4,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          errorText: null
        }
      ),
      outputRootDir,
      originSessionPublisher: options.publisher
    })
  }
}

describe('CronService', () => {
  it('creates and runs a one-shot local-file cron job', async () => {
    const nowValues = [1_000, 2_000, 3_000, 4_000]
    const { database, service } = createService({
      now: () => nowValues.shift() ?? 5_000
    })

    const job = await service.createJob({
      name: 'Daily note',
      prompt: 'Write a summary',
      schedule: '30m',
      deliver: 'local_file'
    })

    const run = await service.runJob(job.id)
    const jobs = await service.listJobs()
    const runs = await service.listRuns(10)

    expect(run.status).toBe('success')
    expect(run.outputPath).toBeTruthy()
    expect(fs.existsSync(run.outputPath!)).toBe(true)
    expect(fs.readFileSync(run.outputPath!, 'utf8')).toContain('Cron Job: Daily note')
    expect(jobs[0]?.state).toBe('completed')
    expect(jobs[0]?.runCount).toBe(1)
    expect(runs[0]?.id).toBe(run.id)

    database.close()
  })

  it('delivers to the origin session when a source session id exists', async () => {
    const deliveries: Array<{ sessionId: string; text: string; runId: string }> = []
    const { database, service } = createService({
      now: () => 10_000,
      publisher: async (sessionId, payload) => {
        deliveries.push({
          sessionId,
          text: payload.text,
          runId: payload.run.id
        })
      }
    })

    const job = await service.createJob({
      name: 'Chat follow-up',
      prompt: 'Summarize the queue',
      schedule: 'every 2h',
      sourceSessionId: 'session-1'
    })
    const run = await service.runJob(job.id)

    expect(job.deliver).toBe('origin_session')
    expect(run.outputPath).toBeNull()
    expect(deliveries).toHaveLength(1)
    expect(deliveries[0]).toMatchObject({
      sessionId: 'session-1',
      text: 'Cron Job: Chat follow-up\n\nok',
      runId: run.id
    })

    database.close()
  })
})
