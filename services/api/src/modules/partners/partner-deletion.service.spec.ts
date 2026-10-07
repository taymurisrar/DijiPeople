import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PartnerDeletionService } from './partner-deletion.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

const user = { userId: 'op-1' } as AuthenticatedUser;

const NO_COUNTS = {
  leads: 0,
  commissions: 0,
  agreements: 0,
  referralLinks: 0,
  portalUsers: 0,
  inquiries: 0,
  onboardingApplications: 0,
  previousAttributions: 0,
  correctedAttributions: 0,
  leadReviews: 0,
  supportCases: 0,
  attributedCustomers: 0,
  attributedTenants: 0,
  timeline: 0,
};

const partner = (id: string, counts: Partial<Record<string, number>> = {}) => ({
  id,
  displayName: `Partner ${id}`,
  status: 'DRAFT',
  partnerNumber: `PART-${id}`,
  _count: { ...NO_COUNTS, ...counts },
});

/**
 * A Prisma double whose partner delete runs in an interactive transaction.
 *
 * `rows` is what `findUnique` answers *inside* the transaction; `outside` is
 * what a read before it would have seen. Tests that need the two to disagree
 * — the race the in-transaction count closes — pass different values.
 */
function service(
  prisma: Record<string, unknown> = {},
  rows: Record<string, ReturnType<typeof partner> | null> = {},
) {
  const log = jest.fn().mockResolvedValue(undefined);
  const events: string[] = [];
  const tx = {
    $queryRaw: jest.fn(() => {
      events.push('lock');
      return Promise.resolve([]);
    }),
    partner: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => {
        events.push(`count:${where.id}`);
        return Promise.resolve(rows[where.id] ?? null);
      }),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        events.push(`delete:${where.id}`);
        return Promise.resolve({ id: where.id });
      }),
    },
    partnerTimeline: {
      deleteMany: jest.fn(() => {
        events.push('timeline');
        return Promise.resolve({ count: 0 });
      }),
    },
  };
  const transaction = jest.fn(async (work: unknown) =>
    typeof work === 'function'
      ? (work as (client: typeof tx) => Promise<unknown>)(tx)
      : Promise.all(work as Array<Promise<unknown>>),
  );
  const client = { $transaction: transaction, ...prisma };
  return {
    log,
    tx,
    events,
    transaction,
    prisma: client,
    subject: new PartnerDeletionService(
      client as unknown as PrismaService,
      { log } as unknown as AuditService,
    ),
  };
}

/**
 * EXECPLAN-0055 D5. Every relation that would stop a delete is a named
 * refusal, decided inside the delete's own transaction.
 */
describe('partner deletion — every blocking relation refuses by name', () => {
  it.each([
    ['inquiries', 'the partner application it came from'],
    ['onboardingApplications', '1 onboarding application(s)'],
    ['previousAttributions', '1 lead attribution change(s)'],
    ['correctedAttributions', '1 lead attribution change(s)'],
    ['leadReviews', '1 lead review(s)'],
    ['supportCases', '1 support case(s)'],
    ['agreements', '1 agreement(s)'],
    ['portalUsers', '1 portal user(s)'],
    ['referralLinks', '1 referral link(s)'],
    ['commissions', '1 commission record(s)'],
    ['leads', '1 attributed lead(s)'],
    ['attributedCustomers', '1 attributed customer(s)'],
    ['attributedTenants', '1 attributed tenant(s)'],
  ])('refuses a partner with %s, naming it', async (relation, expected) => {
    const { subject, tx } = service({}, { a: partner('a', { [relation]: 1 }) });

    const result = await subject.deletePartners(user, ['a']);

    expect(result.deleted).toBe(0);
    expect(result.refused[0].reason).toContain(expected);
    expect(tx.partner.delete).not.toHaveBeenCalled();
    expect(tx.partnerTimeline.deleteMany).not.toHaveBeenCalled();
  });

  it('does not count the timeline as a blocker — it is deleted with the partner', async () => {
    const { subject, tx } = service({}, { a: partner('a', { timeline: 7 }) });

    const result = await subject.deletePartners(user, ['a']);

    expect(result.deleted).toBe(1);
    expect(tx.partnerTimeline.deleteMany).toHaveBeenCalledWith({
      where: { partnerId: 'a' },
    });
  });
});

