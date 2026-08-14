/**
 * Small structured logger for the POC.
 *
 * Deliberately dependency-free and deliberately not the API's Nest logger —
 * this tool is isolated from the monorepo workspaces and must run standalone.
 *
 * Two rules this logger enforces:
 *  1. Secret-ish fields are redacted, so a non-zero Comm Key can never reach a log line.
 *  2. Nothing dumps a raw transport object; callers pass explicit scalar fields.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogFormat = 'pretty' | 'json';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/** Field names whose values are never printed, whatever the caller passes. */
const REDACTED_KEYS = new Set([
  'commkey',
  'comm_key',
  'commKey'.toLowerCase(),
  'password',
  'pwd',
  'pin',
  'secret',
  'token',
  'authkey',
]);

export type LogFields = Record<string, unknown>;

/**
 * stdout/stderr are captured up front so that the console shim installed by
 * `captureLibraryConsole` can never make the logger recurse into itself.
 */
const stdout = process.stdout;
const stderr = process.stderr;

export interface Logger {
  readonly level: LogLevel;
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  /** Human-facing report output — never JSON-wrapped, never level-filtered. */
  print(line?: string): void;
}

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : value;
  }
  return out;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return /[\s"]/.test(value) ? JSON.stringify(value) : value;
  if (value instanceof Date) return value.toISOString();
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(
    now.getMilliseconds(),
    3,
  )}`;
}

export function createLogger(options: { level: LogLevel; format: LogFormat }): Logger {
  const threshold = LEVEL_WEIGHT[options.level];

  const emit = (level: Exclude<LogLevel, 'silent'>, event: string, fields?: LogFields): void => {
    if (LEVEL_WEIGHT[level] < threshold) return;
    const safe = redact(fields ?? {});
    const stream = level === 'error' || level === 'warn' ? stderr : stdout;

    if (options.format === 'json') {
      stream.write(
        `${JSON.stringify({ ts: new Date().toISOString(), level, event, ...safe })}\n`,
      );
      return;
    }

    const pairs = Object.entries(safe)
      .map(([key, value]) => `${key}=${formatValue(value)}`)
      .join(' ');
    stream.write(`${timestamp()} ${level.toUpperCase().padEnd(5)} ${event}${pairs ? ` ${pairs}` : ''}\n`);
  };

  return {
    level: options.level,
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
    print: (line = '') => stdout.write(`${line}\n`),
  };
}

/**
 * `zkteco-js` writes directly to `console.log` / `console.error` on almost every
 * code path. Routing those through the logger at debug level keeps the POC's own
 * report readable while still preserving the transport's diagnostics when
 * `ZK_LOG_LEVEL=debug` is set.
 *
 * Returns a restore function.
 */
export function captureLibraryConsole(logger: Logger): () => void {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  const forward = (...args: unknown[]): void => {
    const message = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ')
      .trim();
    if (message) logger.debug('transport.console', { message });
  };

  console.log = forward;
  console.info = forward;
  console.warn = forward;
  console.error = forward;
  console.debug = forward;

  return () => {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
    console.debug = original.debug;
  };
}
