import type { CronJob, CronScheduleKind } from './types'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

type ParsedCronField = {
  any: boolean
  values: Set<number>
}

type CronFields = {
  minute: ParsedCronField
  hour: ParsedCronField
  dayOfMonth: ParsedCronField
  month: ParsedCronField
  dayOfWeek: ParsedCronField
}

type ZonedDateParts = {
  minute: number
  hour: number
  dayOfMonth: number
  month: number
  dayOfWeek: number
}

const DURATION_UNITS: Record<string, number> = {
  m: MINUTE_MS,
  h: HOUR_MS,
  d: DAY_MS
}

const asInt = (value: string): number => Number.parseInt(value, 10)

const parseDuration = (value: string): number | null => {
  const match = value.trim().match(/^(\d+)\s*([mhd])$/i)
  if (!match) {
    return null
  }

  const amount = asInt(match[1])
  const unit = match[2].toLowerCase()
  const multiplier = DURATION_UNITS[unit]
  if (!Number.isFinite(amount) || amount <= 0 || !multiplier) {
    return null
  }

  return amount * multiplier
}

const parseInterval = (value: string): number | null => {
  const match = value.trim().match(/^every\s+(\d+)\s*([mhd])$/i)
  if (!match) {
    return null
  }

  return parseDuration(`${match[1]}${match[2]}`)
}

const isIsoTimestamp = (value: string): boolean => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && value.includes('T')
}

const parseCronField = (value: string, min: number, max: number): ParsedCronField => {
  const trimmed = value.trim()
  if (trimmed === '*') {
    return { any: true, values: new Set<number>() }
  }

  const values = new Set<number>()
  for (const segment of trimmed.split(',')) {
    const part = segment.trim()
    if (!part) {
      throw new Error(`Invalid cron segment: "${value}"`)
    }

    if (part.includes('/')) {
      const [rangeValue, stepValue] = part.split('/')
      const step = asInt(stepValue)
      if (!Number.isFinite(step) || step <= 0) {
        throw new Error(`Invalid cron step: "${part}"`)
      }

      const [rangeStart, rangeEnd] =
        rangeValue === '*'
          ? [min, max]
          : (() => {
              const [startRaw, endRaw] = rangeValue.split('-')
              const start = asInt(startRaw)
              const end = asInt(endRaw)
              return [start, end]
            })()

      if (
        !Number.isFinite(rangeStart) ||
        !Number.isFinite(rangeEnd) ||
        rangeStart < min ||
        rangeEnd > max ||
        rangeStart > rangeEnd
      ) {
        throw new Error(`Invalid cron range: "${part}"`)
      }

      for (let current = rangeStart; current <= rangeEnd; current += step) {
        values.add(current)
      }
      continue
    }

    if (part.includes('-')) {
      const [startRaw, endRaw] = part.split('-')
      const start = asInt(startRaw)
      const end = asInt(endRaw)
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < min ||
        end > max ||
        start > end
      ) {
        throw new Error(`Invalid cron range: "${part}"`)
      }

      for (let current = start; current <= end; current += 1) {
        values.add(current)
      }
      continue
    }

    const numeric = asInt(part)
    if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
      throw new Error(`Invalid cron value: "${part}"`)
    }
    values.add(numeric)
  }

  return { any: false, values }
}

const parseCronExpression = (value: string): CronFields => {
  const fields = value
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (fields.length !== 5) {
    throw new Error('Cron expression must contain exactly 5 fields.')
  }

  return {
    minute: parseCronField(fields[0], 0, 59),
    hour: parseCronField(fields[1], 0, 23),
    dayOfMonth: parseCronField(fields[2], 1, 31),
    month: parseCronField(fields[3], 1, 12),
    dayOfWeek: parseCronField(fields[4], 0, 6)
  }
}

const matchesCronField = (field: ParsedCronField, value: number): boolean =>
  field.any || field.values.has(value)

const getTimeZone = (timezone?: string | null): string =>
  timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

const getZonedDateParts = (date: Date, timezone?: string | null): ZonedDateParts => {
  const resolvedTimeZone = getTimeZone(timezone)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimeZone,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })

  const parts = formatter.formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''
  const weekday = read('weekday').toLowerCase()
  const dayOfWeekMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6
  }

  return {
    minute: asInt(read('minute')),
    hour: asInt(read('hour')),
    dayOfMonth: asInt(read('day')),
    month: asInt(read('month')),
    dayOfWeek: dayOfWeekMap[weekday] ?? 0
  }
}

export const detectScheduleKind = (schedule: string): CronScheduleKind => {
  const trimmed = schedule.trim()
  if (!trimmed) {
    throw new Error('Schedule cannot be empty.')
  }

  if (parseDuration(trimmed) != null) {
    return 'delay'
  }

  if (parseInterval(trimmed) != null) {
    return 'interval'
  }

  if (isIsoTimestamp(trimmed)) {
    return 'datetime'
  }

  parseCronExpression(trimmed)
  return 'cron'
}

export const assertValidTimeZone = (timezone?: string | null): string | null => {
  if (timezone == null || !timezone.trim()) {
    return null
  }

  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
    return timezone
  } catch {
    throw new Error(`Invalid timezone: ${timezone}`)
  }
}

export const resolveMaxRuns = (
  scheduleKind: CronScheduleKind,
  maxRuns?: number | null
): number | null => {
  if (maxRuns != null) {
    if (!Number.isInteger(maxRuns) || maxRuns <= 0) {
      throw new Error('maxRuns must be a positive integer when provided.')
    }
    return maxRuns
  }

  return scheduleKind === 'delay' || scheduleKind === 'datetime' ? 1 : null
}

export const computeNextRunAt = ({
  schedule,
  scheduleKind,
  timezone,
  fromTime,
  runCount,
  maxRuns
}: Pick<CronJob, 'schedule' | 'scheduleKind' | 'timezone' | 'runCount' | 'maxRuns'> & {
  fromTime: number
}): number | null => {
  if (maxRuns != null && runCount >= maxRuns) {
    return null
  }

  if (scheduleKind === 'delay') {
    const durationMs = parseDuration(schedule)
    if (durationMs == null) {
      throw new Error(`Invalid relative delay schedule: ${schedule}`)
    }
    return fromTime + durationMs
  }

  if (scheduleKind === 'interval') {
    const intervalMs = parseInterval(schedule)
    if (intervalMs == null) {
      throw new Error(`Invalid interval schedule: ${schedule}`)
    }
    return fromTime + intervalMs
  }

  if (scheduleKind === 'datetime') {
    const timestamp = new Date(schedule).getTime()
    if (!Number.isFinite(timestamp)) {
      throw new Error(`Invalid ISO datetime schedule: ${schedule}`)
    }
    return timestamp
  }

  const cron = parseCronExpression(schedule)
  const baseline = new Date(Math.floor(fromTime / MINUTE_MS) * MINUTE_MS)
  for (let step = 1; step <= 366 * 24 * 60; step += 1) {
    const candidate = new Date(baseline.getTime() + step * MINUTE_MS)
    const zoned = getZonedDateParts(candidate, timezone)
    if (
      matchesCronField(cron.minute, zoned.minute) &&
      matchesCronField(cron.hour, zoned.hour) &&
      matchesCronField(cron.dayOfMonth, zoned.dayOfMonth) &&
      matchesCronField(cron.month, zoned.month) &&
      matchesCronField(cron.dayOfWeek, zoned.dayOfWeek)
    ) {
      return candidate.getTime()
    }
  }

  throw new Error(`Unable to resolve next cron execution within one year: ${schedule}`)
}
