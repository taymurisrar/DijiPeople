import type { LogLevel } from '@nestjs/common';

/*
 * Nest's default level logs every mapped route at boot, which buries real
 * warnings under several hundred lines. Development keeps them for orientation;
 * production keeps only what someone would act on.
 *
 * LOG_LEVEL names the *lowest* severity to show, the way it usually reads
 * elsewhere: LOG_LEVEL=debug means "debug and everything more serious", not
 * "debug only". Nest wants the explicit list, so the ladder is expanded here.
 *
 * Errors are always included, since the ladder starts there and every setting
 * keeps its head. Setting LOG_LEVEL=error does drop warnings, which is what
 * asking for errors only should do; an unset or unrecognised value falls back
 * to the environment default rather than silencing anything.
 *
 * This lives in its own module rather than in `main.ts` because `main.ts` calls
 * `bootstrap()` at import time — importing it from a test starts the whole Nest
 * application and tries to open a database connection.
 */
export const LOG_LEVEL_LADDER: LogLevel[] = [
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

/*
 * Nest calls the ordinary informational level `log`. Every other logging
 * ecosystem — syslog, bunyan, pino, winston, .NET, Python — calls it `info`, so
 * `info` is the natural thing for an operator to type.
 *
 * The live API was set to `LOG_LEVEL=info`. `info` is not on the ladder, so
 * `indexOf` returned -1, the branch was skipped, and it fell through to the
 * production default of ['error','warn'] — silently. Every `logger.log()` in
 * the service was discarded, including the console email provider's record of
 * each message it swallowed, which is a large part of why a workspace that
 * could not send email went unnoticed for as long as it did.
 *
 * `info` is accepted as an alias rather than rejected: the operator's intent
 * was unambiguous, and refusing it would only move the surprise.
 */
export const LOG_LEVEL_ALIASES: Readonly<Record<string, LogLevel>> = {
  info: 'log',
  warning: 'warn',
  trace: 'verbose',
};

export function resolveLogLevels(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = (message) => console.warn(message),
): LogLevel[] {
  const configured = env.LOG_LEVEL?.trim().toLowerCase();
  const resolved = configured
    ? (LOG_LEVEL_ALIASES[configured] ?? configured)
    : configured;
  const threshold = LOG_LEVEL_LADDER.indexOf(resolved as LogLevel);

  if (configured && threshold === -1) {
    /*
     * The defect was never the fallback, it was the silence. An unrecognised
     * value still falls back rather than silencing anything, and now says so,
     * naming what it would have accepted.
     */
    warn(
      `LOG_LEVEL="${configured}" is not a recognised level and was ignored. ` +
        `Accepted values: ${LOG_LEVEL_LADDER.join(', ')} ` +
        `(aliases: ${Object.keys(LOG_LEVEL_ALIASES).join(', ')}).`,
    );
  }

  if (configured && threshold !== -1) {
    return LOG_LEVEL_LADDER.slice(0, threshold + 1);
  }

  return env.NODE_ENV === 'production'
    ? ['error', 'warn']
    : ['error', 'warn', 'log'];
}
