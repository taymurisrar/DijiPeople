import { resolveLogLevels } from './log-level';

/*
 * LOG_LEVEL=info silently logged nothing.
 *
 * Nest calls the ordinary informational level `log`; every other logging
 * ecosystem calls it `info`, so `info` is what an operator types. It was not on
 * the ladder, `indexOf` returned -1, the branch was skipped and it fell through
 * to the production default of ['error','warn'] — with no message anywhere.
 *
 * The live API carried `LOG_LEVEL=info`. Every `logger.log()` in the service was
 * therefore discarded, including the console email provider's record of each
 * message it swallowed, which is a large part of why a tenant that could not
 * send email went unnoticed. Measured over three windows of production logs:
 * 100 lines 08:00–09:30 UTC, zero at LOG level.
 */

const PROD = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;

describe('resolveLogLevels', () => {
  it("treats info as Nest's log level rather than ignoring it", () => {
    const warn = jest.fn();

    const levels = resolveLogLevels({ ...PROD, LOG_LEVEL: 'info' }, warn);

    // The defect: this returned ['error','warn'] and said nothing.
    expect(levels).toEqual(['error', 'warn', 'log']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('says so when the value is not a level it knows', () => {
    const warn = jest.fn();

    const levels = resolveLogLevels({ ...PROD, LOG_LEVEL: 'chatty' }, warn);

    // Still falls back rather than silencing anything — the defect was never
    // the fallback, it was that nothing said the value had been discarded.
    expect(levels).toEqual(['error', 'warn']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('chatty');
    // Naming what it would have accepted is the whole point of the message.
    expect(warn.mock.calls[0][0]).toContain('verbose');
  });

  it('expands a recognised level down the ladder', () => {
    expect(
      resolveLogLevels({ ...PROD, LOG_LEVEL: 'debug' }, jest.fn()),
    ).toEqual(['error', 'warn', 'log', 'debug']);
  });

  it('lets LOG_LEVEL=error drop warnings, which is what asking for errors means', () => {
    expect(
      resolveLogLevels({ ...PROD, LOG_LEVEL: 'error' }, jest.fn()),
    ).toEqual(['error']);
  });

  it('is quiet when nothing is configured', () => {
    const warn = jest.fn();

    expect(resolveLogLevels(PROD, warn)).toEqual(['error', 'warn']);
    expect(resolveLogLevels({} as NodeJS.ProcessEnv, warn)).toEqual([
      'error',
      'warn',
      'log',
    ]);
    // An unset variable is not a mistake and must not produce a warning.
    expect(warn).not.toHaveBeenCalled();
  });
});
