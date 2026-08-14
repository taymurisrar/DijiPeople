import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { TenantErasureService } from './tenant-erasure.service';
import { ERASE_TENANT_CONFIRMATION_PHRASE } from './dto/tenant-control-plane.dto';

const admin = {
  userId: 'platform-user-1',
  tenantId: 'platform',
  email: 'ops@dijipeople.com',
  roleIds: [],
  roleKeys: [],
  permissionKeys: [],
  platform: { id: 'platform-user-1', role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
} as unknown as AuthenticatedUser;

const operator = {
  ...admin,
  platform: { id: 'platform-user-2', role: 'SUPPORT_AGENT', status: 'ACTIVE' },
} as unknown as AuthenticatedUser;

const suspendedTenant = {
  id: 'tenant-1',
  name: 'Maseer Group',
  displayName: 'Maseer Group',
  legalName: null,
  slug: 'maseer',
  tenantCode: 'MAS-000001',
  status: TenantStatus.SUSPENDED,
  subStatus: 'Contract terminated',
  customerAccountId: 'customer-1',
  ownerUserId: 'owner-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function build(overrides: Record<string, unknown> = {}) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(suspendedTenant) },
    customerAccount: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'customer-1', companyName: 'Maseer Group' }),
    },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    invoice: { count: jest.fn().mockResolvedValue(0) },
    employee: { count: jest.fn().mockResolvedValue(12) },
    user: { count: jest.fn().mockResolvedValue(14) },
    document: {
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([]),
    },
    documentVersion: { findMany: jest.fn().mockResolvedValue([]) },
    contract: { count: jest.fn().mockResolvedValue(2) },
    supportCase: { count: jest.fn().mockResolvedValue(1) },
    payrollRun: { count: jest.fn().mockResolvedValue(0) },
    platformUser: { findUnique: jest.fn().mockResolvedValue(null) },
    tenantErasureReceipt: {
      create: jest.fn().mockResolvedValue({ id: 'receipt-1' }),
      update: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ id: 'receipt-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(),
    ...overrides,
  };
  const service = new TenantErasureService(
    prisma as never,
    { deleteFile: jest.fn() } as never,
    { log: jest.fn() } as never,
    { record: jest.fn() } as never,
  );
  return { service, prisma };
}

const validRequest = {
  reason: 'Contract terminated and customer requested deletion.',
  confirmTenantName: 'Maseer Group',
  confirmPhrase: ERASE_TENANT_CONFIRMATION_PHRASE,
  acknowledged: true,
};

/**
 * Erasure has no undo, so what is tested here is the set of things that must
 * stop it, and the guarantee that a failure leaves the tenant intact.
 */
