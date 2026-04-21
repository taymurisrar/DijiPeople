import { BadRequestException } from '@nestjs/common';
import { LeaveService } from './leave.service';

describe('LeaveService', () => {
  let service: LeaveService;
  let leaveRepository: {
    findLeaveTypeById: jest.Mock;
  };
  let employeesRepository: {
    findByUserIdAndTenant: jest.Mock;
  };

  beforeEach(() => {
    leaveRepository = {
      findLeaveTypeById: jest.fn(),
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
});
