import { BadRequestException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/**
 * TASK-0032 WP-09 QA found two lead defects on the live stack:
 *
 * 1. Bulk-deleting a lead whose attribution was ever corrected, or that an
 *    agreement or a partner review points at, reached Postgres and failed as a
 *    raw foreign-key error — a 500 "Unexpected error". Those relations are
 *    `onDelete: Restrict` history; the delete must refuse and say why.
 * 2. The lead record carried only the scalar `partnerId`, so the admin
 *    "Referral partner" field read "Not set" for every attributed lead.
 */

const superAdmin = {
  userId: 'sa',
  tenantId: 'platform',
  platform: { id: 'sa', role: 'SUPER_ADMIN' },
} as unknown as AuthenticatedUser;

function build(counts: {
  corrections?: number;
  agreements?: number;
  reviews?: number;
}) {
  const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    customerAccount: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    leadAttributionCorrection: {
      count: jest.fn().mockResolvedValue(counts.corrections ?? 0),
    },
    contract: {
      count: jest.fn().mockResolvedValue(counts.agreements ?? 0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    partnerLeadReview: {
      count: jest.fn().mockResolvedValue(counts.reviews ?? 0),
    },
    partner: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'p1',
        displayName: 'Northstar Growth Partners',
        type: 'COMPANY',
        status: 'ACTIVE',
      }),
    },
  };
  const repository = {
    deleteMany,
    findById: jest.fn().mockResolvedValue({
      id: 'lead-1',
      partnerId: 'p1',
      assignedToUserId: null,
    }),
  };
  const service = new LeadsService(
    repository as never,
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, deleteMany, prisma };
}

describe('lead bulk delete — restricted history refuses by name', () => {
  it.each([
    [{ corrections: 2 }, '2 attribution change(s)'],
    [{ agreements: 1 }, '1 agreement(s)'],
    [{ reviews: 3 }, '3 partner lead review(s)'],
  ])('refuses %j with a 400 naming it', async (counts, expected) => {
    const { service, deleteMany } = build(counts);

    const attempt = service.bulkDeleteLeads(superAdmin, ['lead-1']);

    await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.bulkDeleteLeads(superAdmin, ['lead-1']),
    ).rejects.toThrow(expected);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('deletes a lead with no restricted history', async () => {
    const { service, deleteMany } = build({});

    await expect(
      service.bulkDeleteLeads(superAdmin, ['lead-1']),
    ).resolves.toEqual({ deletedCount: 1 });
    expect(deleteMany).toHaveBeenCalledWith(['lead-1']);
  });
});

describe('lead record — the attributed partner is embedded', () => {
  it('returns the partner name, type and status, and nothing else about it', async () => {
    const { service, prisma } = build({});

    const lead = await service.getLead(superAdmin, 'lead-1');

    expect(lead.partner).toEqual({
      id: 'p1',
      displayName: 'Northstar Growth Partners',
      type: 'COMPANY',
      status: 'ACTIVE',
    });
    expect(prisma.partner.findUnique).toHaveBeenCalledWith({
      where: { id: 'p1' },
      select: { id: true, displayName: true, type: true, status: true },
    });
  });
});
