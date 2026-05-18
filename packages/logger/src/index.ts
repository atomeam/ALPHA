export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  level: LogLevel;
  message: string;
  service: string;
  timestamp: string;
  fields?: Record<string, string | number | boolean | null>;
}

export interface Logger {
  event: (message: string, fields?: LogEvent['fields']) => LogEvent;
  warn: (message: string, fields?: LogEvent['fields']) => LogEvent;
  error: (message: string, fields?: LogEvent['fields']) => LogEvent;
}

function emit(event: LogEvent): LogEvent {
  const payload = JSON.stringify(event);
  if (event.level === 'error') {
    console.error(payload);
  } else if (event.level === 'warn') {
    console.warn(payload);
  } else {
    console.log(payload);
  }
  return event;
}

export function createLogger(service: string): Logger {
  const log = (level: LogLevel, message: string, fields?: LogEvent['fields']): LogEvent =>
    emit({ level, message, service, timestamp: new Date().toISOString(), fields });

  return {
    event: (message, fields) => log('info', message, fields),
    warn: (message, fields) => log('warn', message, fields),
    error: (message, fields) => log('error', message, fields),
  };
}
