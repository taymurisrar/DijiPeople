/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import {
  ApprovalRequestStatus,
  ClaimRequestStatus,
  Prisma,
} from '@prisma/client';
import { ClaimsService } from './claims.service';

const user = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  permissionKeys: ['claims.update'],
};

describe('ClaimsService generic approval workflow', () => {
  it('resolves claim conditions and creates the tracker in the submission transaction', async () => {
    const claim = claimRecord(ClaimRequestStatus.DRAFT);
    const route = [
      {
        sequence: 1,
        approvalMode: 'ANY_ONE',
        candidateUserIds: ['approver-1'],
      },
    ];
    const fixture = serviceFixture(claim);
    fixture.resolver.resolveApprovalRoute.mockResolvedValue(route);

    await fixture.service.submitClaim(user as never, claim.id);

    expect(fixture.resolver.resolveApprovalRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        recordType: 'claimRequest',
        conditionContext: expect.objectContaining({
          amount: '350',
          claimTypeIds: ['claim-type-1'],
          currencyCode: 'QAR',
        }),
        scopeContext: expect.objectContaining({
          organizationId: 'org-1',
          businessUnitId: 'bu-1',
          departmentId: 'department-1',
          employeeId: 'employee-1',
        }),
      }),
    );
    expect(fixture.approvals.createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleKey: 'claim',
        entityType: 'claimRequest',
        steps: route,
      }),
      fixture.tx,
    );
    expect(fixture.notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: 'CLAIM_APPROVAL_REQUESTED' }),
    );
  });

  it('makes a claim payroll-eligible only after the generic route is complete', async () => {
    const claim = claimRecord(ClaimRequestStatus.SUBMITTED);
    const fixture = serviceFixture(claim);
    fixture.approvals.action.mockResolvedValue({
      status: ApprovalRequestStatus.APPROVED,
    });

    const result = await fixture.service.approveManager(
      user as never,
      claim.id,
      { comments: 'Approved' },
    );

    expect(fixture.approvals.action).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalRequestId: 'approval-1',
        action: 'APPROVED',
      }),
      fixture.tx,
    );
    expect(fixture.tx.claimRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ClaimRequestStatus.PAYROLL_APPROVED,
          payrollApprovedAt: expect.any(Date),
        }),
      }),
    );
    expect(result.status).toBe(ClaimRequestStatus.PAYROLL_APPROVED);
    expect(fixture.notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: 'CLAIM_APPROVED' }),
    );
  });
});

function serviceFixture(claim: ReturnType<typeof claimRecord>) {
  const tx = {
    claimRequest: {
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...claim,
          ...data,
        }),
      ),
    },
  };
  const prisma = {
    claimRequest: {
      findFirst: jest.fn().mockResolvedValue(claim),
    },
    approvalRequest: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'approval-1',
        status: ApprovalRequestStatus.PENDING,
      }),
    },
    approvalAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback) => callback(tx)),
  };
  const audit = { log: jest.fn().mockResolvedValue({}) };
  const resolver = { resolveApprovalRoute: jest.fn() };
  const approvals = {
    createWorkflow: jest.fn().mockResolvedValue({}),
    action: jest.fn(),
    cancel: jest.fn(),
  };
  const notifications = { emit: jest.fn().mockResolvedValue({}) };
  return {
    tx,
    resolver,
    approvals,
    notifications,
    service: new ClaimsService(
      prisma as never,
      audit as never,
      resolver as never,
      approvals as never,
      notifications as never,
    ),
  };
}

function claimRecord(status: ClaimRequestStatus) {
  return {
    id: 'claim-1',
    tenantId: 'tenant-1',
    employeeId: 'employee-1',
    submittedByUserId: 'user-1',
    status,
    title: 'Travel reimbursement',
    description: null,
    submittedAmount: new Prisma.Decimal(350),
    approvedAmount: new Prisma.Decimal(350),
    currencyCode: 'QAR',
    submittedAt: null,
    managerApprovedAt: null,
    payrollApprovedAt: null,
    rejectedAt: null,
    includedInPayrollAt: null,
    paidAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    employee: {
      id: 'employee-1',
      employeeCode: 'E-1',
      firstName: 'Aisha',
      lastName: 'Rahman',
      userId: 'employee-user-1',
      managerEmployeeId: 'manager-1',
      departmentId: 'department-1',
      businessUnitId: 'bu-1',
      employeeLevelId: 'level-1',
      manager: { id: 'manager-1', userId: 'manager-user-1' },
      businessUnit: { organizationId: 'org-1' },
    },
    lineItems: [
      {
        id: 'line-1',
        tenantId: 'tenant-1',
        claimRequestId: 'claim-1',
        employeeId: 'employee-1',
        claimTypeId: 'claim-type-1',
        claimSubTypeId: null,
        transactionDate: new Date('2026-04-02'),
        vendor: null,
        description: null,
        amount: new Prisma.Decimal(350),
        approvedAmount: new Prisma.Decimal(350),
        currencyCode: 'QAR',
        receiptDocumentId: null,
        payrollRunEmployeeId: null,
        payrollIncludedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        claimType: { id: 'claim-type-1', code: 'TRAVEL', name: 'Travel' },
        claimSubType: null,
        receiptDocument: null,
      },
    ],
    approvals: [],
  };
}
