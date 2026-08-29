import { AUDIT_ACTIONS } from '../../common/constants/audit-actions';
import { LeavePolicyResolverService } from './leave-policy-resolver.service';
import { LeaveService } from './leave.service';

/**
 * BUG-2044 — the leave module audited the decision and not the request.
 *
 * The log could show `LEAVE_REQUEST_APPROVED` with no record of the request
 * ever having been made, and none of the configuration that governs leave —
 * types, policies, policy rules, policy assignments — wrote a row at all.
 */

const currentUser = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  roleIds: ['role-1'],
  roleKeys: ['system-admin'],
  permissionKeys: ['leave.manage'],
} as never;

function createService() {
  const auditService = { log: jest.fn() };
  const leaveRepository = {
    createLeaveType: jest.fn().mockResolvedValue({
      id: 'leave-type-1',
      name: 'Annual Leave',
      consumesBalance: true,
    }),
    updateLeaveType: jest.fn().mockResolvedValue({ count: 1 }),
    findLeaveTypeById: jest.fn().mockResolvedValue({
      id: 'leave-type-1',
      name: 'Annual Leave',
      code: 'ANNUAL',
      category: 'ANNUAL',
      isPaid: true,
      affectsPayroll: false,
      consumesBalance: true,
      employeeRequestAllowed: true,
      requiresAttachment: false,
      allowHalfDay: true,
      allowHourlyLeave: false,
      requiresApproval: true,
      isActive: true,
    }),
    createLeavePolicy: jest.fn().mockResolvedValue({
      id: 'leave-policy-1',
      name: 'Default',
    }),
    updateLeavePolicy: jest.fn().mockResolvedValue({ count: 1 }),
    findLeavePolicyById: jest.fn().mockResolvedValue({
      id: 'leave-policy-1',
      name: 'Default',
      isActive: true,
    }),
    findLeavePolicyRuleByPolicyAndLeaveType: jest.fn().mockResolvedValue(null),
    createLeavePolicyRule: jest.fn().mockResolvedValue({
      id: 'leave-policy-rule-1',
      leaveTypeId: 'leave-type-1',
    }),
    createLeavePolicyAssignment: jest.fn().mockResolvedValue({
      id: 'leave-policy-assignment-1',
      leavePolicyId: 'leave-policy-1',
    }),
    findActiveLeavePolicyAssignments: jest.fn().mockResolvedValue([]),
    listActiveLeavePolicyRules: jest.fn().mockResolvedValue([]),
  };

  const service = new LeaveService(
    { $transaction: jest.fn() } as never,
    leaveRepository as never,
    { findByUserIdAndTenant: jest.fn() } as never,
    {} as never,
    auditService as never,
    { resolveApprovalRoute: jest.fn().mockResolvedValue([]) } as never,
    { dispatch: jest.fn() } as never,
    new LeavePolicyResolverService(
      { businessUnit: { findFirst: jest.fn() } } as never,
      leaveRepository as never,
    ) as never,
    { reconcileTenant: jest.fn().mockResolvedValue(undefined) } as never,
  );

  return { service, auditService, leaveRepository };
}

describe('leave configuration auditing', () => {
  it('writes an audit row when a leave type is created', async () => {
    const { service, auditService } = createService();

    await service.createLeaveType(currentUser, {
      name: 'Annual Leave',
      category: 'ANNUAL',
    } as never);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        action: AUDIT_ACTIONS.LEAVE_TYPE_CREATED,
        entityType: 'LeaveType',
        entityId: 'leave-type-1',
      }),
    );
  });

  it('writes both snapshots when a leave type changes', async () => {
    /*
     * The QA run changed `consumesBalance` and nothing recorded it. That flag
     * decides whether leave draws down a balance the tenant owes, so before and
     * after are the point of the row.
     */
    const { service, auditService } = createService();

    await service.updateLeaveType(currentUser, 'leave-type-1', {
      consumesBalance: false,
    } as never);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.LEAVE_TYPE_UPDATED,
        entityType: 'LeaveType',
        entityId: 'leave-type-1',
        beforeSnapshot: expect.objectContaining({ consumesBalance: true }),
        afterSnapshot: expect.anything(),
      }),
    );
  });

  it('audits deactivating a leave type through the update it performs', async () => {
    /*
     * `deactivateLeaveType` delegates to `updateLeaveType`, so it needs no call
     * site of its own — and must not produce a second row.
     */
    const { service, auditService, leaveRepository } = createService();
    const prisma = (service as unknown as { prisma: Record<string, unknown> })
      .prisma;
    const zero = { count: jest.fn().mockResolvedValue(0) };
    Object.assign(prisma, {
      leavePolicyRule: zero,
      leaveRequest: zero,
      leaveBalance: zero,
      leaveConsumptionRecord: zero,
    });
    leaveRepository.updateLeaveType.mockResolvedValue({ count: 1 });

    await service.deactivateLeaveType(currentUser, 'leave-type-1');

    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTIONS.LEAVE_TYPE_UPDATED }),
    );
  });

  it('writes an audit row when a leave policy is created', async () => {
    const { service, auditService } = createService();

    await service.createLeavePolicy(currentUser, { name: 'Default' } as never);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.LEAVE_POLICY_CREATED,
        entityType: 'LeavePolicy',
        entityId: 'leave-policy-1',
      }),
    );
  });

  it('writes an audit row when a leave policy changes', async () => {
    const { service, auditService } = createService();

    await service.updateLeavePolicy(currentUser, 'leave-policy-1', {
      name: 'Standard',
    } as never);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.LEAVE_POLICY_UPDATED,
        entityId: 'leave-policy-1',
        beforeSnapshot: expect.objectContaining({ name: 'Default' }),
      }),
    );
  });

  it('writes an audit row when a policy rule is created', async () => {
    const { service, auditService } = createService();

    await service.createLeavePolicyRule(currentUser, 'leave-policy-1', {
      leaveTypeId: 'leave-type-1',
      entitlementDays: 20,
    } as never);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT_ACTIONS.LEAVE_POLICY_RULE_CREATED,
        entityType: 'LeavePolicyRule',
        entityId: 'leave-policy-rule-1',
      }),
    );
  });

  it('does not audit a policy rule the service refused to create', async () => {
    const { service, auditService, leaveRepository } = createService();
    leaveRepository.findLeavePolicyRuleByPolicyAndLeaveType.mockResolvedValue({
      id: 'existing-rule',
    });

    await expect(
      service.createLeavePolicyRule(currentUser, 'leave-policy-1', {
        leaveTypeId: 'leave-type-1',
      } as never),
    ).rejects.toThrow();

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('audits against the tenant of the acting user', async () => {
    const { service, auditService } = createService();

    await service.createLeavePolicy(currentUser, {
      name: 'Default',
      tenantId: 'tenant-2',
    } as never);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });
});