describe('partner deletion — transaction', () => {
  it('locks the row, counts, then deletes — all inside one transaction', async () => {
    const { subject, events, transaction } = service({}, { a: partner('a') });

    await subject.deletePartners(user, ['a']);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['lock', 'count:a', 'timeline', 'delete:a']);
  });

  it('decides on the count taken inside the transaction, not before it', async () => {
    /*
     * The race: nothing blocked when the operator opened the dialog, and a
     * customer was attributed to the partner before they confirmed. Only the
     * in-transaction count sees it.
     */
    const { subject, tx } = service(
      {
        partner: {
          findUnique: jest.fn().mockResolvedValue(partner('a')),
        },
      },
      { a: partner('a', { attributedCustomers: 1 }) },
    );

    expect((await subject.describeDependencies('a')).canDelete).toBe(true);
    const result = await subject.deletePartners(user, ['a']);

    expect(result.deleted).toBe(0);
    expect(result.refused[0].reason).toContain('1 attributed customer(s)');
    expect(tx.partner.delete).not.toHaveBeenCalled();
  });

  it('reports a foreign-key failure mid-delete as a named refusal, not a database error', async () => {
    const { subject, tx } = service({}, { a: partner('a') });
    tx.partner.delete.mockRejectedValueOnce(
      Object.assign(new Error('Foreign key constraint violated'), {
        code: 'P2003',
      }),
    );

    const result = await subject.deletePartners(user, ['a']);

    expect(result.deleted).toBe(0);
    expect(result.refused).toHaveLength(1);
    expect(result.refused[0].label).toBe('Partner a');
    expect(result.refused[0].reason).toContain(
      'still referenced by other records',
    );
  });

  it('rethrows an error that is not a foreign-key refusal', async () => {
    const { subject, tx } = service({}, { a: partner('a') });
    tx.partner.delete.mockRejectedValueOnce(new Error('connection reset'));

    await expect(subject.deletePartners(user, ['a'])).rejects.toThrow(
      'connection reset',
    );
  });
});

