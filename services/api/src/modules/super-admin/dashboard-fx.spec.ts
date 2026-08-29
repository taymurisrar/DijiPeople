import { Prisma } from '@prisma/client';
import { buildMonthlyTrend, foldCurrencies } from './super-admin.service';

/**
 * BUG-1745 — the arithmetic behind "Collected revenue".
 *
 * Production held two succeeded payments totalling QAR 160 and reported
 * "Collected revenue PKR 0", because every money aggregate filtered on a
 * reporting currency that matched no record in the system. The fix is not a
 * different filter; it is that the figures are now folded across currencies.
 *
 * What these tests pin is the pair of properties that make the folded figure
 * safe to read: everything in a known currency is included, and everything in
 * an unknown one is named rather than dropped or counted at par.
 */

/** 1 QAR ≈ 76.40 PKR. */
const RATES: Record<string, number> = { QAR: 76.4, USD: 278.5 };

function convert(amount: number, currency: string): number | null {
  if (currency === 'PKR') return amount;
  const rate = RATES[currency];
  return rate === undefined ? null : Math.round(amount * rate * 100) / 100;
}

describe('dashboard currency folding', () => {
  it('includes money in every currency it can convert', () => {
    const folded = foldCurrencies(
      [
        { currency: 'QAR', amount: 160, count: 2 },
        { currency: 'PKR', amount: 1000, count: 1 },
      ],
      convert,
    );
    expect(folded.total).toBe(13224);
    expect(folded.unconvertible).toEqual([]);
  });

  it('reports the production case as a non-zero figure', () => {
    /*
     * The exact shape of the reported bug: two QAR payments, a PKR reporting
     * currency, nothing else. Before this change the screen read "PKR 0"; the
     * assertion that matters is simply that it no longer can.
     */
    const folded = foldCurrencies(
      [{ currency: 'QAR', amount: 160, count: 2 }],
      convert,
    );
    expect(folded.total).toBeGreaterThan(0);
    expect(folded.total).toBe(12224);
  });

  it('names a currency it cannot convert instead of dropping or par-counting it', () => {
    const folded = foldCurrencies(
      [
        { currency: 'QAR', amount: 100, count: 1 },
        { currency: 'XOF', amount: 50_000, count: 3 },
      ],
      convert,
    );
    // The convertible half is counted...
    expect(folded.total).toBe(7640);
    // ...and the rest is stated in its own currency rather than added at par.
    expect(folded.unconvertible).toEqual([
      { currency: 'XOF', amount: 50000, count: 3 },
    ]);
    expect(folded.total).not.toBe(7640 + 50_000);
  });

  it('orders unconvertible currencies by how much money is stranded in them', () => {
    const folded = foldCurrencies(
      [
        { currency: 'AAA', amount: 10, count: 1 },
        { currency: 'BBB', amount: 900, count: 1 },
        { currency: 'CCC', amount: 100, count: 1 },
      ],
      convert,
    );
    expect(folded.unconvertible.map((row) => row.currency)).toEqual([
      'BBB',
      'CCC',
      'AAA',
    ]);
  });

  it('is zero only when there is genuinely no money', () => {
    const folded = foldCurrencies([], convert);
    expect(folded.total).toBe(0);
    expect(folded.unconvertible).toEqual([]);
  });

  it('does not drift past two decimal places when folding many rows', () => {
    const folded = foldCurrencies(
      [
        { currency: 'QAR', amount: 0.1, count: 1 },
        { currency: 'QAR', amount: 0.2, count: 1 },
        { currency: 'PKR', amount: 0.1, count: 1 },
        { currency: 'PKR', amount: 0.2, count: 1 },
      ],
      convert,
    );
    expect(folded.total).toBe(Math.round(folded.total * 100) / 100);
  });
});

describe('dashboard revenue trend', () => {
  const month = (day: number) => new Date(Date.UTC(2026, 7, day));
  const start = new Date(Date.UTC(2026, 7, 1));

  it('converts each row by its own currency rather than one currency per query', () => {
    const trend = buildMonthlyTrend(
      start,
      [
        {
          createdAt: month(3),
          amount: new Prisma.Decimal('100'),
          amountPaid: null,
          currency: 'QAR',
        },
        {
          createdAt: month(4),
          amount: new Prisma.Decimal('500'),
          amountPaid: null,
          currency: 'PKR',
        },
      ],
      [
        {
          createdAt: month(5),
          amount: new Prisma.Decimal('80'),
          currency: 'QAR',
        },
      ],
      convert,
    );

    const august = trend[trend.length - 1];
    expect(august.invoiced).toBe(8140); // 100 QAR → 7640, plus 500 PKR
    expect(august.collected).toBe(6112); // 80 QAR
  });

  it('skips a row it cannot convert rather than adding it at par', () => {
    const trend = buildMonthlyTrend(
      start,
      [
        {
          createdAt: month(3),
          amount: new Prisma.Decimal('9999'),
          amountPaid: null,
          currency: 'XOF',
        },
      ],
      [],
      convert,
    );
    expect(trend[trend.length - 1].invoiced).toBe(0);
  });
});
