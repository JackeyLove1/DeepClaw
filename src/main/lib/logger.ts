import log from 'electron-log/main'
import { bindConsoleToLogger } from '@shared/logging'
import { archiveLogFile, LOG_MAX_FILES, LOG_MAX_SIZE_BYTES, resolveManagedLogPath } from './logging'

let isMainLoggerConfigured = false

export const configureMainProcessLogging = (): void => {
  if (isMainLoggerConfigured) {
    return
  }

  log.transports.file.maxSize = LOG_MAX_SIZE_BYTES
  log.transports.file.resolvePathFn = (_variables, message) => resolveManagedLogPath(message)
  log.transports.file.archiveLogFn = (oldLogFile) => {
    archiveLogFile(oldLogFile.path, { maxFiles: LOG_MAX_FILES })
  }

  bindConsoleToLogger(log)

  isMainLoggerConfigured = true
}
