/** Простой структурированный логгер: JSON-строки в stdout (их собирают Railway/Render). */
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minLevel: Level = (process.env.LOG_LEVEL as Level) || 'info';
const pretty = process.env.NODE_ENV !== 'production';
const silent = process.env.NODE_ENV === 'test' && !process.env.LOG_IN_TESTS;

export function setLogLevel(l: Level) {
  minLevel = l;
}

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (silent || ORDER[level] < ORDER[minLevel]) return;
  const line = pretty
    ? `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}`
    : JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => log('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => log('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => log('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => log('error', m, meta),
};
