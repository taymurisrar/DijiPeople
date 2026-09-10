import { NotFoundException } from '@nestjs/common';
import { Readable } from 'node:stream';
import {
  PayslipDeliveryStatus,
  PayslipStatus,
  PayrollRunLineItemCategory,
  Prisma,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PayslipsService } from './payslips.service';

const decimal = (value: number) => new Prisma.Decimal(value);

/**
 * A caller with TENANT-level PAYSLIPS access, used by every test that isn't
 * specifically exercising FILE-07's row-level narrowing. `own: true` requests
 * never consult this object at runtime — `getAuthorizedOwnPayslip` scopes by
 * `employeeId` instead — but `downloadPayslip` still requires it structurally
 * now that `findPayslipOrThrow` needs a full `AuthenticatedUser`.
 */
function buildAuthenticatedUser(
  overrides: Partial<AuthenticatedUser> = {},
): AuthenticatedUser {
  return {
    userId: 'ess-user-1',
    tenantId: 'tenant-1',
    email: 'ess-user-1@dijipeople.local',
    roleIds: [],
    roleKeys: [],
    permissionKeys: ['payslips.read-all', 'payslips.download'],
    rolePrivileges: [
      {
        entityKey: ENTITY_KEYS.PAYSLIPS,
        privilege: SecurityPrivilege.READ,
        accessLevel: SecurityAccessLevel.TENANT,
        roleId: 'role-1',
      },
    ],
    accessContext: {
      isSystemAdministrator: false,
      isSystemCustomizer: false,
      isTenantOwner: false,
      businessUnitId: 'bu-1',
      organizationId: 'org-1',
      teamIds: [],
      accessibleBusinessUnitIds: ['bu-1'],
      businessUnitSubtreeIds: ['bu-1'],
      canAccessAllBusinessUnits: false,
    },
    ...overrides,
  };
}

function publishedPayslip() {
  return {
    id: 'payslip-1',
    tenantId: 'tenant-1',
    payrollRunId: 'run-1',
    payrollRunEmployeeId: 'run-employee-1',
    employeeId: 'employee-1',
    payslipNumber: 'PS-202604-DP-ESS-001',
    status: PayslipStatus.PUBLISHED,
    deliveryStatus: PayslipDeliveryStatus.PENDING,
    deliveryAttempts: 0,
    deliveryError: null,
    deliveredAt: null,
    currencyCode: 'QAR',
    grossEarnings: decimal(12000),
    totalDeductions: decimal(1000),
    totalTaxes: decimal(500),
    totalReimbursements: decimal(350),
    employerContributions: decimal(600),
    netPay: decimal(10850),
    generatedAt: new Date('2026-04-30T00:00:00.000Z'),
    publishedAt: new Date('2026-04-30T00:00:00.000Z'),
    createdAt: new Date('2026-04-30T00:00:00.000Z'),
    updatedAt: new Date('2026-04-30T00:00:00.000Z'),
    employee: {
      id: 'employee-1',
      employeeCode: 'DP-ESS',
      firstName: 'Demo',
      lastName: 'Employee',
      email: 'employee@dijipeople.local',
    },
    payrollRun: {
      payrollPeriod: {
        name: 'April 2026 Payroll Validation',
        paymentDate: new Date('2026-04-30T00:00:00.000Z'),
        periodEnd: new Date('2026-04-30T00:00:00.000Z'),
        payrollCalendar: { name: 'Demo Monthly Payroll' },
      },
    },
    payrollRunEmployee: {
      grossEarnings: decimal(12000),
      totalDeductions: decimal(1000),
      totalTaxes: decimal(500),
      totalReimbursements: decimal(350),
      employerContributions: decimal(600),
      netPay: decimal(10850),
    },
    lineItems: [
      {
        id: 'line-1',
        category: PayrollRunLineItemCategory.EARNING,
        label: 'Basic Salary',
        quantity: decimal(1),
        rate: decimal(12000),
        amount: decimal(12000),
        payComponent: null,
      },
    ],
    eventLogs: [],
    document: {
      id: 'document-1',
      originalFileName: 'PS-202604-DP-ESS-001.pdf',
      mimeType: 'application/pdf',
      storageKey: 'tenant-1/payslips/PS-202604-DP-ESS-001.pdf',
    },
  };
}

