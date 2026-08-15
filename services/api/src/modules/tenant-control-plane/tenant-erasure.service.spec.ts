import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, TenantStatus } from '@prisma/client';
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

/**
 * A transaction client that answers every model the erasure plan names, so the
 * dry run can run the real sequence end to end without a database.
 */
function transactionClientStub() {
  const delegate = {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
  };
  return new Proxy(
    { tenant: { ...delegate, delete: jest.fn().mockResolvedValue({}) } },
    {
      get: (target: Record<string, unknown>, key: string) =>
        target[key] ?? delegate,
    },
  );
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

  /*
   * The production report this suite failed to anticipate. The message that
   * reached the operator was "A record outside this tenant still references data
   * being erased" with no constraint and no table — because the diagnosis only
   * matched PostgreSQL's double-quoted phrasing, while the failure came from
   * Prisma, which uses backticks and puts the name in `meta`.
   */
  it('names the constraint when Prisma reports P2003 rather than PostgreSQL', async () => {
    const { service, prisma } = build();
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint violated on the constraint: `Payslip_payrollRunEmployeeId_fkey`',
      {
        code: 'P2003',
        clientVersion: '7.8.0',
        meta: {
          modelName: 'PayrollRunEmployee',
          field_name: 'Payslip_payrollRunEmployeeId_fkey (index)',
        },
      },
    );
    prisma.$transaction.mockRejectedValue(prismaError);

    await expect(
      service.erase(admin, 'tenant-1', validRequest),
    ).rejects.toThrow(/Payslip_payrollRunEmployeeId_fkey/);

    const update = prisma.tenantErasureReceipt.update.mock.calls.at(-1)![0] as {
      data: { erasedRecordCounts: Record<string, unknown> };
    };
    expect(update.data.erasedRecordCounts).toEqual(
      expect.objectContaining({
        constraint: 'Payslip_payrollRunEmployeeId_fkey (index)',
        prismaCode: 'P2003',
      }),
    );
  });

  it('still says which phase and model failed when nothing names the constraint', async () => {
    /*
     * Even a driver error that identifies nothing must leave the operator with
     * somewhere to look. The phase and model are always known here, and on their
     * own they point at the entry in the erasure plan.
     */
    const { service, prisma } = build();
    prisma.$transaction.mockImplementation(async (work: unknown) => {
      /* Run far enough to set the progress marker, then fail opaquely. */
      await (work as (tx: unknown) => Promise<unknown>)({
        contract: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      }).catch(() => undefined);
      const opaque = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint violated',
        { code: 'P2003', clientVersion: '7.8.0' },
      );
      throw opaque;
    });

    await expect(
      service.erase(admin, 'tenant-1', validRequest),
    ).rejects.toThrow(/Failed while/);
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

  describe('diagnose (dry run)', () => {
    it('never commits, even when the whole sequence succeeds', async () => {
      /*
       * The property that makes this safe to offer next to an irreversible
       * button: the transaction callback must always end by throwing, so there
       * is no path on which the deletes are kept.
       */
      const { service, prisma } = build();
      let threw = false;
      prisma.$transaction.mockImplementation(async (work: unknown) => {
        try {
          await (work as (tx: unknown) => Promise<unknown>)(
            transactionClientStub(),
          );
        } catch (error) {
          threw = true;
          throw error;
        }
        throw new Error('the dry run returned instead of rolling back');
      });

      const result = await service.diagnose(admin, 'tenant-1');

      expect(threw).toBe(true);
      expect(result.wouldSucceed).toBe(true);
      expect(result.blocker).toBeNull();
      expect(prisma.tenantErasureReceipt.create).not.toHaveBeenCalled();
    });

    it('reports the phase, model and constraint that would refuse', async () => {
      const { service, prisma } = build();
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint violated on the constraint: `Payslip_payrollRunEmployeeId_fkey`',
          { code: 'P2003', clientVersion: '7.8.0' },
        ),
      );

      const result = await service.diagnose(admin, 'tenant-1');

      expect(result.wouldSucceed).toBe(false);
      expect(result.blocker).toEqual(
        expect.objectContaining({
          constraint: 'Payslip_payrollRunEmployeeId_fkey',
          prismaCode: 'P2003',
          phase: expect.any(String),
        }),
      );
      /* A dry run is a question, not an event — it writes no receipt. */
      expect(prisma.tenantErasureReceipt.create).not.toHaveBeenCalled();
    });

    it('requires the same elevated platform role as the erasure itself', async () => {
      const { service } = build();
      await expect(
        service.diagnose(operator, 'tenant-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
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
