import { PartnerCommissionStatus } from '@prisma/client';
import {
  PARTNER_COMMISSION_ACTIONS,
  assertCommissionLinksBelongToPartner,
  commissionActionForTarget,
  commissionSourceLabel,
  commissionTransition,
  computeCommissionAmount,
  isPartnerCommissionAction,
  resolveCommissionRate,
} from './partner-commission-lifecycle';

/*
 * ADR-0026 D3 (EXECPLAN-0055 WP-06). The commission ledger's rules, without a
 * database: the status machine, the server-side amount, the rate default and
 * the ownership of linked records.
 */

const {
  PENDING,
  APPROVED,
  PAYABLE,
  PAID,
  VOID: VOIDED,
} = PartnerCommissionStatus;
const ALL = [PENDING, APPROVED, PAYABLE, PAID, VOIDED];

/** The domain error code a call throws, or undefined when it does not. */
function errorCodeOf(call: () => unknown): string | undefined {
  try {
    call();
  } catch (error) {
    return (error as { errorCode?: string }).errorCode;
  }
  return undefined;
}

describe('commission status machine', () => {
  it('moves only forward: Pending → Approved → Payable → Paid', () => {
    expect(commissionTransition(PENDING, 'approve-commission')).toBe(APPROVED);
    expect(commissionTransition(APPROVED, 'mark-commission-payable')).toBe(
      PAYABLE,
    );
    expect(commissionTransition(PAYABLE, 'mark-commission-paid')).toBe(PAID);
  });

  it('voids from every state except Paid (and Void itself)', () => {
    for (const from of [PENDING, APPROVED, PAYABLE])
      expect(commissionTransition(from, 'void-commission')).toBe(VOIDED);
    for (const from of [PAID, VOIDED])
      expect(
        errorCodeOf(() => commissionTransition(from, 'void-commission')),
      ).toBe('PARTNER_COMMISSION_TRANSITION_NOT_ALLOWED');
  });

  /*
   * Written out rather than read from the table, so widening the table — a
   * Paid commission re-approved, say — fails here instead of agreeing with
   * itself.
   */
  it('allows exactly these steps and no others', () => {
    const expected: Record<string, PartnerCommissionStatus[]> = {
      'approve-commission': [PENDING],
      'mark-commission-payable': [APPROVED],
      'mark-commission-paid': [PAYABLE],
      'void-commission': [PENDING, APPROVED, PAYABLE],
    };
    expect(Object.keys(PARTNER_COMMISSION_ACTIONS).sort()).toEqual(
      Object.keys(expected).sort(),
    );
    for (const [action, from] of Object.entries(expected))
      for (const status of ALL) {
        const attempt = () =>
          commissionTransition(
            status,
            action as keyof typeof PARTNER_COMMISSION_ACTIONS,
          );
        if (from.includes(status)) expect(attempt).not.toThrow();
        else expect(attempt).toThrow();
      }
  });

  it('a Paid commission is final', () => {
    for (const action of Object.keys(
      PARTNER_COMMISSION_ACTIONS,
    ) as (keyof typeof PARTNER_COMMISSION_ACTIONS)[])
      expect(() => commissionTransition(PAID, action)).toThrow();
  });

  it('refuses every step not in the table, from every state', () => {
    for (const action of Object.keys(
      PARTNER_COMMISSION_ACTIONS,
    ) as (keyof typeof PARTNER_COMMISSION_ACTIONS)[]) {
      const allowed = PARTNER_COMMISSION_ACTIONS[action]
        .from as readonly PartnerCommissionStatus[];
      for (const from of ALL.filter((status) => !allowed.includes(status)))
        expect(errorCodeOf(() => commissionTransition(from, action))).toBe(
          'PARTNER_COMMISSION_TRANSITION_NOT_ALLOWED',
        );
    }
  });

  it('a PATCH target is translated to the one action that reaches it, or refused', () => {
    expect(commissionActionForTarget(PENDING, APPROVED)).toBe(
      'approve-commission',
    );
    expect(commissionActionForTarget(PAYABLE, VOIDED)).toBe('void-commission');
    // The jumps updateCommission used to allow.
    for (const [from, to] of [
      [PAID, PENDING],
      [PAID, VOIDED],
      [PENDING, PAID],
      [PENDING, PAYABLE],
      [VOIDED, PENDING],
      [APPROVED, PENDING],
      [PENDING, PENDING],
    ] as const)
      expect(errorCodeOf(() => commissionActionForTarget(from, to))).toBe(
        'PARTNER_COMMISSION_TRANSITION_NOT_ALLOWED',
      );
  });

  it('recognises its own action keys only', () => {
    expect(isPartnerCommissionAction('mark-commission-paid')).toBe(true);
    expect(isPartnerCommissionAction('change-status')).toBe(false);
    expect(isPartnerCommissionAction('toString')).toBe(false);
  });
});