describe('PayslipsService PDF download', () => {
  it('returns bank-proof PDF content and records event plus audit for own payslip', async () => {
    const payslip = publishedPayslip();
    const eventCreate = jest.fn().mockResolvedValue({});
    const audit = { log: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }),
      },
      payslip: { findFirst: jest.fn().mockResolvedValue(payslip) },
      payslipEventLog: { create: eventCreate },
    };
    const storage = {
      openFile: jest.fn().mockResolvedValue({
        stream: Readable.from(Buffer.from('%PDF-1.4 stored payslip')),
      }),
    };
    const service = new PayslipsService(
      prisma as never,
      audit as never,
      {} as never,
      {} as never,
      storage as never,
    );

    const file = await service.downloadPayslip({
      tenantId: 'tenant-1',
      payslipId: payslip.id,
      actorUserId: 'ess-user-1',
      currentUser: buildAuthenticatedUser(),
      own: true,
    });

    expect(file.contentType).toBe('application/pdf');
    expect(file.fileName).toBe('PS-202604-DP-ESS-001.pdf');
    expect(storage.openFile).toHaveBeenCalledWith(
      'tenant-1/payslips/PS-202604-DP-ESS-001.pdf',
      { kind: 'tenant', tenantId: 'tenant-1' },
    );
    expect(eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payslipId: payslip.id,
        eventType: 'DOWNLOADED',
        actorUserId: 'ess-user-1',
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PAYSLIP_DOWNLOADED',
        entityId: payslip.id,
        actorUserId: 'ess-user-1',
      }),
    );
  });

  it('does not expose another employee payslip through own-download scope', async () => {
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }),
      },
      payslip: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new PayslipsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.downloadPayslip({
        tenantId: 'tenant-1',
        payslipId: 'other-employee-payslip',
        actorUserId: 'ess-user-1',
        currentUser: buildAuthenticatedUser(),
        own: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.payslip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: 'employee-1',
          status: PayslipStatus.PUBLISHED,
        }),
      }),
    );
  });

  it('narrows a non-TENANT caller to their own scoped employees on the admin download path (FILE-07)', async () => {
    const payslip = publishedPayslip();
    const prisma = {
      payslip: { findFirst: jest.fn().mockResolvedValue(payslip) },
      payslipEventLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const audit = { log: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    const storage = {
      openFile: jest.fn().mockResolvedValue({
        stream: Readable.from(Buffer.from('%PDF-1.4 stored payslip')),
      }),
    };
    const service = new PayslipsService(
      prisma as never,
      audit as never,
      {} as never,
      {} as never,
      storage as never,
    );

    const teamScopedUser = buildAuthenticatedUser({
      userId: 'manager-1',
      rolePrivileges: [
        {
          entityKey: ENTITY_KEYS.PAYSLIPS,
          privilege: SecurityPrivilege.READ,
          accessLevel: SecurityAccessLevel.TEAM,
          roleId: 'role-manager',
        },
        {
          entityKey: ENTITY_KEYS.EMPLOYEES,
          privilege: SecurityPrivilege.READ,
          accessLevel: SecurityAccessLevel.TEAM,
          roleId: 'role-manager',
        },
      ],
    });

    await service.downloadPayslip({
      tenantId: 'tenant-1',
      payslipId: payslip.id,
      actorUserId: 'manager-1',
      currentUser: teamScopedUser,
    });

    // The query must no longer be `{ tenantId, id }` alone: a TEAM-scoped
    // caller has to be narrowed to the employees their role actually covers,
    // via the same `employee: { is: ... }` shape `DocumentsService` uses.
    expect(prisma.payslip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          id: payslip.id,
          employee: { is: expect.anything() },
        }),
      }),
    );
  });

  it('blocks a caller with no PAYSLIPS access from the admin download path (FILE-07)', async () => {
    const prisma = {
      payslip: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new PayslipsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const noAccessUser = buildAuthenticatedUser({
      userId: 'stranger-1',
      rolePrivileges: [],
    });

    await expect(
      service.downloadPayslip({
        tenantId: 'tenant-1',
        payslipId: 'payslip-1',
        actorUserId: 'stranger-1',
        currentUser: noAccessUser,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.payslip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: '__rbac_no_payslip_access__',
        }),
      }),
    );
  });
});
