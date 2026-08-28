import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';

/**
 * BUG-1757 — `DELETE` did not delete.
 *
 * The route was wired to `deactivatePromotion`: it answered 200 with the record
 * body while the row stayed exactly where it was, merely inactive. Because the
 * UI offered only Deactivate, there was no way to remove a promotion at all,
 * and a mistyped one was permanent.
 *
 * Not hard-deleting commercial records is a defensible policy and the reason it
 * was written that way — but that policy protects *history*, and a promotion
 * with no redemptions has none. So the line is drawn at redemption, and these
 * assertions are about where that line sits rather than about the verb.
 */

type PromotionRow = {
  id: string;
  name: string;
  redemptionCount: number;
};

function serviceWith(promotion: PromotionRow | null) {
  const deleted: string[] = [];
  const audited: unknown[] = [];
  const prisma = {
    promotion: {
      findUnique: jest.fn().mockResolvedValue(promotion),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        deleted.push(where.id);
        return promotion;
      }),
    },
  };
  const auditService = {
    log: jest.fn(async (entry: unknown) => {
      audited.push(entry);
    }),
  };
  const service = Object.create(
    SuperAdminService.prototype,
  ) as SuperAdminService;
  Object.assign(service, { prisma, auditService });
  return { service, prisma, auditService, deleted, audited };
}

const ACTOR = { userId: 'platform-user-1' } as never;

describe('BUG-1757 — deleting a promotion', () => {
  it('removes one that has never been redeemed', async () => {
    const { service, deleted } = serviceWith({
      id: 'promo-1',
      name: 'Launch offer',
      redemptionCount: 0,
    });

    await expect(service.deletePromotion(ACTOR, 'promo-1')).resolves.toEqual({
      success: true,
      id: 'promo-1',
    });
    expect(deleted).toEqual(['promo-1']);
  });

  it('refuses one that carries commercial history', async () => {
    const { service, prisma } = serviceWith({
      id: 'promo-2',
      name: 'Ramadan 20%',
      redemptionCount: 3,
    });

    await expect(service.deletePromotion(ACTOR, 'promo-2')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.promotion.delete).not.toHaveBeenCalled();
  });

  it('names the promotion and points at deactivation instead', async () => {
    // A refusal that does not say what to do next sends the operator back to
    // the button that never worked.
    const { service } = serviceWith({
      id: 'promo-2',
      name: 'Ramadan 20%',
      redemptionCount: 3,
    });

    await expect(service.deletePromotion(ACTOR, 'promo-2')).rejects.toThrow(
      /Ramadan 20%[\s\S]*redeemed 3 time\(s\)[\s\S]*Deactivate it instead/,
    );
  });

  it('records the deletion', async () => {
    const { service, audited } = serviceWith({
      id: 'promo-1',
      name: 'Launch offer',
      redemptionCount: 0,
    });

    await service.deletePromotion(ACTOR, 'promo-1');
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({
      tenantId: 'platform',
      action: 'platform.promotion_deleted',
      entityType: 'Promotion',
      entityId: 'promo-1',
      afterSnapshot: null,
    });
  });

  it('404s on a promotion that is not there', async () => {
    const { service } = serviceWith(null);
    await expect(service.deletePromotion(ACTOR, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
