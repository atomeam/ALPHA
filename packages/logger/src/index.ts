// Alpha v0 — Structured event logger.
// All integration calls, grant checks, and loop events emit through this interface.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  level: LogLevel;
  event: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface Logger {
  emit(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
}

export function createLogger(service: string): Logger {
  function write(level: LogLevel, event: string, data?: Record<string, unknown>): void {
    const entry: LogEvent = {
      level,
      event,
      timestamp: new Date().toISOString(),
      data: { service, ...data },
    };
    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    emit: (event, data) => write('info', event, data),
    info: (event, data) => write('info', event, data),
    warn: (event, data) => write('warn', event, data),
    error: (event, data) => write('error', event, data),
  };
}
