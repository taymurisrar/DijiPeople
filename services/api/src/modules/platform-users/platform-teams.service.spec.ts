import { BadRequestException, ConflictException } from '@nestjs/common';
import { PlatformUserStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PlatformTeamsService } from './platform-teams.service';

const actor = {
  userId: 'actor',
  tenantId: 'platform',
  platform: { id: 'actor', status: PlatformUserStatus.ACTIVE },
} as unknown as AuthenticatedUser;

function build() {
  const prisma = {
    platformTeam: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    platformTeamMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    platformUser: { findUnique: jest.fn() },
    supportCase: {
      count: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    },
    recordAssignmentRule: { count: jest.fn(), updateMany: jest.fn() },
    platformAuditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((work: (tx: unknown) => unknown) =>
    work(prisma),
  );
  prisma.supportCase.groupBy.mockResolvedValue([]);
  const service = new PlatformTeamsService(prisma as never);
  return { prisma, service };
}

const team = (over: Record<string, unknown> = {}) => ({
  id: 'team-1',
  name: 'Billing',
  description: null,
  category: 'SUPPORT',
  isActive: true,
  email: null,
  sortOrder: 0,
  leadUserId: null,
  leadUser: null,
  members: [],
  archivedAt: null,
  ...over,
});

describe('PlatformTeamsService', () => {
  it('refuses a name that differs only by case', async () => {
    const { prisma, service } = build();
    prisma.platformTeam.findFirst.mockResolvedValue({ id: 'other' });

    await expect(
      service.create(actor, { name: '  BILLING ' }),
    ).rejects.toMatchObject({
      response: { code: 'PLATFORM_TEAM_NAME_TAKEN' },
    });
    const [lookup] = prisma.platformTeam.findFirst.mock.calls[0] as [
      { where: { name: unknown } },
    ];
    expect(lookup.where.name).toEqual({
      equals: 'BILLING',
      mode: 'insensitive',
    });
    expect(prisma.platformTeam.create).not.toHaveBeenCalled();
  });

  describe('archive', () => {
    it('is refused with counts when open cases or active rules use the team', async () => {
      const { prisma, service } = build();
      prisma.platformTeam.findUnique.mockResolvedValue(team());
      prisma.supportCase.count.mockResolvedValue(3);
      prisma.recordAssignmentRule.count.mockResolvedValue(1);

      const archiving = service.archive(actor, 'team-1', {});

      await expect(archiving).rejects.toBeInstanceOf(ConflictException);
      await expect(archiving).rejects.toMatchObject({
        response: {
          code: 'PLATFORM_TEAM_IN_USE',
          details: { openCaseCount: 3, activeRuleCount: 1 },
        },
      });
      expect(prisma.platformTeam.update).not.toHaveBeenCalled();
    });

    it('moves open cases and active rules to the chosen team in one transaction', async () => {
      const { prisma, service } = build();
      prisma.platformTeam.findUnique.mockResolvedValue(team());
      prisma.platformTeam.findFirst.mockResolvedValue(
        team({ id: 'team-2', name: 'Engineering' }),
      );
      prisma.supportCase.count.mockResolvedValue(2);
      prisma.recordAssignmentRule.count.mockResolvedValue(1);
      prisma.supportCase.updateMany.mockResolvedValue({ count: 2 });
      prisma.recordAssignmentRule.updateMany.mockResolvedValue({ count: 1 });

      await service.archive(actor, 'team-1', { reassignToTeamId: 'team-2' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.supportCase.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { assignedTeamId: 'team-2', assignedTeam: 'Engineering' },
        }),
      );
      expect(prisma.recordAssignmentRule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { targetTeamId: 'team-1', isActive: true },
        }),
      );
      const [archived] = prisma.platformTeam.update.mock.calls[0] as [
        { data: { isActive: boolean } },
      ];
      expect(archived.data.isActive).toBe(false);
      expect(prisma.platformAuditLog.create).toHaveBeenCalled();
    });

    it('archives an unused team without a reassignment target', async () => {
      const { prisma, service } = build();
      prisma.platformTeam.findUnique.mockResolvedValue(team());
      prisma.supportCase.count.mockResolvedValue(0);
      prisma.recordAssignmentRule.count.mockResolvedValue(0);

      await service.archive(actor, 'team-1', {});

      expect(prisma.supportCase.updateMany).not.toHaveBeenCalled();
      expect(prisma.platformTeam.update).toHaveBeenCalled();
    });
  });

  it('refuses to delete a team any case or rule references', async () => {
    const { prisma, service } = build();
    prisma.platformTeam.findUnique.mockResolvedValue(team());
    prisma.supportCase.count.mockResolvedValue(1);
    prisma.recordAssignmentRule.count.mockResolvedValue(0);

    await expect(service.remove(actor, 'team-1')).rejects.toMatchObject({
      response: {
        code: 'PLATFORM_TEAM_IN_USE',
        details: { caseCount: 1, ruleCount: 0 },
      },
    });
    expect(prisma.platformTeam.delete).not.toHaveBeenCalled();
  });

  it('refuses to add an inactive platform user', async () => {
    const { prisma, service } = build();
    prisma.platformTeam.findUnique.mockResolvedValue(team());
    prisma.platformUser.findUnique.mockResolvedValue({
      id: 'u1',
      status: PlatformUserStatus.DISABLED,
    });

    const adding = service.addMember(actor, 'team-1', {
      platformUserId: 'u1',
    });

    await expect(adding).rejects.toBeInstanceOf(BadRequestException);
    await expect(adding).rejects.toMatchObject({
      response: { code: 'PLATFORM_USER_NOT_ACTIVE' },
    });
    expect(prisma.platformTeamMember.create).not.toHaveBeenCalled();
  });

  it('lists eligible assignees in a deterministic order', async () => {
    const { prisma, service } = build();
    prisma.platformTeamMember.findMany.mockResolvedValue([
      {
        id: 'm1',
        platformUserId: 'u1',
        platformUser: { firstName: 'A', lastName: 'B', email: 'a@x.io' },
      },
    ]);

    const result = await service.listEligibleAssignees('team-1');

    expect(prisma.platformTeamMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teamId: 'team-1',
          receivesAssignments: true,
          platformUser: { status: PlatformUserStatus.ACTIVE },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(result).toEqual([
      {
        memberId: 'm1',
        platformUserId: 'u1',
        fullName: 'A B',
        email: 'a@x.io',
      },
    ]);
  });
});
