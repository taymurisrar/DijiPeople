import { LogLevel } from '@nestjs/common';

/*
 * LOG_LEVEL existed in .env for a long time and was read by nothing. Now that
 * it controls output, the risk is a value that accidentally silences errors,
 * so these pin the two guarantees: the ladder is inclusive, and error and warn
 * survive every setting.
 */

const LOG_LEVEL_LADDER: LogLevel[] = [
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

function resolveLogLevels(env: NodeJS.ProcessEnv): LogLevel[] {
  const configured = env.LOG_LEVEL?.trim().toLowerCase();
  const threshold = LOG_LEVEL_LADDER.indexOf(configured as LogLevel);

  if (configured && threshold !== -1) {
    return LOG_LEVEL_LADDER.slice(0, threshold + 1);
  }

  return env.NODE_ENV === 'production'
    ? ['error', 'warn']
    : ['error', 'warn', 'log'];
}

describe('log level resolution', () => {
  it('treats LOG_LEVEL as a threshold, not an exact level', () => {
    expect(
      resolveLogLevels({ LOG_LEVEL: 'debug' } as NodeJS.ProcessEnv),
    ).toEqual(['error', 'warn', 'log', 'debug']);
  });

  it('never silences errors, whatever is configured', () => {
    for (const level of [...LOG_LEVEL_LADDER, 'nonsense', '']) {
      const levels = resolveLogLevels({
        LOG_LEVEL: level,
      } as NodeJS.ProcessEnv);
      expect(levels).toContain('error');
    }
  });

  it('drops warnings only when errors are asked for explicitly', () => {
    expect(
      resolveLogLevels({ LOG_LEVEL: 'error' } as NodeJS.ProcessEnv),
    ).toEqual(['error']);
    expect(
      resolveLogLevels({ LOG_LEVEL: 'warn' } as NodeJS.ProcessEnv),
    ).toEqual(['error', 'warn']);
  });

  it('drops route-mapping noise in production by default', () => {
    expect(
      resolveLogLevels({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toEqual(['error', 'warn']);
  });

  it('keeps log level outside production by default', () => {
    expect(resolveLogLevels({} as NodeJS.ProcessEnv)).toEqual([
      'error',
      'warn',
      'log',
    ]);
  });

  it('ignores an unrecognised value rather than logging nothing', () => {
    expect(
      resolveLogLevels({ LOG_LEVEL: 'chatty' } as NodeJS.ProcessEnv),
    ).toEqual(['error', 'warn', 'log']);
  });
});
