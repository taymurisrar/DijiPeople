import { BadRequestException } from '@nestjs/common';
import { ExchangeRateSource, Prisma } from '@prisma/client';
import { PlatformFxService } from './platform-fx.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/**
 * The rules that make a converted revenue figure trustworthy.
 *
 * A dashboard that multiplies money by a rate is only as honest as the rate and
 * as its behaviour when it has none. The two assertions this suite exists for:
 *
 *  - a missing rate produces `null`, never a par conversion — QAR 160 must not
 *    silently become PKR 160;
 *  - an operator's override survives the next provider refresh, or correcting a
 *    rate is a race the operator loses.
 */

type RateRow = {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: Prisma.Decimal;
  source: ExchangeRateSource;
  provider: string | null;
  fetchedAt: Date | null;
  manualOverride: boolean;
  overrideReason: string | null;
};

function actor(): AuthenticatedUser {
  return { userId: 'operator-1', tenantId: 'platform' } as AuthenticatedUser;
}

/**
 * An in-memory stand-in for the two tables this service reads, and the three it
 * reads currencies from.
 */
function fakePrisma(options?: {
  rates?: Partial<RateRow>[];
  paymentCurrencies?: string[];
  invoiceCurrencies?: string[];
  commissionCurrencies?: string[];
  reportingCurrency?: string | null;
}) {
  let seq = 0;
  const rows: RateRow[] = (options?.rates ?? []).map((row) => ({
    id: `rate-${++seq}`,
    baseCurrency: row.baseCurrency ?? 'PKR',
    quoteCurrency: row.quoteCurrency ?? 'QAR',
    rate: row.rate ?? new Prisma.Decimal('1'),
    source: row.source ?? ExchangeRateSource.API,
    provider: row.provider ?? null,
    fetchedAt: row.fetchedAt ?? null,
    manualOverride: row.manualOverride ?? false,
    overrideReason: row.overrideReason ?? null,
  }));

  const find = (base: string, quote: string) =>
    rows.find((r) => r.baseCurrency === base && r.quoteCurrency === quote);

  return {
    rows,
    platformExchangeRate: {
      findMany: ({ where }: { where?: { baseCurrency?: string } }) =>
        Promise.resolve(
          rows.filter(
            (r) =>
              !where?.baseCurrency || r.baseCurrency === where.baseCurrency,
          ),
        ),
      findFirst: ({
        where,
      }: {
        where: { baseCurrency: string; source?: ExchangeRateSource };
      }) =>
        Promise.resolve(
          rows
            .filter(
              (r) =>
                r.baseCurrency === where.baseCurrency &&
                (!where.source || r.source === where.source),
            )
            .sort(
              (a, b) =>
                (b.fetchedAt?.getTime() ?? 0) - (a.fetchedAt?.getTime() ?? 0),
            )[0] ?? null,
        ),
      findUnique: ({ where }: { where: Record<string, unknown> }) => {
        const key = where.baseCurrency_quoteCurrency as
          | { baseCurrency: string; quoteCurrency: string }
          | undefined;
        if (key)
          return Promise.resolve(
            find(key.baseCurrency, key.quoteCurrency) ?? null,
          );
        return Promise.resolve(rows.find((r) => r.id === where.id) ?? null);
      },
      upsert: ({
        where,
        create,
        update,
      }: {
        where: {
          baseCurrency_quoteCurrency: {
            baseCurrency: string;
            quoteCurrency: string;
          };
        };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const key = where.baseCurrency_quoteCurrency;
        const existing = find(key.baseCurrency, key.quoteCurrency);
        if (existing) {
          Object.assign(existing, update);
          return Promise.resolve(existing);
        }
        const row = { id: `rate-${++seq}`, ...create } as RateRow;
        rows.push(row);
        return Promise.resolve(row);
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return Promise.resolve(row);
      },
    },
    payment: {
      findMany: () =>
        Promise.resolve(
          (options?.paymentCurrencies ?? ['QAR']).map((currency) => ({
            currency,
          })),
        ),
    },
    invoice: {
      findMany: () =>
        Promise.resolve(
          (options?.invoiceCurrencies ?? []).map((currency) => ({ currency })),
        ),
    },
    partnerCommission: {
      findMany: () =>
        Promise.resolve(
          (options?.commissionCurrencies ?? []).map((currencyCode) => ({
            currencyCode,
          })),
        ),
    },
    platformSetting: {
      findUnique: () =>
        Promise.resolve(
          options?.reportingCurrency === null
            ? null
            : {
                value: {
                  reportingCurrency: options?.reportingCurrency ?? 'PKR',
                },
              },
        ),
    },
  };
}

function fakeAudit() {
  const entries: Array<{ action: string; afterSnapshot?: unknown }> = [];
  return {
    entries,
    log: (input: { action: string; afterSnapshot?: unknown }) => {
      entries.push(input);
      return Promise.resolve(undefined);
    },
  };
}

/** Stubs the one method that touches the network. */
class StubbedFx extends PlatformFxService {
  public providerCalls = 0;
  public providerRates: Record<string, number> | Error = { QAR: 0.0131 };

  protected fetchProviderRates(): Promise<Record<string, number>> {
    this.providerCalls += 1;
    if (this.providerRates instanceof Error)
      return Promise.reject(this.providerRates);
    return Promise.resolve(this.providerRates);
  }
}

function build(options?: Parameters<typeof fakePrisma>[0]) {
  const prisma = fakePrisma(options);
  const audit = fakeAudit();
  const service = new StubbedFx(prisma as never, audit as never);
  return { service, prisma, audit };
}

describe('PlatformFxService', () => {
  describe('conversion', () => {
    it('converts a quoted currency into the reporting currency', async () => {
      const { service } = build({
        rates: [{ quoteCurrency: 'QAR', rate: new Prisma.Decimal('76.40') }],
      });
      const fx = await service.loadConverter('PKR');
      expect(fx.convert(160, 'QAR')).toBe(12224);
    });

    it('returns the amount unchanged for the reporting currency itself', async () => {
      const { service } = build({ rates: [] });
      const fx = await service.loadConverter('PKR');
      expect(fx.convert(500, 'PKR')).toBe(500);
    });

    it('returns null — never the amount, never zero — when no rate exists', async () => {
      /*
       * The load-bearing assertion of this file. A fallback of 1 would turn
       * QAR 160 into "PKR 160" on the dashboard, and no part of the screen
       * would be able to tell anyone that had happened.
       */
      const { service } = build({ rates: [] });
      const fx = await service.loadConverter('PKR');
      expect(fx.convert(160, 'QAR')).toBeNull();
      expect(fx.convert(160, 'QAR')).not.toBe(160);
      expect(fx.convert(160, 'QAR')).not.toBe(0);
    });

    it('refuses a stored rate that is zero, negative or not a number', async () => {
      const { service } = build({
        rates: [
          { quoteCurrency: 'USD', rate: new Prisma.Decimal('0') },
          { quoteCurrency: 'EUR', rate: new Prisma.Decimal('-3') },
        ],
      });
      const fx = await service.loadConverter('PKR');
      expect(fx.convert(10, 'USD')).toBeNull();
      expect(fx.convert(10, 'EUR')).toBeNull();
      expect(fx.convert(Number.NaN, 'USD')).toBeNull();
    });

    it('reports how old its rates are', async () => {
      const fetchedAt = new Date('2026-08-28T09:00:00.000Z');
      const { service } = build({
        rates: [
          { quoteCurrency: 'QAR', rate: new Prisma.Decimal('76.4'), fetchedAt },
        ],
      });
      const fx = await service.loadConverter('PKR');
      expect(fx.ratesAsOf).toBe(fetchedAt.toISOString());
    });
  });

  describe('refresh', () => {
    it('stores the inverse of the provider quote, so conversion is a multiplication', async () => {
      // The provider says 1 PKR = 0.0131 QAR; converting a QAR payment needs
      // the other direction.
      const { service } = build({ rates: [], paymentCurrencies: ['QAR'] });
      service.providerRates = { QAR: 0.0131 };
      await service.refreshFromProvider('PKR');

      const fx = await service.loadConverter('PKR');
      expect(fx.convert(1, 'QAR')).toBeCloseTo(1 / 0.0131, 2);
    });

    it('fetches only currencies the platform holds money in', async () => {
      const { service, prisma } = build({
        rates: [],
        paymentCurrencies: ['QAR'],
        invoiceCurrencies: ['USD'],
        commissionCurrencies: ['QAR'],
      });
      service.providerRates = {
        QAR: 0.0131,
        USD: 0.0036,
        ZWL: 1157,
        JPY: 0.54,
      };
      await service.refreshFromProvider('PKR');

      expect(prisma.rows.map((r) => r.quoteCurrency).sort()).toEqual([
        'QAR',
        'USD',
      ]);
    });

    it('leaves a manual override alone', async () => {
      const { service, prisma } = build({
        rates: [
          {
            quoteCurrency: 'QAR',
            rate: new Prisma.Decimal('80'),
            source: ExchangeRateSource.MANUAL,
            manualOverride: true,
            overrideReason: 'Contracted rate for August',
          },
        ],
        paymentCurrencies: ['QAR'],
      });
      service.providerRates = { QAR: 0.0131 };
      await service.refreshFromProvider('PKR');

      const stored = prisma.rows.find((r) => r.quoteCurrency === 'QAR')!;
      expect(Number(stored.rate)).toBe(80);
      expect(stored.manualOverride).toBe(true);
      expect(stored.overrideReason).toBe('Contracted rate for August');
    });

    it('leaves stored rates in place when the provider fails', async () => {
      const { service, prisma } = build({
        rates: [{ quoteCurrency: 'QAR', rate: new Prisma.Decimal('76.4') }],
        paymentCurrencies: ['QAR'],
      });
      service.providerRates = new Error('open.er-api.com answered 503.');

      await expect(service.refreshFromProvider('PKR')).rejects.toThrow('503');
      expect(Number(prisma.rows[0].rate)).toBe(76.4);
    });

    it('does not fail when the provider quotes no rate for a currency in use', async () => {
      const { service, audit } = build({
        rates: [],
        paymentCurrencies: ['QAR', 'XYZ'],
      });
      service.providerRates = { QAR: 0.0131 };
      const rates = await service.refreshFromProvider('PKR');

      expect(rates.map((r) => r.currency)).toEqual(['QAR']);
      const last = audit.entries[audit.entries.length - 1];
      const entry = last.afterSnapshot as {
        unquoted: string[];
      };
      expect(entry.unquoted).toEqual(['XYZ']);
    });

    it('audits every refresh', async () => {
      const { service, audit } = build({
        rates: [],
        paymentCurrencies: ['QAR'],
      });
      await service.refreshFromProvider('PKR', actor());
      expect(audit.entries.map((e) => e.action)).toContain(
        'PLATFORM_FX_RATES_REFRESHED',
      );
    });
  });

  describe('manual override', () => {
    it('records the rate, the reason and an audit entry', async () => {
      const { service, prisma, audit } = build({ rates: [] });
      const saved = await service.setManualRate(
        'PKR',
        'QAR',
        76.5,
        'Contracted rate for August',
        actor(),
      );

      expect(saved.rate).toBe(76.5);
      expect(saved.manualOverride).toBe(true);
      expect(prisma.rows).toHaveLength(1);
      expect(audit.entries.map((e) => e.action)).toContain(
        'PLATFORM_FX_RATE_OVERRIDDEN',
      );
    });

    it('refuses a rate that is not a positive number', async () => {
      const { service } = build({ rates: [] });
      await expect(
        service.setManualRate('PKR', 'QAR', 0, 'because', actor()),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.setManualRate('PKR', 'QAR', -1, 'because', actor()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to set a rate for the reporting currency against itself', async () => {
      const { service } = build({ rates: [] });
      await expect(
        service.setManualRate('PKR', 'PKR', 2, 'because', actor()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns a pair to the live rate when the override is cleared', async () => {
      const { service, prisma, audit } = build({
        rates: [
          {
            quoteCurrency: 'QAR',
            rate: new Prisma.Decimal('80'),
            source: ExchangeRateSource.MANUAL,
            manualOverride: true,
          },
        ],
        paymentCurrencies: ['QAR'],
      });
      service.providerRates = { QAR: 0.0131 };

      await service.clearManualOverride('PKR', 'QAR', actor());

      const stored = prisma.rows.find((r) => r.quoteCurrency === 'QAR')!;
      expect(stored.manualOverride).toBe(false);
      // Cleared and refetched in one action, so the operator sees the live rate
      // rather than the manual one they just abandoned.
      expect(Number(stored.rate)).toBeCloseTo(1 / 0.0131, 2);
      expect(audit.entries.map((e) => e.action)).toContain(
        'PLATFORM_FX_OVERRIDE_CLEARED',
      );
    });

    it('refuses to clear an override that is not set', async () => {
      const { service } = build({
        rates: [{ quoteCurrency: 'QAR', rate: new Prisma.Decimal('76.4') }],
      });
      await expect(
        service.clearManualOverride('PKR', 'QAR', actor()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('freshness', () => {
    it('does not call the provider while rates are inside the day-long window', async () => {
      const { service } = build({
        rates: [
          {
            quoteCurrency: 'QAR',
            rate: new Prisma.Decimal('76.4'),
            fetchedAt: new Date(Date.now() - 60_000),
          },
        ],
      });
      await service.ensureFresh('PKR');
      expect(service.providerCalls).toBe(0);
    });

    it('refreshes when the newest rate is older than a day', async () => {
      const { service } = build({
        rates: [
          {
            quoteCurrency: 'QAR',
            rate: new Prisma.Decimal('76.4'),
            fetchedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
          },
        ],
        paymentCurrencies: ['QAR'],
      });
      await service.ensureFresh('PKR');
      expect(service.providerCalls).toBe(1);
    });

    it('never throws at the caller when the provider is down', async () => {
      const { service } = build({ rates: [], paymentCurrencies: ['QAR'] });
      service.providerRates = new Error('ECONNREFUSED');
      await expect(service.ensureFresh('PKR')).resolves.toBeUndefined();
    });
  });

  describe('reporting currency', () => {
    it('reads the stored platform default', async () => {
      const { service } = build({ reportingCurrency: 'PKR' });
      await expect(service.resolveReportingCurrency()).resolves.toBe('PKR');
    });

    it("falls back to the product's own default when nothing is stored", async () => {
      const { service } = build({ reportingCurrency: null });
      await expect(service.resolveReportingCurrency()).resolves.toBe('QAR');
    });
  });
});
