import { PLATFORM_CURRENCY_CODES } from '@repo/config';
import {
  assertCurrencyEnabled,
  assertValidEnabledCurrencies,
  describeEnabledCurrencies,
  resolveEnabledCurrencyCodes,
} from './platform-enabled-currencies';

/*
 * ADR-0026 D4 — `platform-defaults.enabledCurrencies` is a subset of the
 * `@repo/config` catalog, defaulting to all of it, always containing the
 * default and reporting currencies, and never invalidating a value a record
 * already carries.
 */

describe('resolveEnabledCurrencyCodes', () => {
  it('is the whole catalog when the setting was never narrowed', () => {
    expect(resolveEnabledCurrencyCodes({})).toEqual([
      ...PLATFORM_CURRENCY_CODES,
    ]);
    expect(resolveEnabledCurrencyCodes({ enabledCurrencies: [] })).toEqual([
      ...PLATFORM_CURRENCY_CODES,
    ]);
    expect(resolveEnabledCurrencyCodes(null)).toEqual([
      ...PLATFORM_CURRENCY_CODES,
    ]);
  });

  it('keeps catalog order, drops unknown codes, and always includes the default and reporting currencies', () => {
    expect(
      resolveEnabledCurrencyCodes({
        currency: 'QAR',
        reportingCurrency: 'GBP',
        enabledCurrencies: ['USD', 'ZZZ', 'AED'],
      }),
    ).toEqual(['QAR', 'AED', 'USD', 'GBP']);
  });
});

describe('assertValidEnabledCurrencies', () => {
  const base = { currency: 'QAR', reportingCurrency: 'USD' };

  it('accepts an absent list (meaning all) and a valid subset', () => {
    expect(() => assertValidEnabledCurrencies(base)).not.toThrow();
    expect(() =>
      assertValidEnabledCurrencies({
        ...base,
        enabledCurrencies: ['QAR', 'USD', 'EUR'],
      }),
    ).not.toThrow();
  });

  it.each([
    [[], /at least one/],
    ['QAR', /at least one/],
    [['QAR', 'USD', 'XYZ'], /unsupported/],
    [['QAR', 'USD', 'USD'], /twice/],
    [['USD'], /default currency \(QAR\)/],
    [['QAR'], /reporting currency \(USD\)/],
  ])('rejects %p', (enabledCurrencies, message) => {
    expect(() =>
      assertValidEnabledCurrencies({ ...base, enabledCurrencies }),
    ).toThrow(message);
  });
});

describe('describeEnabledCurrencies', () => {
  const defaults = {
    currency: 'QAR',
    reportingCurrency: 'QAR',
    enabledCurrencies: ['QAR', 'USD'],
  };

  it('lists enabled currencies as lookup options', () => {
    expect(describeEnabledCurrencies(defaults)).toEqual([
      expect.objectContaining({
        value: 'QAR',
        code: 'QAR',
        name: 'Qatari Riyal',
        displayName: 'QAR - Qatari Riyal',
        enabled: true,
      }),
      expect.objectContaining({ code: 'USD', enabled: true }),
    ]);
  });

  it('keeps a since-disabled currency readable when asked to include it', () => {
    const items = describeEnabledCurrencies(defaults, { include: 'eur' });
    expect(items.map((item) => [item.code, item.enabled])).toEqual([
      ['QAR', true],
      ['USD', true],
      ['EUR', false],
    ]);
  });

  it('filters by code or name', () => {
    expect(
      describeEnabledCurrencies(defaults, { search: 'dollar' }).map(
        (item) => item.code,
      ),
    ).toEqual(['USD']);
  });
});

describe('assertCurrencyEnabled', () => {
  const db = (value: unknown) => ({
    platformSetting: { findUnique: jest.fn(async () => ({ value })) },
  });

  it('allows an enabled currency and refuses a disabled one with a field error', async () => {
    const reader = db({
      currency: 'QAR',
      reportingCurrency: 'QAR',
      enabledCurrencies: ['QAR'],
    });
    await expect(assertCurrencyEnabled(reader as never, 'qar')).resolves.toBe(
      undefined,
    );
    await expect(
      assertCurrencyEnabled(reader as never, 'USD'),
    ).rejects.toMatchObject({
      errorCode: 'PLATFORM_CURRENCY_NOT_ENABLED',
      statusCode: 400,
      details: { fieldErrors: [{ field: 'currencyCode' }] },
    });
  });

  it('allows every supported currency when nothing has been narrowed', async () => {
    await expect(assertCurrencyEnabled(db(null) as never, 'JPY')).resolves.toBe(
      undefined,
    );
  });
});
