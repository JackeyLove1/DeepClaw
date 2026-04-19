type ConsoleLogMethod = (...data: unknown[]) => void

export interface ConsoleLogger {
  debug: ConsoleLogMethod
  error: ConsoleLogMethod
  info: ConsoleLogMethod
  log: ConsoleLogMethod
  warn: ConsoleLogMethod
}

export const bindConsoleToLogger = (logger: ConsoleLogger): void => {
  console.debug = (...data: unknown[]) => logger.debug(...data)
  console.error = (...data: unknown[]) => logger.error(...data)
  console.info = (...data: unknown[]) => logger.info(...data)
  console.log = (...data: unknown[]) => logger.log(...data)
  console.warn = (...data: unknown[]) => logger.warn(...data)
}
