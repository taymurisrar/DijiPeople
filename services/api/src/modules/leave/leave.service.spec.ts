import { LeavePolicyResolverService } from './leave-policy-resolver.service';
import { BadRequestException } from '@nestjs/common';
import { LeaveService } from './leave.service';

describe('LeaveService', () => {
  let service: LeaveService;
  let leaveRepository: {
    findLeaveTypeById: jest.Mock;
    findLeaveTypes: jest.Mock;
    findActiveLeavePolicyAssignments: jest.Mock;
    listActiveLeavePolicyRules: jest.Mock;
  };
  let employeesRepository: {
    findByUserIdAndTenant: jest.Mock;
  };

  beforeEach(() => {
    leaveRepository = {
      findLeaveTypeById: jest.fn(),
      findLeaveTypes: jest.fn().mockResolvedValue([]),
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
      /*
       * The policy resolver moved out of this service (EXECPLAN-0026), so it
       * has to be supplied - and supplied for real, over the same mocked
       * repository. These tests do exercise resolution: the leave-type test
       * mocks findActiveLeavePolicyAssignments and asserts the resolved policy
       * comes back in the payload. A stub returning null passed the other two
       * and quietly gutted that one.
       */
      new LeavePolicyResolverService(
        { businessUnit: { findFirst: jest.fn() } } as never,
        leaveRepository as never,
      ) as never,
      { reconcileTenant: jest.fn().mockResolvedValue(undefined) } as never,
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
      employeeRequestAllowed: true,
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
        },
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Leave request end date cannot be before start date.',
      ),
    );
  });

  it('returns active configured leave types for the current employee', async () => {
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
        leaveTypeId: 'leave-type-1',
      },
    ]);
    leaveRepository.findLeaveTypes.mockResolvedValue([
      {
        id: 'leave-type-1',
        name: 'Annual Leave',
        code: 'ANNUAL',
        category: 'ANNUAL',
        requiresApproval: true,
        isPaid: true,
        employeeRequestAllowed: true,
        requiresAttachment: false,
        allowHalfDay: true,
        allowHourlyLeave: false,
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
          requiresAttachment: false,
          allowHalfDay: true,
          allowHourlyLeave: false,
        },
      ],
    });
  });

  it('reports when no active leave types are configured', async () => {
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
      status: 'NO_ACTIVE_TYPES',
      leaveTypes: [],
    });
  });
});
