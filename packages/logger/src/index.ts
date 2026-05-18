// Structured event logger — NDJSON.
// One log line per event. No background flushing, no buffering, no telemetry pollers.
// Callers route the line to wherever they want (stdout, file, network) via the `sink`.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEvent {
  level: LogLevel;
  event: string;
  message?: string;
  // Caller-supplied structured fields. Avoid putting Grant or scope material here in plaintext.
  [key: string]: unknown;
}

export interface LoggerOptions {
  service: string;
  minLevel?: LogLevel;
  sink?: (line: string) => void;
  now?: () => Date;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug: (event: string, fields?: Record<string, unknown>) => void;
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
  /** Lower-level: emit an event with an explicit level. */
  event: (level: LogLevel, event: string, fields?: Record<string, unknown>) => void;
}

export function createLogger(options: LoggerOptions): Logger {
  const minLevel = options.minLevel ?? 'info';
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? (() => new Date());

  function emit(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const line: LogEvent & { ts: string; service: string } = {
      ts: now().toISOString(),
      service: options.service,
      level,
      event,
      ...fields,
    };
    sink(JSON.stringify(line));
  }

  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
    event: (level, event, fields) => emit(level, event, fields),
  };
}

function defaultSink(line: string): void {
  console.log(line);
}
