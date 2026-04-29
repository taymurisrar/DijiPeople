import { BadRequestException, ConflictException } from '@nestjs/common';
import { AttendanceMode } from '@prisma/client';
import { AttendanceService } from './attendance.service';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let attendanceRepository: {
    findOpenAttendanceEntry: jest.Mock;
    findAttendanceEntryByEmployeeAndDate: jest.Mock;
    findDefaultWorkSchedule: jest.Mock;
    findAttendancePolicy: jest.Mock;
    findOfficeLocationById: jest.Mock;
    createAttendanceEntry: jest.Mock;
  };
  let employeesRepository: {
    findByUserIdAndTenant: jest.Mock;
    findHierarchyNodeByIdAndTenant: jest.Mock;
  };
  let auditService: {
    log: jest.Mock;
  };

  const currentUser = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    permissionKeys: [
      'attendance.checkin',
      'attendance.checkout',
      'attendance.manage',
    ],
  } as never;

  beforeEach(() => {
    attendanceRepository = {
      findOpenAttendanceEntry: jest.fn().mockResolvedValue(null),
      findAttendanceEntryByEmployeeAndDate: jest.fn().mockResolvedValue(null),
      findDefaultWorkSchedule: jest.fn().mockResolvedValue(null),
      findAttendancePolicy: jest.fn().mockResolvedValue(null),
      findOfficeLocationById: jest.fn().mockResolvedValue({
        id: 'location-1',
        name: 'HQ',
        code: 'HQ',
      }),
      createAttendanceEntry: jest.fn().mockResolvedValue({
        id: 'attendance-1',
        tenantId: 'tenant-1',
        employeeId: 'employee-1',
        workScheduleId: null,
        officeLocationId: 'location-1',
        importedBatchId: null,
        date: new Date('2026-04-13T00:00:00.000Z'),
        checkIn: new Date('2026-04-13T09:00:00.000Z'),
        checkOut: null,
        attendanceMode: AttendanceMode.OFFICE,
        status: 'PRESENT',
        source: 'SYSTEM',
        checkInNote: null,
        checkOutNote: null,
        workSummary: null,
        notes: null,
        remoteLatitude: null,
        remoteLongitude: null,
        remoteAddressText: null,
        isLateCheckIn: false,
        isLateCheckOut: false,
        lateCheckInMinutes: null,
        lateCheckOutMinutes: null,
        machineDeviceId: null,
        createdAt: new Date('2026-04-13T09:00:00.000Z'),
        updatedAt: new Date('2026-04-13T09:00:00.000Z'),
        employee: {
          id: 'employee-1',
          employeeCode: 'EMP-001',
          firstName: 'Ava',
          lastName: 'Stone',
          preferredName: null,
          userId: 'user-1',
          managerEmployeeId: null,
          departmentId: null,
          department: null,
          designation: null,
          manager: null,
        },
        workSchedule: null,
        officeLocation: {
          id: 'location-1',
          name: 'HQ',
          code: 'HQ',
          city: null,
          state: null,
          country: null,
          timezone: null,
        },
        importedBatch: null,
      }),
    };

    employeesRepository = {
      findByUserIdAndTenant: jest.fn().mockResolvedValue({
        id: 'employee-1',
        userId: 'user-1',
      }),
      findHierarchyNodeByIdAndTenant: jest.fn().mockResolvedValue({
        id: 'employee-1',
      }),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    service = new AttendanceService(
      attendanceRepository as never,
      employeesRepository as never,
      auditService as never,
    );
  });

  it('rejects duplicate active check-ins', async () => {
    attendanceRepository.findOpenAttendanceEntry.mockResolvedValueOnce({
      id: 'open-entry',
    });

    await expect(
      service.checkIn(currentUser, {
        attendanceMode: AttendanceMode.OFFICE,
        officeLocationId: 'location-1',
      }),
    ).rejects.toThrow(
      new ConflictException(
        'You already have an active attendance session. Please check out first.',
      ),
    );
  });

  it('rejects check-out when no active check-in exists', async () => {
    attendanceRepository.findOpenAttendanceEntry.mockResolvedValueOnce(null);

    await expect(
      service.checkOut(currentUser, {
        note: 'Wrapping up for the day',
      }),
    ).rejects.toThrow(new BadRequestException('No active check-in was found.'));
  });

  it('rejects manual attendance creation for employees outside the tenant', async () => {
    employeesRepository.findHierarchyNodeByIdAndTenant.mockResolvedValueOnce(
      null,
    );

    await expect(
      service.createManualEntry(currentUser, {
        employeeId: 'employee-9',
        date: '2026-04-10',
        attendanceMode: AttendanceMode.MANUAL,
        adjustmentReason: 'Imported correction',
      } as never),
    ).rejects.toThrow(
      new BadRequestException(
        'Selected employee does not belong to this tenant.',
      ),
    );
  });
});
