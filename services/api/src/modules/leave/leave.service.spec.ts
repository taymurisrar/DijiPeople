import { BadRequestException } from '@nestjs/common';
import { LeaveService } from './leave.service';

describe('LeaveService', () => {
  let service: LeaveService;
  let leaveRepository: {
    findLeaveTypeById: jest.Mock;
    findActiveLeavePolicyAssignments: jest.Mock;
    listActiveLeavePolicyRules: jest.Mock;
  };
  let employeesRepository: {
    findByUserIdAndTenant: jest.Mock;
  };

  beforeEach(() => {
    leaveRepository = {
      findLeaveTypeById: jest.fn(),
      findActiveLeavePolicyAssignments: jest.fn().mockResolvedValue([]),
      listActiveLeavePolicyRules: jest.fn().mockResolvedValue([]),
    };
    employeesRepository = {
      findByUserIdAndTenant: jest.fn(),
    };

    service = new LeaveService(
      { $transaction: jest.fn() } as never,
      leaveRepository as never,
      employeesRepository as never,
      {} as never,
      { log: jest.fn() } as never,
      { resolveApprovalRoute: jest.fn().mockResolvedValue([]) } as never,
      { dispatch: jest.fn() } as never,
    );
  });

  it('rejects leave requests with an end date before the start date', async () => {
    employeesRepository.findByUserIdAndTenant.mockResolvedValue({
      id: 'employee-1',
      managerEmployeeId: null,
      manager: null,
    });
    leaveRepository.findLeaveTypeById.mockResolvedValue({
      id: 'leave-type-1',
      isActive: true,
    });

    await expect(
      service.submitLeaveRequest(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
        } as never,
        {
          leaveTypeId: '6f314f65-cd24-42f2-88ea-5f712fa96f55',
          startDate: '2026-04-10',
          endDate: '2026-04-09',
        } as never,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Leave request end date cannot be before start date.',
      ),
    );
  });

  it('returns only active policy leave types available to the current employee', async () => {
    employeesRepository.findByUserIdAndTenant.mockResolvedValue({
      id: 'employee-1',
      departmentId: null,
      businessUnitId: null,
      employeeLevelId: null,
    });
    leaveRepository.findActiveLeavePolicyAssignments.mockResolvedValue([
      {
        scopeType: 'TENANT',
        scopeId: null,
        priority: 0,
        effectiveFrom: new Date('2026-01-01'),
        leavePolicy: { id: 'policy-1', name: 'Default', isActive: true },
      },
    ]);
    leaveRepository.listActiveLeavePolicyRules.mockResolvedValue([
      {
        approvalRequired: true,
        isPaid: true,
        leaveType: {
          id: 'leave-type-1',
          name: 'Annual Leave',
          code: 'ANNUAL',
          category: 'ANNUAL',
        },
      },
    ]);

    await expect(
      service.getAvailableLeaveTypesForEmployee({
        tenantId: 'tenant-1',
        userId: 'user-1',
      } as never),
    ).resolves.toEqual({
      status: 'AVAILABLE',
      leavePolicy: { id: 'policy-1', name: 'Default' },
      leaveTypes: [
        {
          id: 'leave-type-1',
          name: 'Annual Leave',
          code: 'ANNUAL',
          category: 'ANNUAL',
          requiresApproval: true,
          isPaid: true,
        },
      ],
    });
  });

  it('reports when no applicable leave policy is assigned', async () => {
    employeesRepository.findByUserIdAndTenant.mockResolvedValue({
      id: 'employee-1',
      departmentId: null,
      businessUnitId: null,
      employeeLevelId: null,
    });

    await expect(
      service.getAvailableLeaveTypesForEmployee({
        tenantId: 'tenant-1',
        userId: 'user-1',
      } as never),
    ).resolves.toEqual({
      status: 'NO_APPLICABLE_POLICY',
      leaveTypes: [],
    });
  });
});