describe('TenantErasureService', () => {
  it('requires an elevated platform role, not just tenant write permission', async () => {
    const { service, prisma } = build();
    await expect(
      service.erase(operator, 'tenant-1', validRequest),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a mistyped tenant name', async () => {
    const { service, prisma } = build();
    await expect(
      service.erase(admin, 'tenant-1', {
        ...validRequest,
        confirmTenantName: 'Maseer',
      }),
    ).rejects.toThrow(/typed tenant name does not match/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a wrong confirmation phrase', async () => {
    const { service, prisma } = build();
    await expect(
      service.erase(admin, 'tenant-1', {
        ...validRequest,
        confirmPhrase: 'DELETE TENANT',
      }),
    ).rejects.toThrow(/ERASE TENANT/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses without the irreversibility acknowledgement', async () => {
    const { service } = build();
    await expect(
      service.erase(admin, 'tenant-1', {
        ...validRequest,
        acknowledged: false,
      }),
    ).rejects.toThrow(/acknowledgement is required/);
  });

  it('blocks an active tenant so suspension or decommissioning comes first', async () => {
    const { service, prisma } = build({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          ...suspendedTenant,
          status: TenantStatus.ACTIVE,
        }),
      },
    });
    await expect(
      service.erase(admin, 'tenant-1', validRequest),
    ).rejects.toThrow(/Suspend or decommission/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks a tenant whose subscription is still live', async () => {
    const { service } = build({
      subscription: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' }),
      },
    });
    await expect(
      service.erase(admin, 'tenant-1', validRequest),
    ).rejects.toThrow(/Cancel it before erasing/);
  });

  it('requires an explicit acknowledgement when unpaid invoices exist', async () => {
    const { service } = build({
      invoice: { count: jest.fn().mockResolvedValue(2) },
    });
    await expect(
      service.erase(admin, 'tenant-1', validRequest),
    ).rejects.toThrow(/outstanding billing/);

    const { service: second, prisma } = build({
      invoice: { count: jest.fn().mockResolvedValue(2) },
    });
    prisma.$transaction.mockResolvedValue({ erased: {}, retained: {} });
    await expect(
      second.erase(admin, 'tenant-1', {
        ...validRequest,
        acknowledgeOutstandingBilling: true,
      }),
    ).resolves.toEqual(expect.objectContaining({ success: true }));
  });

  it('records a failed receipt and erases nothing when the transaction fails', async () => {
    const { service, prisma } = build();
    prisma.$transaction.mockRejectedValue(new Error('deadlock detected'));

    await expect(
      service.erase(admin, 'tenant-1', validRequest),
    ).rejects.toThrow(/nothing was deleted/);

    expect(prisma.tenantErasureReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureMessage: expect.stringContaining('deadlock detected'),
        }),
      }),
    );
  });

  /*
   * A rolled-back erasure used to surface a bare Postgres constraint name, which
   * is true and unusable. The diagnosis has to name what a person should do next.
   */
  it('explains a referential failure instead of quoting Postgres at the operator', async () => {
    const { service, prisma } = build();
    prisma.$transaction.mockRejectedValue(
      new Error(
        'update or delete on table "ErrorLog" violates RESTRICT setting of foreign key constraint "SupportCaseIncident_errorLogId_fkey" on table "SupportCaseIncident"',
      ),
    );

    await expect(
      service.erase(admin, 'tenant-1', validRequest),
    ).rejects.toThrow(/still references data being erased/);

    const update = prisma.tenantErasureReceipt.update.mock.calls.at(-1)![0] as {
      data: { erasedRecordCounts: Record<string, unknown> };
    };
    expect(update.data.erasedRecordCounts).toEqual(
      expect.objectContaining({
        constraint: 'SupportCaseIncident_errorLogId_fkey',
        failedAtPhase: expect.any(String),
      }),
    );
  });

  it('names the table still holding a reference so the plan can be corrected', async () => {
    const { service, prisma } = build();
    prisma.$transaction.mockRejectedValue(
      new Error(
        'update or delete on table "Invoice" violates foreign key constraint "SupportCase_invoiceId_fkey" on table "SupportCase"',
      ),
    );

    await expect(
      service.erase(admin, 'tenant-1', validRequest),
    ).rejects.toThrow(/SupportCase/);
  });

  it('writes a receipt that names the tenant, actor and reason before deleting', async () => {
    const { service, prisma } = build();
    prisma.$transaction.mockResolvedValue({
      erased: { employee: 12, tenant: 1 },
      retained: { contract: 2 },
    });

    await service.erase(admin, 'tenant-1', validRequest);

    expect(prisma.tenantErasureReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          tenantName: 'Maseer Group',
          tenantSlug: 'maseer',
          customerAccountId: 'customer-1',
          reason: validRequest.reason,
          status: 'IN_PROGRESS',
        }),
      }),
    );
    expect(prisma.tenantErasureReceipt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          erasedRecordCounts: { employee: 12, tenant: 1 },
          retainedRecordCounts: { contract: 2 },
        }),
      }),
    );
  });

  it('reports blockers, impact and what survives before anything is typed', async () => {
    const { service } = build();
    const preflight = await service.preflight(admin, 'tenant-1');

    expect(preflight.confirmationPhrase).toBe(ERASE_TENANT_CONFIRMATION_PHRASE);
    expect(preflight.blockers).toEqual([]);
    expect(preflight.impact.employees).toBe(12);
    expect(preflight.retained).toEqual({ contracts: 2, supportCases: 1 });
  });

  it('rejects an unauthenticated platform caller outright', async () => {
    const { service } = build();
    await expect(
      service.preflight(
        { ...admin, platform: undefined } as unknown as AuthenticatedUser,
        'tenant-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('surfaces a bad request rather than a silent partial delete', async () => {
    const { service, prisma } = build();
    prisma.$transaction.mockRejectedValue(
      new Error('Erasure order names ghostModel, which is not a Prisma model'),
    );
    await expect(
      service.erase(admin, 'tenant-1', validRequest),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
