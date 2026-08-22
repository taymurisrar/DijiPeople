import { BadRequestException } from '@nestjs/common';

import { PartnerDeletionService } from './partner-deletion.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

const user = { userId: 'op-1' } as AuthenticatedUser;

function service(prisma: Record<string, unknown>) {
  const log = jest.fn().mockResolvedValue(undefined);
  return {
    log,
    subject: new PartnerDeletionService(
      prisma as unknown as PrismaService,
      { log } as unknown as AuditService,
    ),
  };
}

const partner = (id: string, counts: Partial<Record<string, number>> = {}) => ({
  id,
  displayName: `Partner ${id}`,
  status: 'DRAFT',
  _count: {
    leads: 0,
    commissions: 0,
    agreements: 0,
    referralLinks: 0,
    portalUsers: 0,
    ...counts,
  },
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
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      const { subject, log } = service({
        partner: {
          findMany: jest.fn().mockResolvedValue([partner('a')]),
          deleteMany,
        },
      });

      const result = await subject.deletePartners(user, ['a']);

      expect(result.deleted).toBe(1);
      expect(result.refused).toEqual([]);
      expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a'] } } });
      // A destructive bulk operation that leaves no audit row is one nobody can
      // explain afterwards.
      expect(log).toHaveBeenCalledTimes(1);
    });

    it('refuses a partner that has traded, and names what stopped it', async () => {
      const { subject } = service({
        partner: {
          findMany: jest
            .fn()
            .mockResolvedValue([partner('a', { commissions: 2, leads: 5 })]),
          deleteMany: jest.fn(),
        },
      });

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
      const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
      const { subject } = service({
        partner: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              partner('a'),
              partner('b', { agreements: 1 }),
              partner('c'),
            ]),
          deleteMany,
        },
      });

      const result = await subject.deletePartners(user, ['a', 'b', 'c']);

      expect(result.deleted).toBe(2);
      expect(deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['a', 'c'] } },
      });
      expect(result.refused.map((item) => item.id)).toEqual(['b']);
      expect(result.message).toContain('Deleted 2');
      expect(result.message).toContain('Kept 1');
    });

    it('never deletes when the whole selection is blocked', async () => {
      const deleteMany = jest.fn();
      const { subject, log } = service({
        partner: {
          findMany: jest
            .fn()
            .mockResolvedValue([partner('a', { portalUsers: 1 })]),
          deleteMany,
        },
      });

      const result = await subject.deletePartners(user, ['a']);

      expect(deleteMany).not.toHaveBeenCalled();
      expect(result.message).toContain('Nothing was deleted');
      // Nothing happened, so nothing is audited as having happened.
      expect(log).not.toHaveBeenCalled();
    });

    it('reports an id that no longer exists rather than counting it deleted', async () => {
      /*
       * An operator told "20 deleted" when two were already gone has been told
       * something false about what their click did.
       */
      const { subject } = service({
        partner: {
          findMany: jest.fn().mockResolvedValue([partner('a')]),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      });

      const result = await subject.deletePartners(user, ['a', 'ghost']);

      expect(result.deleted).toBe(1);
      expect(result.refused).toEqual([
        { id: 'ghost', label: 'ghost', reason: 'it no longer exists' },
      ]);
    });

    it('refuses an empty selection instead of deleting everything', async () => {
      /*
       * A `deleteMany` with an empty `in` clause is harmless; a future change
       * that dropped the clause would not be. This is the guard for that, and
       * it costs one line.
       */
      const { subject } = service({ partner: { findMany: jest.fn() } });
      await expect(subject.deletePartners(user, [])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('collapses duplicate ids so a count cannot be inflated', async () => {
      const findMany = jest.fn().mockResolvedValue([partner('a')]);
      const { subject } = service({
        partner: {
          findMany,
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      });

      await subject.deletePartners(user, ['a', 'a', 'a']);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['a'] } } }),
      );
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
