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
    findAttendancePage: jest.Mock;
  };
  let employeesRepository: {
    findByUserIdAndTenant: jest.Mock;
    findHierarchyNodeByIdAndTenant: jest.Mock;
    findDirectReports: jest.Mock;
  };
  let auditService: {
    log: jest.Mock;
  };
  let tenantSettingsResolverService: {
    getAttendanceSettings: jest.Mock;
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
      findAttendancePage: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
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
      findDirectReports: jest.fn().mockResolvedValue([]),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    tenantSettingsResolverService = {
      getAttendanceSettings: jest.fn().mockResolvedValue({
        lateCheckInGraceMinutes: 0,
        lateCheckOutGraceMinutes: 0,
        requireOfficeLocationForOfficeMode: false,
        requireRemoteLocationForRemoteMode: false,
        allowRemoteWithoutLocation: true,
        allowManualAdjustments: true,
        allowedModes: [AttendanceMode.OFFICE, AttendanceMode.REMOTE],
      }),
    };

    service = new AttendanceService(
      attendanceRepository as never,
      employeesRepository as never,
      tenantSettingsResolverService as never,
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

  it('returns an older open self-service session as checkout-eligible', async () => {
    attendanceRepository.findOpenAttendanceEntry.mockResolvedValueOnce({
      id: 'attendance-older-open',
      tenantId: 'tenant-1',
      employeeId: 'employee-1',
      workScheduleId: null,
      officeLocationId: null,
      importedBatchId: null,
      date: new Date('2026-05-18T00:00:00.000Z'),
      checkIn: new Date('2026-05-18T17:17:01.601Z'),
      checkOut: null,
      attendanceMode: AttendanceMode.REMOTE,
      status: 'LATE',
      source: 'SYSTEM',
      checkInNote: null,
      checkOutNote: null,
      workSummary: null,
      notes: null,
      remoteLatitude: null,
      remoteLongitude: null,
      remoteAddressText: null,
      isLateCheckIn: true,
      isLateCheckOut: false,
      lateCheckInMinutes: 1,
      lateCheckOutMinutes: null,
      machineDeviceId: null,
      createdAt: new Date('2026-05-18T17:17:01.624Z'),
      updatedAt: new Date('2026-05-18T17:17:01.624Z'),
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
      officeLocation: null,
      importedBatch: null,
    });

    await expect(
      service.getMyActiveAttendance(currentUser),
    ).resolves.toMatchObject({
      id: 'attendance-older-open',
      canCurrentUserCheckOut: true,
      checkOutBlockedReason: null,
      isCurrentUsersEntry: true,
    });
  });

  it('blocks Employee Self Service users from team attendance even with attendance.read', async () => {
    const employeeSelfServiceUser = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      roleKeys: ['employee'],
      permissionKeys: [
        'attendance.read',
        'attendance.checkin',
        'attendance.checkout',
      ],
    } as never;

    await expect(
      service.listTeamAttendance(employeeSelfServiceUser, {
        page: 1,
        pageSize: 20,
        scope: 'team',
      } as never),
    ).rejects.toThrow('You do not have permission to view team attendance.');
  });

  it('uses the reporting hierarchy for all attendance and direct reports for team attendance', async () => {
    const managerUser = {
      tenantId: 'tenant-1',
      userId: 'manager-user-1',
      roleKeys: ['manager'],
      permissionKeys: ['attendance.read'],
    } as never;

    employeesRepository.findByUserIdAndTenant.mockResolvedValue({
      id: 'manager-employee-1',
      userId: 'manager-user-1',
    });
    employeesRepository.findDirectReports
      .mockResolvedValueOnce([
        {
          id: 'direct-report-1',
          department: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'nested-report-1',
          department: null,
        },
      ])
      .mockResolvedValueOnce([]);

    await service.listTeamAttendance(managerUser, {
      page: 1,
      pageSize: 20,
      scope: 'all',
    } as never);

    expect(attendanceRepository.findAttendancePage).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'all' }),
      { employeeId: { in: ['direct-report-1', 'nested-report-1'] } },
    );
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
