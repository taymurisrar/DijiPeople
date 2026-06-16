import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  AttendanceMode,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';
import { AttendanceService } from './attendance.service';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let attendanceRepository: {
    findOpenAttendanceEntry: jest.Mock;
    findAttendanceEntryByEmployeeAndDate: jest.Mock;
    findDefaultWorkSchedule: jest.Mock;
    findEmployeeWorkSchedule: jest.Mock;
    findAttendancePolicy: jest.Mock;
    findOfficeLocationById: jest.Mock;
    createAttendanceEntry: jest.Mock;
    findAttendancePage: jest.Mock;
    findAttendanceForSummary: jest.Mock;
    findAttendanceEntryById: jest.Mock;
    findEmployeeIdByUserId: jest.Mock;
    findWorkScheduleById: jest.Mock;
    findResolvedShiftTemplate: jest.Mock;
    resolveEmployeeWorkConfiguration: jest.Mock;
    findHolidayForEmployeeDate: jest.Mock;
    findShiftTemplateById: jest.Mock;
    updateAttendanceEntry: jest.Mock;
  };
  let employeesRepository: {
    findByUserIdAndTenant: jest.Mock;
    findHierarchyNodeByIdAndTenant: jest.Mock;
    findDirectReports: jest.Mock;
    findByTenant: jest.Mock;
  };
  let auditService: {
    log: jest.Mock;
  };
  let tenantSettingsResolverService: {
    getAttendanceSettings: jest.Mock;
  };
  let notificationsService: {
    emit: jest.Mock;
  };
  let configurationResolverService: {
    resolveAppContext: jest.Mock;
  };
  let prisma: {
    employee: { findFirst: jest.Mock };
    leaveRequest: { findFirst: jest.Mock };
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
      findEmployeeWorkSchedule: jest.fn().mockResolvedValue(null),
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
      findAttendanceForSummary: jest.fn().mockResolvedValue([]),
      findAttendanceEntryById: jest.fn(),
      findEmployeeIdByUserId: jest.fn().mockResolvedValue({ id: 'employee-1' }),
      findWorkScheduleById: jest.fn().mockResolvedValue({
        id: 'schedule-1',
        weeklyWorkDays: [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
          'SUNDAY',
        ],
        standardStartTime: '09:00',
        standardEndTime: '17:00',
        graceMinutes: 0,
      }),
      findResolvedShiftTemplate: jest.fn().mockResolvedValue({
        id: 'shift-1',
        name: 'Day Shift',
        code: 'DAY',
        timezone: 'Asia/Riyadh',
        startTime: '09:00',
        endTime: '17:00',
        breakMinutes: 60,
        expectedHours: 8,
        lateGraceMinutes: 0,
        earlyExitGraceMinutes: 0,
        isNightShift: false,
      }),
      resolveEmployeeWorkConfiguration: jest.fn().mockResolvedValue({
        employee: {
          id: 'employee-1',
          businessUnitId: null,
          departmentId: null,
          locationId: null,
          defaultWorkScheduleId: null,
          department: null,
          location: null,
        },
        source: 'TENANT_DEFAULT',
        workSchedule: {
          id: 'schedule-1',
          name: 'Default Schedule',
          holidayCalendarId: null,
          weeklyWorkDays: [
            'MONDAY',
            'TUESDAY',
            'WEDNESDAY',
            'THURSDAY',
            'FRIDAY',
            'SATURDAY',
            'SUNDAY',
          ],
          standardStartTime: '09:00',
          standardEndTime: '17:00',
          graceMinutes: 0,
        },
        scheduleDay: {
          isWorkingDay: true,
          shiftTemplate: {
            id: 'shift-1',
            name: 'Day Shift',
            code: 'DAY',
            timezone: 'Asia/Riyadh',
            status: 'ACTIVE',
            isActive: true,
            startTime: '09:00',
            endTime: '17:00',
            breakMinutes: 60,
            expectedHours: 8,
            lateGraceMinutes: 0,
            earlyExitGraceMinutes: 0,
            isNightShift: false,
          },
        },
        holidayCalendarId: null,
      }),
      findHolidayForEmployeeDate: jest.fn().mockResolvedValue(null),
      findShiftTemplateById: jest.fn(),
      updateAttendanceEntry: jest.fn(),
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
      findByTenant: jest.fn().mockResolvedValue({
        items: [{ id: 'employee-1' }, { id: 'employee-2' }],
      }),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    tenantSettingsResolverService = {
      getAttendanceSettings: jest.fn().mockResolvedValue({
        defaultGraceMinutes: 0,
        allowManualAdjustments: true,
        enforceOfficeLocationForOfficeMode: true,
        requireRemoteLocationCapture: true,
        allowedModes: [
          AttendanceMode.OFFICE,
          AttendanceMode.REMOTE,
          AttendanceMode.HYBRID,
        ],
      }),
    };
    notificationsService = {
      emit: jest.fn().mockResolvedValue(undefined),
    };
    configurationResolverService = {
      resolveAppContext: jest.fn().mockResolvedValue({
        timezone: 'Asia/Riyadh',
        workScheduleId: 'schedule-1',
      }),
    };
    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'employee-1',
          businessUnitId: null,
        }),
      },
      leaveRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    service = new AttendanceService(
      attendanceRepository as never,
      employeesRepository as never,
      tenantSettingsResolverService as never,
      configurationResolverService as never,
      auditService as never,
      notificationsService as never,
      prisma as never,
    );
  });

  it('allows an employee to read an attendance entry linked to their user', async () => {
    const entry = {
      ...attendanceRepository.createAttendanceEntry.mock.results,
      id: 'attendance-1',
      employeeId: 'employee-1',
      employee: {
        id: 'employee-1',
        userId: null,
        firstName: 'Ava',
        lastName: 'Stone',
        preferredName: null,
        employeeCode: 'EMP-001',
        managerEmployeeId: null,
        departmentId: null,
        department: null,
        designation: null,
        manager: null,
      },
      workSchedule: null,
      officeLocation: null,
      importedBatch: null,
      date: new Date('2026-04-13T00:00:00.000Z'),
      checkIn: new Date('2026-04-13T09:00:00.000Z'),
      checkOut: null,
      attendanceMode: AttendanceMode.OFFICE,
      status: 'PRESENT',
      source: 'SYSTEM',
      createdAt: new Date('2026-04-13T09:00:00.000Z'),
      updatedAt: new Date('2026-04-13T09:00:00.000Z'),
    };
    attendanceRepository.findAttendanceEntryById.mockResolvedValue(entry);

    await expect(
      service.getAttendanceEntry(currentUser, 'attendance-1'),
    ).resolves.toMatchObject({ id: 'attendance-1' });
  });

  it('rejects duplicate attendance for the tenant business date', async () => {
    attendanceRepository.findAttendanceEntryByEmployeeAndDate.mockResolvedValueOnce(
      {
        id: 'today-entry',
      },
    );

    await expect(
      service.checkIn(currentUser, {
        attendanceMode: AttendanceMode.OFFICE,
        officeLocationId: 'location-1',
      }),
    ).rejects.toThrow(new ConflictException('Already checked in today.'));
  });

  it('rejects check-out when no check-in exists today', async () => {
    await expect(
      service.checkOut(currentUser, {
        note: 'Wrapping up for the day',
      }),
    ).rejects.toThrow(
      new BadRequestException('Check out requires a check in today.'),
    );
  });

  it('requires a tenant work site for Office check-in', async () => {
    await expect(
      service.checkIn(currentUser, {
        attendanceMode: AttendanceMode.OFFICE,
      }),
    ).rejects.toThrow('Office location is required for office attendance.');
  });

  it('requires an Office work site even when the legacy policy toggle is false', async () => {
    tenantSettingsResolverService.getAttendanceSettings.mockResolvedValueOnce({
      defaultGraceMinutes: 0,
      allowManualAdjustments: true,
      enforceOfficeLocationForOfficeMode: false,
      requireRemoteLocationCapture: true,
      allowedModes: [
        AttendanceMode.OFFICE,
        AttendanceMode.REMOTE,
        AttendanceMode.HYBRID,
      ],
    });

    await expect(
      service.checkIn(currentUser, {
        attendanceMode: AttendanceMode.OFFICE,
      }),
    ).rejects.toThrow('Office location is required for office attendance.');
  });

  it('persists the resolved shift and does not require geolocation for Office', async () => {
    await service.checkIn(currentUser, {
      attendanceMode: AttendanceMode.OFFICE,
      officeLocationId: 'location-1',
      note: 'At reception',
    });

    expect(attendanceRepository.createAttendanceEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'employee-1',
        workScheduleId: 'schedule-1',
        shiftTemplateId: 'shift-1',
        officeLocationId: 'location-1',
        attendanceMode: AttendanceMode.OFFICE,
        status: 'CHECKED_IN',
        source: 'WEB',
        checkInSource: 'WEB',
        checkInLatitude: undefined,
        checkInLongitude: undefined,
      }),
    );
  });

  it.each([AttendanceMode.REMOTE, AttendanceMode.HYBRID])(
    'requires browser geolocation for %s check-in',
    async (attendanceMode) => {
      await expect(
        service.checkIn(currentUser, { attendanceMode }),
      ).rejects.toThrow('attendance requires browser location');
    },
  );

  it('captures Hybrid check-in coordinates, accuracy, and timestamp', async () => {
    const capturedAt = '2026-06-12T07:15:00.000Z';
    await service.checkIn(currentUser, {
      attendanceMode: AttendanceMode.HYBRID,
      remoteLatitude: 24.7136,
      remoteLongitude: 46.6753,
      locationAccuracy: 12,
      locationCapturedAt: capturedAt,
    });

    expect(attendanceRepository.createAttendanceEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        officeLocationId: undefined,
        checkInLatitude: 24.7136,
        checkInLongitude: 46.6753,
        checkInLocationAccuracy: 12,
        checkInLocationCapturedAt: new Date(capturedAt),
      }),
    );
  });

  it('blocks check-in when approved leave covers the business date', async () => {
    prisma.leaveRequest.findFirst.mockResolvedValueOnce({ id: 'leave-1' });

    await expect(
      service.checkIn(currentUser, {
        attendanceMode: AttendanceMode.OFFICE,
        officeLocationId: 'location-1',
      }),
    ).rejects.toThrow('approved leave today');
  });

  it('reports the exact missing schedule configuration path', async () => {
    attendanceRepository.resolveEmployeeWorkConfiguration.mockResolvedValue({
      employee: {
        id: 'employee-1',
        departmentId: null,
        locationId: null,
      },
      source: 'TENANT_DEFAULT',
      workSchedule: null,
      scheduleDay: null,
      holidayCalendarId: null,
    });

    await expect(
      service.checkIn(currentUser, {
        attendanceMode: AttendanceMode.OFFICE,
        officeLocationId: 'location-1',
      }),
    ).rejects.toThrow(
      'No active work schedule is configured for this employee, department, work site, or tenant default.',
    );
  });

  it('blocks self-service check-in on a resolved holiday', async () => {
    attendanceRepository.resolveEmployeeWorkConfiguration.mockResolvedValue({
      ...(await attendanceRepository.resolveEmployeeWorkConfiguration()),
      holidayCalendarId: 'calendar-1',
    });
    attendanceRepository.findHolidayForEmployeeDate.mockResolvedValue({
      id: 'holiday-1',
      name: 'Saudi National Day',
      isPaid: true,
      isHalfDay: false,
    });

    await expect(
      service.checkIn(currentUser, {
        attendanceMode: AttendanceMode.OFFICE,
        officeLocationId: 'location-1',
      }),
    ).rejects.toThrow(
      'Check in is unavailable because today is Saudi National Day.',
    );
  });

  it('blocks self-service check-in on a scheduled off day', async () => {
    const configured =
      await attendanceRepository.resolveEmployeeWorkConfiguration();
    attendanceRepository.resolveEmployeeWorkConfiguration.mockResolvedValue({
      ...configured,
      scheduleDay: { isWorkingDay: false, shiftTemplate: null },
    });

    await expect(
      service.checkIn(currentUser, {
        attendanceMode: AttendanceMode.OFFICE,
        officeLocationId: 'location-1',
      }),
    ).rejects.toThrow('is a scheduled off day.');
  });

  it('updates the same Remote record on check-out and captures location again', async () => {
    const existing = {
      ...(await attendanceRepository.createAttendanceEntry()),
      shiftTemplateId: 'shift-1',
      shiftTemplate: null,
      attendanceMode: AttendanceMode.REMOTE,
      checkIn: new Date(Date.now() - 60 * 60 * 1000),
      checkOut: null,
      officeLocationId: null,
    };
    const updated = {
      ...existing,
      checkOut: new Date(),
      status: 'CHECKED_OUT',
    };
    attendanceRepository.createAttendanceEntry.mockClear();
    attendanceRepository.findAttendanceEntryByEmployeeAndDate.mockResolvedValueOnce(
      existing,
    );
    attendanceRepository.updateAttendanceEntry.mockResolvedValueOnce(updated);

    await service.checkOut(currentUser, {
      note: 'Done',
      remoteLatitude: 24.7136,
      remoteLongitude: 46.6753,
      locationAccuracy: 8,
      locationCapturedAt: '2026-06-12T15:00:00.000Z',
    });

    expect(attendanceRepository.updateAttendanceEntry).toHaveBeenCalledWith(
      'tenant-1',
      'attendance-1',
      expect.objectContaining({
        status: 'CHECKED_OUT',
        checkOutSource: 'WEB',
        checkOutLatitude: 24.7136,
        checkOutLongitude: 46.6753,
        checkOutLocationAccuracy: 8,
      }),
    );
  });

  it('blocks a second check-out', async () => {
    attendanceRepository.findAttendanceEntryByEmployeeAndDate.mockResolvedValueOnce(
      {
        checkIn: new Date('2026-06-12T06:00:00.000Z'),
        checkOut: new Date('2026-06-12T14:00:00.000Z'),
      },
    );

    await expect(service.checkOut(currentUser, {})).rejects.toThrow(
      new ConflictException('Already checked out.'),
    );
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

  it('allows CEO users to list tenant attendance without manager-scope filtering', async () => {
    const ceoUser = {
      tenantId: 'tenant-1',
      userId: 'ceo-user-1',
      roleKeys: ['ceo'],
      permissionKeys: ['attendance.read'],
      rolePrivileges: [
        {
          entityKey: 'attendance',
          privilege: SecurityPrivilege.READ,
          accessLevel: SecurityAccessLevel.TENANT,
        },
      ],
    } as never;

    await service.listTeamAttendance(ceoUser, {
      page: 1,
      pageSize: 20,
      scope: 'all',
    } as never);

    expect(employeesRepository.findByTenant).toHaveBeenCalledWith(
      'tenant-1',
      expect.any(Object),
      {},
    );
    expect(attendanceRepository.findAttendancePage).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ scope: 'all' }),
      { employeeId: { in: ['employee-1', 'employee-2'] } },
    );
  });

  it('does not give System Customizer implicit team attendance visibility', async () => {
    const systemCustomizerUser = {
      tenantId: 'tenant-1',
      userId: 'customizer-user-1',
      roleKeys: ['system-customizer'],
      permissionKeys: ['customization.read'],
      rolePrivileges: [],
    } as never;

    await expect(
      service.listTeamAttendance(systemCustomizerUser, {
        page: 1,
        pageSize: 20,
        scope: 'team',
      } as never),
    ).rejects.toThrow('You do not have permission to view team attendance.');
  });

  it('does not give Recruiter implicit team attendance visibility', async () => {
    const recruiterUser = {
      tenantId: 'tenant-1',
      userId: 'recruiter-user-1',
      roleKeys: ['recruiter'],
      permissionKeys: ['candidates.read'],
      rolePrivileges: [],
    } as never;

    await expect(
      service.listTeamAttendance(recruiterUser, {
        page: 1,
        pageSize: 20,
        scope: 'team',
      } as never),
    ).rejects.toThrow('You do not have permission to view team attendance.');
  });

  it('allows CEO users to open attendance details with remote location timestamps', async () => {
    const ceoUser = {
      tenantId: 'tenant-1',
      userId: 'ceo-user-1',
      roleKeys: ['ceo'],
      permissionKeys: ['attendance.read'],
      rolePrivileges: [
        {
          entityKey: 'attendance',
          privilege: SecurityPrivilege.READ,
          accessLevel: SecurityAccessLevel.TENANT,
        },
      ],
    } as never;
    const checkInLocationCapturedAt = new Date('2026-06-14T08:55:00.000Z');
    const checkOutLocationCapturedAt = new Date('2026-06-14T17:05:00.000Z');

    attendanceRepository.findEmployeeIdByUserId.mockResolvedValue({
      id: 'ceo-employee',
    });
    employeesRepository.findHierarchyNodeByIdAndTenant.mockResolvedValue({
      id: 'employee-2',
      businessUnitId: null,
      user: { businessUnitId: null },
    });
    attendanceRepository.findAttendanceEntryById.mockResolvedValue({
      id: 'attendance-remote-1',
      tenantId: 'tenant-1',
      employeeId: 'employee-2',
      workScheduleId: null,
      shiftTemplateId: null,
      officeLocationId: null,
      importedBatchId: null,
      date: new Date('2026-06-14T00:00:00.000Z'),
      checkIn: new Date('2026-06-14T09:00:00.000Z'),
      checkOut: new Date('2026-06-14T17:00:00.000Z'),
      attendanceMode: AttendanceMode.REMOTE,
      status: 'PRESENT',
      source: 'SYSTEM',
      checkInSource: 'WEB',
      checkOutSource: 'WEB',
      checkInNote: null,
      checkOutNote: null,
      workSummary: null,
      notes: null,
      remoteLatitude: 24.7136,
      remoteLongitude: 46.6753,
      remoteAddressText: 'Riyadh',
      checkInLatitude: 24.7136,
      checkInLongitude: 46.6753,
      checkInLocationAccuracy: 20,
      checkInLocationCapturedAt,
      checkOutLatitude: 24.7137,
      checkOutLongitude: 46.6754,
      checkOutLocationAccuracy: 18,
      checkOutLocationCapturedAt,
      isLateCheckIn: false,
      isLateCheckOut: false,
      lateCheckInMinutes: null,
      lateCheckOutMinutes: null,
      machineDeviceId: null,
      createdAt: new Date('2026-06-14T09:00:00.000Z'),
      updatedAt: new Date('2026-06-14T17:00:00.000Z'),
      employee: {
        id: 'employee-2',
        employeeCode: 'EMP-002',
        firstName: 'Nora',
        lastName: 'Ali',
        preferredName: null,
        userId: 'employee-user-2',
        managerEmployeeId: null,
        departmentId: null,
        department: null,
        designation: null,
        manager: null,
      },
      workSchedule: null,
      officeLocation: null,
      importedBatch: null,
      shiftTemplate: null,
    });

    await expect(
      service.getAttendanceEntry(ceoUser, 'attendance-remote-1'),
    ).resolves.toMatchObject({
      id: 'attendance-remote-1',
      remoteLatitude: 24.7136,
      remoteLongitude: 46.6753,
      checkInLocationCapturedAt,
      checkOutLocationCapturedAt,
    });
  });

  it('uses the reporting hierarchy for all attendance and direct reports for team attendance', async () => {
    const managerUser = {
      tenantId: 'tenant-1',
      userId: 'manager-user-1',
      roleKeys: ['manager'],
      permissionKeys: ['attendance.read'],
      rolePrivileges: [
        {
          entityKey: 'attendance',
          privilege: SecurityPrivilege.READ,
          accessLevel: SecurityAccessLevel.PARENT_CHILD_BUSINESS_UNIT,
        },
      ],
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
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Selected employee does not belong to this tenant.',
      ),
    );
  });

  it('stores manual attendance with a canonical UTC business-date key', async () => {
    await service.createManualEntry(currentUser, {
      employeeId: 'employee-1',
      date: '2026-06-10',
      attendanceMode: AttendanceMode.OFFICE,
      officeLocationId: 'location-1',
      checkInTime: '08:30',
      checkOutTime: '16:30',
      adjustmentReason: 'Canonical business-date regression test',
    });

    expect(attendanceRepository.createAttendanceEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        date: new Date('2026-06-10T00:00:00.000Z'),
        shiftTemplateId: 'shift-1',
      }),
    );
  });
});
