import { describe, expect, it } from 'vitest'
import { computeNextRunAt, detectScheduleKind, resolveMaxRuns } from './schedule'

describe('cron schedule helpers', () => {
  it('detects supported schedule kinds', () => {
    expect(detectScheduleKind('30m')).toBe('delay')
    expect(detectScheduleKind('every 2h')).toBe('interval')
    expect(detectScheduleKind('0 9 * * *')).toBe('cron')
    expect(detectScheduleKind('2026-04-18T09:00:00Z')).toBe('datetime')
  })

  it('computes the next cron occurrence in a given timezone', () => {
    const fromTime = Date.UTC(2026, 3, 18, 8, 7, 0)
    const nextRunAt = computeNextRunAt({
      schedule: '*/15 * * * *',
      scheduleKind: 'cron',
      timezone: 'UTC',
      fromTime,
      runCount: 0,
      maxRuns: null
    })

    expect(nextRunAt).toBe(Date.UTC(2026, 3, 18, 8, 15, 0))
  })

  it('defaults one-shot schedules to a single run', () => {
    expect(resolveMaxRuns('delay', undefined)).toBe(1)
    expect(resolveMaxRuns('datetime', undefined)).toBe(1)
    expect(resolveMaxRuns('interval', undefined)).toBeNull()
  })
})