describe('commission amount and rate', () => {
  it('is base × rate / 100 on a 0–100 percentage', () => {
    expect(computeCommissionAmount(1000, 10).toString()).toBe('100');
    expect(computeCommissionAmount(1000, 12.5).toString()).toBe('125');
    expect(computeCommissionAmount(999.99, 7.25).toFixed(2)).toBe('72.50');
  });

  it('rounds half-up to cents in decimal arithmetic', () => {
    // 1.005 × 100 is 100.49999… in binary floating point.
    expect(computeCommissionAmount(1.005, 100).toFixed(2)).toBe('1.01');
    expect(computeCommissionAmount(0.05, 10).toFixed(2)).toBe('0.01');
  });

  it("uses the entry's own rate, else the partner's configured default", () => {
    expect(resolveCommissionRate(15, 10).toNumber()).toBe(15);
    expect(resolveCommissionRate(0, 10).toNumber()).toBe(0);
    expect(
      resolveCommissionRate(undefined, { toString: () => '12.5' }).toNumber(),
    ).toBe(12.5);
    expect(resolveCommissionRate(null, 10).toNumber()).toBe(10);
  });

  it('refuses when there is no rate and the partner default is not configured', () => {
    for (const unset of [0, null, undefined, { toString: () => '0.00' }])
      expect(errorCodeOf(() => resolveCommissionRate(undefined, unset))).toBe(
        'PARTNER_COMMISSION_RATE_REQUIRED',
      );
  });
});

describe('linked records must belong to the partner', () => {
  function db(rows: { lead?: unknown; customer?: unknown; invoice?: unknown }) {
    return {
      lead: { findUnique: jest.fn(async () => rows.lead ?? null) },
      customerAccount: {
        findUnique: jest.fn(async () => rows.customer ?? null),
      },
      invoice: { findUnique: jest.fn(async () => rows.invoice ?? null) },
    } as never;
  }
  const refused = { errorCode: 'PARTNER_COMMISSION_LINK_INVALID' };

  it('accepts records this partner referred', async () => {
    await expect(
      assertCommissionLinksBelongToPartner(
        db({
          lead: { id: 'l1', partnerId: 'p1' },
          customer: { id: 'c1', originatingPartnerId: 'p1' },
          invoice: {
            id: 'i1',
            tenant: {
              originatingPartnerId: null,
              customerAccountId: 'c1',
              customerAccount: { originatingPartnerId: 'p1' },
            },
          },
        }),
        'p1',
        { leadId: 'l1', customerAccountId: 'c1', invoiceId: 'i1' },
      ),
    ).resolves.toBeUndefined();
  });

  it('refuses a missing lead, and a lead another partner referred', async () => {
    await expect(
      assertCommissionLinksBelongToPartner(db({}), 'p1', { leadId: 'l1' }),
    ).rejects.toMatchObject(refused);
    await expect(
      assertCommissionLinksBelongToPartner(
        db({ lead: { id: 'l1', partnerId: 'p2' } }),
        'p1',
        { leadId: 'l1' },
      ),
    ).rejects.toThrow('not referred by this partner');
  });

  it('refuses a customer attributed to someone else, or to nobody', async () => {
    for (const originatingPartnerId of ['p2', null])
      await expect(
        assertCommissionLinksBelongToPartner(
          db({ customer: { id: 'c1', originatingPartnerId } }),
          'p1',
          { customerAccountId: 'c1' },
        ),
      ).rejects.toMatchObject(refused);
  });

  it("checks an invoice through its tenant's attribution", async () => {
    await expect(
      assertCommissionLinksBelongToPartner(
        db({
          invoice: {
            id: 'i1',
            tenant: {
              originatingPartnerId: 'p2',
              customerAccountId: 'c1',
              customerAccount: { originatingPartnerId: 'p1' },
            },
          },
        }),
        'p1',
        { invoiceId: 'i1' },
      ),
    ).rejects.toThrow('not for a customer attributed to this partner');
  });

  it("refuses an invoice that is not the named customer's", async () => {
    await expect(
      assertCommissionLinksBelongToPartner(
        db({
          customer: { id: 'c1', originatingPartnerId: 'p1' },
          invoice: {
            id: 'i1',
            tenant: {
              originatingPartnerId: 'p1',
              customerAccountId: 'c-other',
              customerAccount: null,
            },
          },
        }),
        'p1',
        { customerAccountId: 'c1', invoiceId: 'i1' },
      ),
    ).rejects.toThrow('belongs to a different customer');
  });

  it('names the most specific source for the grid', () => {
    expect(commissionSourceLabel({})).toBe('Manual entry');
    expect(
      commissionSourceLabel(
        { leadId: 'l1', customerAccountId: 'c1' },
        { customers: new Map([['c1', 'Acme']]) },
      ),
    ).toBe('Customer Acme');
    expect(
      commissionSourceLabel(
        { invoiceId: 'i1' },
        { invoices: new Map([['i1', 'INV-7']]) },
      ),
    ).toBe('Invoice INV-7');
  });
});
