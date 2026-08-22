import { Prisma } from '@prisma/client';

import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { EnterpriseConfigurationService } from './enterprise-configuration.service';

/**
 * REG-223 — BUG-0668.
 *
 * `resolveExchangeRate` accepted an `effectiveDate` and ignored it. Every lookup
 * ordered by `updatedAt` and took the newest row, so asking for the rate *as of*
 * a date returned today's rate — and `convertMoney` forwards the caller's date
 * straight through, so a caller who did everything right still got the wrong
 * number, silently, on money.
 *
 * `ESLint` had been reporting it as an unused parameter for as long as the
 * baseline existed. ITEM-0042 is the item that made somebody read that output.
 *
 * ## Why these tests assert on the `where` clause
 *
 * The behaviour under test is *which rows are eligible*, and that is expressed
 * entirely in the Prisma filter. A test that stubbed a single row and checked
 * the returned rate would pass with the filter deleted, because the stub would
 * return that row whatever was asked for. So the recorded `where` is the
 * assertion, and one test drives real selection across three windows to prove
 * the filter is not merely present but correct.
 */
describe('BUG-0668 — exchange rate resolution honours the effective date', () => {
  interface Snapshot {
    rate: Prisma.Decimal;
    effectiveDate: Date;
    effectiveEndDate: Date | null;
    isManual: boolean;
  }

  const calls: Array<Record<string, unknown>> = [];
  let rows: Snapshot[] = [];

  function serviceOver(available: Snapshot[]) {
    rows = available;
    calls.length = 0;

    const prisma = {
      exchangeRateSnapshot: {
        findFirst: (args: {
          where: Record<string, unknown>;
          orderBy?: unknown;
        }) => {
          calls.push(args.where);
          const asOf = args.where.effectiveDate as { lte?: Date } | undefined;
          const wantsManual = args.where.isManual as boolean | undefined;
          const at = asOf?.lte;

          const eligible = rows.filter((row) => {
            if (wantsManual !== undefined && row.isManual !== wantsManual) {
              return false;
            }
            // The filter under test. If the production code stops sending it,
            // `at` is undefined and every row matches — which is the defect,
            // and is what the last test detects.
            if (!at) return true;
            if (row.effectiveDate > at) return false;
            return row.effectiveEndDate === null || row.effectiveEndDate >= at;
          });

          // Most recently effective first, matching the production orderBy.
          eligible.sort(
            (a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime(),
          );
          return Promise.resolve(eligible[0] ?? null);
        },
      },
    } as unknown as PrismaService;

    return new EnterpriseConfigurationService(
      prisma,
      {} as unknown as AuditService,
    );
  }

  const rate = (value: string) => new Prisma.Decimal(value);

  /** Three consecutive windows, the shape a rate history actually has. */
  const HISTORY: Snapshot[] = [
    {
      rate: rate('3.60'),
      effectiveDate: new Date('2026-01-01'),
      effectiveEndDate: new Date('2026-03-31'),
      isManual: true,
    },
    {
      rate: rate('3.70'),
      effectiveDate: new Date('2026-04-01'),
      effectiveEndDate: new Date('2026-06-30'),
      isManual: true,
    },
    {
      rate: rate('3.80'),
      effectiveDate: new Date('2026-07-01'),
      effectiveEndDate: null,
      isManual: true,
    },
  ];

  it.each([
    ['2026-02-15', '3.6'],
    ['2026-05-15', '3.7'],
    ['2026-08-15', '3.8'],
  ])('resolves the rate in force on %s', async (date, expected) => {
    /*
     * The defect in one line: before the fix all three of these returned 3.8,
     * because the newest row always won. A payroll run recalculated for
     * February would have used August's rate.
     */
    const service = serviceOver(HISTORY);

    const resolved = await service.resolveExchangeRate(
      'tenant-1',
      'USD',
      'AED',
      new Date(date),
    );

    expect(resolved.toString()).toBe(expected);
  });

  it('defaults to the rate in force now', async () => {
    // The parameter is optional, and the default has to keep meaning "today".
    const service = serviceOver(HISTORY);

    const resolved = await service.resolveExchangeRate(
      'tenant-1',
      'USD',
      'AED',
    );

    expect(resolved.toString()).toBe('3.8');
  });

  it('refuses when no window covers the requested date', async () => {
    // Not the same as "no rate exists", and the message says which date.
    const service = serviceOver(HISTORY);

    await expect(
      service.resolveExchangeRate(
        'tenant-1',
        'USD',
        'AED',
        new Date('2025-06-01'),
      ),
    ).rejects.toThrow(/2025-06-01/);
  });

  it('sends the effective-date window to the database', async () => {
    /*
     * The assertion that fails if the filter is dropped rather than merely
     * reordered. Without it a test could pass on the stub's own sorting while
     * production asked the database for everything and took the newest.
     */
    const service = serviceOver(HISTORY);
    await service.resolveExchangeRate(
      'tenant-1',
      'USD',
      'AED',
      new Date('2026-05-15'),
    );

    expect(calls.length).toBeGreaterThan(0);
    for (const where of calls) {
      expect(where.effectiveDate).toEqual({ lte: new Date('2026-05-15') });
      expect(where.OR).toEqual([
        { effectiveEndDate: null },
        { effectiveEndDate: { gte: new Date('2026-05-15') } },
      ]);
    }
  });

  it('carries the caller-supplied date through convertMoney', async () => {
    /*
     * `convertMoney` is the only caller, and it is the one that made the defect
     * dangerous: it forwards the caller's date, so the wrong rate arrived
     * through an API that looked entirely correct from the outside.
     */
    const service = serviceOver(HISTORY);

    const converted = await service.convertMoney({
      tenantId: 'tenant-1',
      amount: '100',
      fromCurrency: 'USD',
      toCurrency: 'AED',
      effectiveDate: new Date('2026-02-15'),
    });

    expect(converted.toString()).toBe('360');
  });
});
