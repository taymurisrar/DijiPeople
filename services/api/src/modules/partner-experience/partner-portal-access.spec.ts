import { NotFoundException } from '@nestjs/common';
import { PartnerExperienceService } from './partner-experience.service';

const actor = {
  userId: 'partner-user-a',
  partnerId: 'partner-a',
  email: 'user-a@example.test',
} as never;

function serviceWith(prisma: Record<string, unknown>) {
  return new PartnerExperienceService(
    {
      partnerPortalUser: {
        findFirst: jest.fn(async () => ({
          id: 'partner-user-a',
          partnerId: 'partner-a',
          status: 'ACTIVE',
          partner: { id: 'partner-a', status: 'ACTIVE' },
        })),
      },
      ...prisma,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      resolvePublished: jest.fn(async () => null),
      acknowledge: jest.fn(),
    } as never,
  );
}

describe('partner portal record isolation', () => {
  it('always scopes referred lead queries to the authenticated partner', async () => {
    const findMany = jest.fn(async () => []);
    const service = serviceWith({ lead: { findMany } });

    await service.listPartnerLeads(actor);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { partnerId: 'partner-a' } }),
    );
  });

  it('does not expose an agreement belonging to another partner', async () => {
    const findFirst = jest.fn(async () => null);
    const service = serviceWith({ contract: { findFirst } });

    await expect(
      service.getPartnerContract(actor, 'contract-for-partner-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'contract-for-partner-b',
          partnerId: 'partner-a',
        },
      }),
    );
  });

  it('rejects manual Lead creation from the Partner portal', async () => {
    const service = serviceWith({});

    await expect(service.createPartnerLead(actor, {} as never)).rejects.toThrow(
      'cannot create leads manually',
    );
  });
});
