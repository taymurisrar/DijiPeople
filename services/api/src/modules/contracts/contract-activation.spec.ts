import { ContractStatus } from '@prisma/client';
import { ContractsService } from './contracts.service';

const platformAdmin = {
  userId: 'user-1',
  tenantId: 'platform',
  email: 'admin@example.test',
  roleIds: [],
  roleKeys: [],
  permissionKeys: ['contracts.manage', 'contracts.read'],
  platform: { id: 'user-1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
} as never;

/*
 * CON-20261012-E7421CC1. Completing the last signature leaves an agreement
 * FULLY_EXECUTED, but activation was offered only from FULLY_SIGNED — a
 * status signing never produces — so an executed agreement could never
 * become Active.
 */
function harness(status: ContractStatus) {
  const contract = {
    id: 'contract-1',
    status,
    parties: [],
    versions: [],
    documents: [],
    placeholderValues: [],
    signatureRequests: [],
    relatedRecords: [],
  };
  const prisma = {
    contract: {
      findUnique: jest.fn().mockResolvedValue(contract),
      update: jest.fn().mockReturnValue('update'),
    },
    contractTimeline: { create: jest.fn().mockReturnValue('timeline') },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const service = new ContractsService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    { log: jest.fn() } as never,
  );
  return { service, prisma };
}

describe('activating a signed agreement', () => {
  it.each([ContractStatus.FULLY_EXECUTED, ContractStatus.FULLY_SIGNED])(
    'moves a %s agreement to ACTIVE and stamps activatedAt',
    async (status) => {
      const { service, prisma } = harness(status);
      await service.transitionStage(platformAdmin, 'contract-1', 'forward');
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: 'contract-1' },
        data: expect.objectContaining({
          status: ContractStatus.ACTIVE,
          activatedAt: expect.any(Date) as unknown,
        }) as unknown,
      });
      expect(prisma.contractTimeline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'STAGE_CHANGED',
            message: `Contract moved from ${status} to ACTIVE.`,
          }) as unknown,
        }),
      );
    },
  );

  it('still refuses to activate an agreement nobody has finished signing', async () => {
    const { service, prisma } = harness(ContractStatus.SENT);
    await expect(
      service.transitionStage(platformAdmin, 'contract-1', 'forward'),
    ).rejects.toThrow();
    expect(prisma.contract.update).not.toHaveBeenCalled();
  });
});