describe('partner deletion — audit', () => {
  it('audits each deleted partner inside its transaction, with what cascaded', async () => {
    const { subject, log, tx } = service(
      {},
      { a: partner('a', { timeline: 3 }) },
    );

    await subject.deletePartners(user, ['a']);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PARTNER_DELETED',
        entityId: 'a',
        actorUserId: 'op-1',
        afterSnapshot: {
          deleted: true,
          cascaded: [{ key: 'timeline', count: 3 }],
        },
      }),
      tx,
    );
  });

  it('audits a refusal with the reason the operator was shown', async () => {
    const { subject, log } = service(
      {},
      { a: partner('a', { referralLinks: 2 }) },
    );

    const result = await subject.deletePartners(user, ['a']);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PARTNER_DELETE_REFUSED',
        afterSnapshot: {
          deletedCount: 0,
          refused: [{ id: 'a', reason: result.refused[0].reason }],
        },
      }),
    );
  });

  it('does not audit a request whose only id no longer exists', async () => {
    const { subject, log } = service({}, {});
    await subject.deletePartners(user, ['ghost']);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('partner dependencies endpoint', () => {
  it('answers the classification for a partner', async () => {
    const { subject } = service({
      partner: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            partner('a', { referralLinks: 1, attributedCustomers: 1 }),
          ),
      },
    });

    const report = await subject.describeDependencies('a');

    expect(report.canDelete).toBe(false);
    expect(report.dependencies.map((item) => item.key)).toEqual([
      'attributedCustomers',
      'referralLinks',
    ]);
    // The refusal phrase is an internal detail of the message.
    expect(report.dependencies[0]).not.toHaveProperty('phrase');
  });

  it('is a 404 for a partner that does not exist', async () => {
    const { subject } = service({
      partner: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(subject.describeDependencies('x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

/**
 * What may be deleted, and what must refuse.
 *
 * Delete existed on three modules out of eighteen, which reads as an oversight
 * and mostly is not: an invoice, a payment, a commission, an executed agreement
 * and a signature request are records the business has to be able to produce
 * later. The partner modules are the ones where deletion is genuinely the right
 * operator action and was never built — and even there, a partner that has
 * traded is not a tidy-up, it is revenue detached from the person owed for it.
 *
 * The two properties worth pinning: a dependency blocks *that row only*, and
 * every refusal names the dependency.
 */
describe('partner deletion', () => {
  describe('partners', () => {
    it('deletes a partner nothing depends on', async () => {
      const { subject, tx } = service({}, { a: partner('a') });

      const result = await subject.deletePartners(user, ['a']);

      expect(result.deleted).toBe(1);
      expect(result.refused).toEqual([]);
      expect(tx.partner.delete).toHaveBeenCalledWith({ where: { id: 'a' } });
    });

    it('refuses a partner that has traded, and names what stopped it', async () => {
      const { subject } = service(
        {},
        { a: partner('a', { commissions: 2, leads: 5 }) },
      );

      const result = await subject.deletePartners(user, ['a']);

      expect(result.deleted).toBe(0);
      expect(result.refused[0]?.reason).toContain('2 commission record(s)');
      expect(result.refused[0]?.reason).toContain('5 attributed lead(s)');
      /*
       * The partner's name, not its id. A refusal an operator has to look up is
       * a refusal they will re-attempt.
       */
      expect(result.refused[0]?.label).toBe('Partner a');
    });

    it('deletes the safe rows and keeps the rest of the selection', async () => {
      /*
       * Partial success is the contract, not an accident. "One of these twenty
       * has a commission, so none were deleted" makes the operator bisect the
       * selection by hand — the same information, and all of the work.
       */
      const { subject, tx } = service(
        {},
        {
          a: partner('a'),
          b: partner('b', { agreements: 1 }),
          c: partner('c'),
        },
      );

      const result = await subject.deletePartners(user, ['a', 'b', 'c']);

      expect(result.deleted).toBe(2);
      expect(tx.partner.delete.mock.calls.map(([arg]) => arg)).toEqual([
        { where: { id: 'a' } },
        { where: { id: 'c' } },
      ]);
      expect(result.refused.map((item) => item.id)).toEqual(['b']);
      expect(result.message).toContain('Deleted 2');
      expect(result.message).toContain('Kept 1');
    });

    it('never deletes when the whole selection is blocked', async () => {
      const { subject, tx } = service(
        {},
        { a: partner('a', { portalUsers: 1 }) },
      );

      const result = await subject.deletePartners(user, ['a']);

      expect(tx.partner.delete).not.toHaveBeenCalled();
      expect(result.message).toContain('Nothing was deleted');
    });

    it('reports an id that no longer exists rather than counting it deleted', async () => {
      /*
       * An operator told "20 deleted" when two were already gone has been told
       * something false about what their click did.
       */
      const { subject } = service({}, { a: partner('a') });

      const result = await subject.deletePartners(user, ['a', 'ghost']);

      expect(result.deleted).toBe(1);
      expect(result.refused).toEqual([
        { id: 'ghost', label: 'ghost', reason: 'it no longer exists' },
      ]);
    });

    it('refuses an empty selection instead of deleting everything', async () => {
      const { subject } = service();
      await expect(subject.deletePartners(user, [])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('collapses duplicate ids so a count cannot be inflated', async () => {
      const { subject, transaction } = service({}, { a: partner('a') });

      const result = await subject.deletePartners(user, ['a', 'a', 'a']);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(result.deleted).toBe(1);
    });
  });

  describe('partner inquiries', () => {
    it('deletes an inquiry that was never converted', async () => {
      const { subject } = service({
        partnerInquiry: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'i1',
              companyName: 'Acme',
              contactFirstName: 'A',
              contactLastName: 'B',
              partnerId: null,
            },
          ]),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      });

      expect((await subject.deletePartnerInquiries(user, ['i1'])).deleted).toBe(
        1,
      );
    });

    it('refuses one that became a partner, because it is that partner’s origin', async () => {
      const { subject } = service({
        partnerInquiry: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'i1',
              companyName: 'Acme',
              contactFirstName: 'A',
              contactLastName: 'B',
              partnerId: 'p1',
            },
          ]),
          deleteMany: jest.fn(),
        },
      });

      const result = await subject.deletePartnerInquiries(user, ['i1']);
      expect(result.deleted).toBe(0);
      expect(result.refused[0]?.reason).toContain('converted into a partner');
    });
  });

  describe('partner onboarding applications', () => {
    it('deletes an application whose partner never left draft', async () => {
      const { subject } = service({
        partnerOnboardingApplication: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'o1',
              status: 'DRAFT',
              partner: { id: 'p', displayName: 'Acme', status: 'DRAFT' },
            },
          ]),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      });

      expect(
        (await subject.deletePartnerOnboarding(user, ['o1'])).deleted,
      ).toBe(1);
    });

    it('refuses one that activated a partner', async () => {
      /*
       * It is the evidence for how that partner came to hold the terms they
       * hold — including their commission rate.
       */
      const { subject } = service({
        partnerOnboardingApplication: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'o1',
              status: 'APPROVED',
              partner: { id: 'p', displayName: 'Acme', status: 'ACTIVE' },
            },
          ]),
          deleteMany: jest.fn(),
        },
      });

      const result = await subject.deletePartnerOnboarding(user, ['o1']);
      expect(result.deleted).toBe(0);
      expect(result.refused[0]?.reason).toContain('activated the partner');
    });
  });
});
