import pino from "pino"

// Canonical logger instance
export const log = pino({
  level: process.env.LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
})

export interface LogContext {
  traceId: string
  spanId?: string
  userId?: string
}

/**
 * Creates a correlated child logger bound to a unique generation transaction.
 */
export function createTraceLogger(context: LogContext) {
  return log.child({
    traceId: context.traceId,
    ...(context.spanId && { spanId: context.spanId }),
    ...(context.userId && { userId: context.userId }),
  })
}

export * from "./ledger"