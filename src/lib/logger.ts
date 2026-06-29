// src/lib/logger.ts
// Structured logger for API routes — replaces raw console.error/warn calls.
// Outputs JSON in production for log aggregation (Vercel, Datadog, etc).
// Falls back to human-readable format in development.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  /** Route or module name */
  context?: string;
  /** Request ID for tracing */
  requestId?: string;
  /** Structured metadata */
  meta?: Record<string, unknown>;
  /** Error stack if applicable */
  stack?: string;
}

const IS_PROD = process.env.NODE_ENV === 'production';

function formatEntry(entry: LogEntry): string {
  if (IS_PROD) {
    return JSON.stringify(entry);
  }
  // Dev: human-readable
  const prefix = `[${entry.level.toUpperCase()}]`;
  const ctx = entry.context ? ` (${entry.context})` : '';
  const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
  return `${prefix}${ctx} ${entry.message}${meta}`;
}

function log(level: LogLevel, message: string, opts?: { context?: string; meta?: Record<string, unknown>; error?: unknown }) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context: opts?.context,
    meta: opts?.meta,
  };

  if (opts?.error instanceof Error) {
    entry.stack = opts.error.stack;
    entry.meta = { ...entry.meta, errorName: opts.error.name, errorMessage: opts.error.message };
  }

  const formatted = formatEntry(entry);

  switch (level) {
    case 'debug':
      if (!IS_PROD) console.debug(formatted);
      break;
    case 'info':
      console.info(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

/** Structured logger — use instead of raw console.error/warn in API routes */
export const logger = {
  debug: (message: string, opts?: { context?: string; meta?: Record<string, unknown> }) =>
    log('debug', message, opts),
  info: (message: string, opts?: { context?: string; meta?: Record<string, unknown> }) =>
    log('info', message, opts),
  warn: (message: string, opts?: { context?: string; meta?: Record<string, unknown>; error?: unknown }) =>
    log('warn', message, opts),
  error: (message: string, opts?: { context?: string; meta?: Record<string, unknown>; error?: unknown }) =>
    log('error', message, opts),
};
