import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import { resolveLogsDir } from '../agent/utils'

export const LOG_MAX_SIZE_BYTES = 5 * 1024 * 1024
export const LOG_MAX_FILES = 10

const ARCHIVED_LOG_PATTERN = /-\d{8}T\d{6}\.\d{3}Z(?:-\d+)?\.log$/i

interface LogPathMessage {
  variables?: {
    processType?: string
  }
}

const pad = (value: number, width = 2): string => value.toString(10).padStart(width, '0')

const sanitizeProcessType = (processType?: string): string => {
  if (!processType) {
    return 'main'
  }

  const normalized = processType.trim().toLowerCase()
  switch (normalized) {
    case 'browser':
    case 'main':
      return 'main'
    default:
      return normalized.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'main'
  }
}

export const resolveProcessLogFileName = (processType?: string): string =>
  `${sanitizeProcessType(processType)}.log`

export const resolveManagedLogPath = (
  message?: LogPathMessage,
  logsDir = resolveLogsDir()
): string => {
  mkdirSync(logsDir, { recursive: true })
  const processType =
    typeof message?.variables?.processType === 'string' ? message.variables.processType : undefined
  return path.join(logsDir, resolveProcessLogFileName(processType))
}

export const formatArchiveTimestamp = (date = new Date()): string =>
  [
    date.getUTCFullYear().toString(10),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate())
  ].join('') +
  `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}Z`

const isManagedLogFileName = (fileName: string): boolean => fileName.endsWith('.log')

const isArchivedLogFileName = (fileName: string): boolean => ARCHIVED_LOG_PATTERN.test(fileName)

const listManagedLogFiles = (logsDir: string): string[] => {
  if (!existsSync(logsDir)) {
    return []
  }

  return readdirSync(logsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isManagedLogFileName(entry.name))
    .map((entry) => entry.name)
}

const pruneArchivedLogFiles = (logsDir: string, maxFiles = LOG_MAX_FILES): void => {
  const allLogFiles = listManagedLogFiles(logsDir)
  const removableCount = allLogFiles.length - maxFiles
  if (removableCount <= 0) {
    return
  }

  const archivedFiles = allLogFiles.filter(isArchivedLogFileName).sort((left, right) =>
    left.localeCompare(right)
  )

  for (const fileName of archivedFiles.slice(0, removableCount)) {
    rmSync(path.join(logsDir, fileName), { force: true })
  }
}

export const archiveLogFile = (
  currentLogPath: string,
  options?: {
    logsDir?: string
    maxFiles?: number
    now?: Date
  }
): string => {
  const logsDir = options?.logsDir ?? path.dirname(currentLogPath)
  const maxFiles = options?.maxFiles ?? LOG_MAX_FILES
  const timestamp = formatArchiveTimestamp(options?.now)
  const parsedPath = path.parse(currentLogPath)

  mkdirSync(logsDir, { recursive: true })

  let archiveFileName = `${parsedPath.name}-${timestamp}${parsedPath.ext}`
  let archivePath = path.join(logsDir, archiveFileName)
  let suffix = 1

  while (existsSync(archivePath)) {
    archiveFileName = `${parsedPath.name}-${timestamp}-${suffix}${parsedPath.ext}`
    archivePath = path.join(logsDir, archiveFileName)
    suffix += 1
  }

  renameSync(currentLogPath, archivePath)
  pruneArchivedLogFiles(logsDir, maxFiles)

  return archivePath
}
