import { BadRequestException } from '@nestjs/common';
import { PlatformRuntimeRelationsService } from './platform-runtime-relations.service';

describe('PlatformRuntimeRelationsService', () => {
  const prisma = {
    contract: { findMany: jest.fn() },
    customerOnboarding: { findMany: jest.fn() },
    tenant: { findMany: jest.fn() },
    subscription: { findMany: jest.fn() },
    invoice: { findMany: jest.fn() },
    supportCase: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    tenantDomain: { findMany: jest.fn() },
    tenantFeature: { findMany: jest.fn() },
    tenantBranding: { findMany: jest.fn() },
    attendanceIntegrationConfig: { findMany: jest.fn() },
    customerAccount: { findMany: jest.fn() },
  };

  const service = new PlatformRuntimeRelationsService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejects relations outside the module catalog', () => {
    expect(() => service.assertAllowed('leads', 'tenants')).toThrow(
      BadRequestException,
    );
  });

  it('finds lead agreements through direct and explicit related-record links', async () => {
    prisma.contract.findMany.mockResolvedValue([{ id: 'agreement-1' }]);

    await expect(
      service.findDirectRecords('leads', 'lead-1', 'agreements'),
    ).resolves.toEqual({ records: [{ id: 'agreement-1' }] });
    expect(prisma.contract.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { relatedLeadId: 'lead-1' },
          {
            relatedRecords: {
              some: { entityType: 'Lead', entityId: 'lead-1' },
            },
          },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('queries all tenants attributed to a customer without assuming one-to-one ownership', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-1' },
      { id: 'tenant-2' },
    ]);

    await expect(
      service.findDirectRecords('customers', 'customer-1', 'tenants'),
    ).resolves.toEqual({
      records: [{ id: 'tenant-1' }, { id: 'tenant-2' }],
    });
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { customerAccountId: 'customer-1' },
      include: { subscription: { include: { plan: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('returns an allowlisted tenant-user projection with no credential fields', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.findDirectRecords('tenants', 'tenant-1', 'users');

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        isServiceAccount: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: [{ isServiceAccount: 'asc' }, { firstName: 'asc' }],
    });
  });
});
