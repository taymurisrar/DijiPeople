import {
  DEFAULT_POOL_CONNECTION_TIMEOUT_MS,
  resolvePoolBounds,
} from './pool-config';

describe('resolvePoolBounds', () => {
  it('bounds the connect wait by default and leaves everything else unset', () => {
    expect(resolvePoolBounds({})).toEqual({
      connectionTimeoutMillis: DEFAULT_POOL_CONNECTION_TIMEOUT_MS,
    });
  });

  it('never defaults a statement timeout (it would kill long payroll/import work)', () => {
    expect(resolvePoolBounds({}).statement_timeout).toBeUndefined();
  });

  it('honours explicit positive integers', () => {
    expect(
      resolvePoolBounds({
        DATABASE_POOL_CONNECTION_TIMEOUT_MS: '5000',
        DATABASE_POOL_MAX: '20',
        DATABASE_POOL_IDLE_TIMEOUT_MS: '30000',
        DATABASE_STATEMENT_TIMEOUT_MS: '60000',
      }),
    ).toEqual({
      connectionTimeoutMillis: 5000,
      max: 20,
      idleTimeoutMillis: 30000,
      statement_timeout: 60000,
    });
  });

  it.each(['0', '-5', 'abc', '', '  ', 'NaN'])(
    'falls back for the unusable value %p',
    (raw) => {
      expect(
        resolvePoolBounds({
          DATABASE_POOL_CONNECTION_TIMEOUT_MS: raw,
          DATABASE_POOL_MAX: raw,
        }),
      ).toEqual({
        connectionTimeoutMillis: DEFAULT_POOL_CONNECTION_TIMEOUT_MS,
      });
    },
  );

  it('truncates fractions', () => {
    expect(resolvePoolBounds({ DATABASE_POOL_MAX: '12.9' }).max).toBe(12);
  });
});
