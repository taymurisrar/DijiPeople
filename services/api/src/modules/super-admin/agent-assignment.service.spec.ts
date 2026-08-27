import { NotFoundException } from '@nestjs/common';
import { ApplicationReleaseChannel } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { SuperAdminService } from './super-admin.service';

/**
 * Desktop-agent rollout (TASK-0027): a tenant follows a channel via its
 * TenantAppAssignment, and every change is audited to the platform log.
 */
describe('SuperAdminService desktop-agent rollout', () => {
  const prisma = {
    tenant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    tenantAppAssignment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const auditService = { log: jest.fn() };

  const service = new SuperAdminService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    auditService as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists every tenant, defaulting an unassigned tenant to STABLE and disabled', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: 't1', name: 'Acme', displayName: 'Acme Inc', slug: 'acme' },
      { id: 't2', name: 'Beta Co', displayName: null, slug: 'beta' },
    ]);
    prisma.tenantAppAssignment.findMany.mockResolvedValue([
      {
        tenantId: 't1',
        appKey: 'AGENT_DESKTOP',
        isEnabled: true,
        channel: ApplicationReleaseChannel.BETA,
        updatePolicy: 'AUTOMATIC',
      },
    ]);

    const result = await service.listAgentAssignments();

    expect(prisma.tenantAppAssignment.findMany).toHaveBeenCalledWith({
      where: { appKey: 'AGENT_DESKTOP' },
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        tenantId: 't1',
        name: 'Acme Inc',
        isAssigned: true,
        isEnabled: true,
        channel: ApplicationReleaseChannel.BETA,
      }),
      expect.objectContaining({
        tenantId: 't2',
        name: 'Beta Co',
        isAssigned: false,
        isEnabled: false,
        channel: ApplicationReleaseChannel.STABLE,
      }),
    ]);
  });

  it('upserts the assignment on the agent app key and audits it to the platform log', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 't1' });
    prisma.tenantAppAssignment.findUnique.mockResolvedValue(null);
    prisma.tenantAppAssignment.upsert.mockResolvedValue({
      id: 'assign-1',
      tenantId: 't1',
      isEnabled: true,
      channel: ApplicationReleaseChannel.STABLE,
    });

    await service.setAgentAssignment(platformUser(), 't1', {
      isEnabled: true,
      channel: ApplicationReleaseChannel.STABLE,
    });

    expect(prisma.tenantAppAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_appKey: { tenantId: 't1', appKey: 'AGENT_DESKTOP' } },
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'platform',
        action: 'platform.tenant_agent_assignment_updated',
        entityType: 'TenantAppAssignment',
      }),
    );
  });

  it('rejects an assignment for a tenant that does not exist', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(
      service.setAgentAssignment(platformUser(), 'missing', {
        isEnabled: true,
        channel: ApplicationReleaseChannel.STABLE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.tenantAppAssignment.upsert).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });
});

function platformUser(): AuthenticatedUser {
  return {
    userId: 'platform-user-1',
    tenantId: 'platform',
    email: 'admin@dijipeople.local',
    roleIds: ['SUPER_ADMIN'],
    roleKeys: ['SUPER_ADMIN'],
    permissionKeys: ['platform.*'],
    platform: {
      id: 'platform-user-1',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  };
}
