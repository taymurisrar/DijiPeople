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
    contractRelatedRecord: { findMany: jest.fn() },
    lead: { findMany: jest.fn() },
    partner: { findMany: jest.fn() },
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

  it('resolves a name and status for every linked contract record', async () => {
    prisma.contractRelatedRecord.findMany.mockResolvedValue([
      {
        id: 'link-1',
        entityType: 'Lead',
        entityId: 'lead-1',
        relationshipType: 'LEAD',
        createdAt: new Date('2026-08-13T02:07:36.000Z'),
      },
      {
        id: 'link-2',
        entityType: 'CustomerAccount',
        entityId: 'customer-gone',
        relationshipType: 'CUSTOMER',
        createdAt: new Date('2026-08-13T02:07:36.000Z'),
      },
    ]);
    prisma.lead.findMany.mockResolvedValue([
      {
        id: 'lead-1',
        companyName: 'Xoult Ltd',
        fullName: '',
        status: 'QUALIFIED',
      },
    ]);
    prisma.customerAccount.findMany.mockResolvedValue([]);

    const result = await service.findDirectRecords(
      'contracts',
      'contract-1',
      'relatedRecords',
    );

    expect(
      result?.records.map((record) => {
        const item = record as Record<string, unknown>;
        return {
          displayName: item.displayName,
          recordType: item.recordType,
          status: item.status,
        };
      }),
    ).toEqual([
      {
        displayName: 'Xoult Ltd',
        recordType: 'Lead',
        status: 'QUALIFIED',
      },
      {
        displayName: 'Customer Account customer',
        recordType: 'Customer Account',
        status: 'MISSING',
      },
    ]);
  });
});
