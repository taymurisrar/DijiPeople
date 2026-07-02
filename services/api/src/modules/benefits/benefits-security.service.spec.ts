/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import {
  BenefitRenewalPeriod,
  BenefitType,
  BenefitValueType,
  EmployeeBenefitStatus,
  Prisma,
} from '@prisma/client';
import { BenefitsService } from './benefits.service';

describe('BenefitsService ESS security and audit', () => {
  it('hides admin-only financial values from ESS', async () => {
    const assignment = assignmentRecord();
    const service = fixture(assignment).service;

    const result = await service.listAssignments(
      {
        tenantId: 'tenant-1',
        userId: 'employee-user-1',
        permissionKeys: ['benefits.read-own'],
      } as never,
      {},
      true,
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        fixedAmountOverride: null,
        allocatedBalance: null,
        consumedBalance: null,
      }),
    );
    expect(result[0]?.benefitPolicy.fixedAmount).toBeNull();
  });

  it('records consumption and audits the balance change', async () => {
    const assignment = assignmentRecord({
      benefitPolicy: {
        ...assignmentRecord().benefitPolicy,
        sensitive: false,
      },
    });
    const { service, audit, tx } = fixture(assignment);

    await service.consume(
      {
        tenantId: 'tenant-1',
        userId: 'payroll-1',
        permissionKeys: [],
      } as never,
      assignment.id,
      { amount: 100 },
    );

    expect(tx.benefitConsumption.create).toHaveBeenCalled();
    expect(tx.employeeBenefitAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consumedBalance: new Prisma.Decimal(300),
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMPLOYEE_BENEFIT_CONSUMED' }),
    );
  });

  it('applies an optional override only after generic approval completes', async () => {
    const assignment = assignmentRecord({
      approvalRequestId: 'approval-1',
      pendingAction: 'OVERRIDE',
      pendingPayload: { fixedAmountOverride: 750 },
    });
    const { service, approvals, tx } = fixture(assignment);
    approvals.action.mockResolvedValue({ status: 'APPROVED' });

    await service.actionApproval(
      {
        tenantId: 'tenant-1',
        userId: 'approver-1',
        permissionKeys: [],
      } as never,
      assignment.id,
      'APPROVED',
    );

    expect(approvals.action).toHaveBeenCalledWith(
      expect.objectContaining({ approvalRequestId: 'approval-1' }),
      tx,
    );
    expect(tx.employeeBenefitAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fixedAmountOverride: new Prisma.Decimal(750),
          pendingAction: null,
        }),
      }),
    );
  });
});

function fixture(assignment: ReturnType<typeof assignmentRecord>) {
  const tx = {
    benefitConsumption: { create: jest.fn().mockResolvedValue({}) },
    employeeBenefitAssignment: {
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...assignment, ...data }),
        ),
    },
  };
  const prisma = {
    employee: { findFirst: jest.fn().mockResolvedValue({ id: 'employee-1' }) },
    employeeBenefitAssignment: {
      findMany: jest.fn().mockResolvedValue([assignment]),
      findFirst: jest.fn().mockResolvedValue(assignment),
    },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  const audit = { log: jest.fn().mockResolvedValue({}) };
  const approvals = { action: jest.fn() };
  return {
    tx,
    audit,
    approvals,
    service: new BenefitsService(
      prisma as never,
      {} as never,
      audit as never,
      {} as never,
      approvals as never,
    ),
  };
}

function assignmentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assignment-1',
    tenantId: 'tenant-1',
    employeeId: 'employee-1',
    benefitPolicyId: 'policy-1',
    approvalRequestId: null,
    pendingAction: null,
    pendingPayload: null,
    status: EmployeeBenefitStatus.ACTIVE,
    assignmentSource: 'MANUAL',
    isManualOverride: true,
    fixedAmountOverride: new Prisma.Decimal(500),
    percentageOverride: null,
    currencyCodeOverride: null,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    renewalDate: null,
    expiryDate: null,
    allocatedBalance: new Prisma.Decimal(1000),
    consumedBalance: new Prisma.Decimal(200),
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: 'hr-1',
    updatedById: 'hr-1',
    employee: {
      id: 'employee-1',
      employeeCode: 'E-1',
      firstName: 'Demo',
      lastName: 'Employee',
      userId: 'employee-user-1',
    },
    benefitPolicy: {
      id: 'policy-1',
      code: 'PRIVATE',
      name: 'Private benefit',
      benefitType: BenefitType.PERK,
      valueType: BenefitValueType.FIXED_AMOUNT,
      fixedAmount: new Prisma.Decimal(500),
      percentage: null,
      defaultBalance: new Prisma.Decimal(1000),
      sensitive: true,
      employeeVisible: true,
      renewalPeriod: BenefitRenewalPeriod.NONE,
    },
    consumptions: [],
    approvalRequest: null,
    ...overrides,
  };
}
