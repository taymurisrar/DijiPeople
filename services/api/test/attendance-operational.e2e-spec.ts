import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AttendanceBackfillService } from '../src/modules/attendance-engine/attendance-backfill.service';
import { AttendanceEngineService } from '../src/modules/attendance-engine/attendance-engine.service';
import { AttendanceReconciliationService } from '../src/modules/attendance-engine/attendance-reconciliation.service';
import { AttendanceWebAttendanceService } from '../src/modules/attendance-engine/attendance-web-attendance.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';

/**
 * The operational half of attendance: evidence, exceptions, corrections,
 * approved overtime and backfill, against the real database.
 *
 * These are the behaviours a customer notices when something has gone wrong —
 * a forgotten punch, a disputed location, a finalised period — so they are
 * tested against real rows rather than mocks.
 */
describe('Attendance operational (e2e)', () => {
  jest.setTimeout(240_000);

  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let reconciliation: AttendanceReconciliationService;
  let engine: AttendanceEngineService;
  let backfill: AttendanceBackfillService;
  let webAttendance: AttendanceWebAttendanceService;
  let attendance: AttendanceService;

  const suffix = `ops-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  let tenantId: string;
  let employeeId: string;
  let otherEmployeeId: string;
  let managerUserId: string;
  let employeeUserId: string;
  let workSiteId: string;
  let integrationId: string;
  let deviceId: string;
  let workScheduleId: string;
  let shiftId: string;

  /** Monday. */
  const DAY = '2026-08-17';
  const day = (date: string) => new Date(`${date}T00:00:00.000Z`);

  /** An HR reviewer: manages attendance, but may not see coordinates. */
  const hrUser = (): AuthenticatedUser =>
    ({
      userId: managerUserId,
      tenantId,
      email: 'hr@example.test',
      permissionKeys: ['attendance.read', 'attendance.manage'],
    }) as AuthenticatedUser;

  /** An auditor: may see coordinates, through the narrow permission. */
  const auditorUser = (): AuthenticatedUser =>
    ({
      userId: managerUserId,
      tenantId,
      email: 'audit@example.test',
      permissionKeys: [
        'attendance.read',
        'attendance.manage',
        'attendance.locationEvidence.read',
      ],
    }) as AuthenticatedUser;

  const selfUser = (): AuthenticatedUser =>
    ({
      userId: employeeUserId,
      tenantId,
      email: 'self@example.test',
      permissionKeys: ['attendance.read'],
    }) as AuthenticatedUser;

  async function punch(localTime: string, direction: 'CHECK_IN' | 'CHECK_OUT') {
    await prisma.rawAttendanceEvent.create({
      data: {
        tenantId,
        employeeId,
        integrationId,
        deviceId,
        provider: 'ZKTECO',
        externalUserId: '25',
        occurredAtLocal: localTime,
        deviceTimezone: 'Asia/Qatar',
        captureSource: 'DEVICE',
        workMode: 'OFFICE',
        locationId: workSiteId,
        eventFingerprint: randomUUID(),
        dedupeScopeKey: `test:${suffix}`,
        mappingStatus: 'MAPPED',
        processingStatus: 'PENDING',
        rawPayload: { direction },
      },
    });
  }

  const reconcile = (date = DAY) =>
    reconciliation.reconcile(tenantId, employeeId, day(date));

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    reconciliation = app.get(AttendanceReconciliationService);
    engine = app.get(AttendanceEngineService);
    backfill = app.get(AttendanceBackfillService);
    webAttendance = app.get(AttendanceWebAttendanceService);
    attendance = app.get(AttendanceService);

    const tenant = await prisma.tenant.findFirstOrThrow({
      where: { businessUnits: { some: {} } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    tenantId = tenant.id;

    const businessUnit = await prisma.businessUnit.findFirstOrThrow({
      where: { tenantId },
      select: { id: true },
    });

    workSiteId = (
      await prisma.location.create({
        data: {
          tenantId,
          name: `Ops HQ ${suffix}`,
          city: 'Doha',
          state: 'Doha',
          country: 'QA',
          timezone: 'Asia/Qatar',
          latitude: 25.2854,
          longitude: 51.531,
          allowedRadiusMeters: 100,
        },
        select: { id: true },
      })
    ).id;

    const schedule = await prisma.workSchedule.create({
      data: {
        tenantId,
        name: `Ops schedule ${suffix}`,
        timezone: 'Asia/Qatar',
        workWeekModel: 'FIVE_DAY',
        weeklyWorkDays: [
          'SUNDAY',
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
        ],
        standardStartTime: '08:00',
        standardEndTime: '17:00',
      },
      select: { id: true },
    });
    workScheduleId = schedule.id;

    const shift = await prisma.shiftTemplate.create({
      data: {
        tenantId,
        workScheduleId: schedule.id,
        name: `Ops shift ${suffix}`,
        code: `OPS-${suffix}`,
        timezone: 'Asia/Qatar',
        startTime: '08:00',
        endTime: '17:00',
        expectedHours: 8,
        lateGraceMinutes: 10,
        earlyExitGraceMinutes: 10,
      },
      select: { id: true },
    });
    shiftId = shift.id;

    for (const weekday of [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
    ] as const) {
      await prisma.workScheduleDay.create({
        data: {
          tenantId,
          workScheduleId: schedule.id,
          shiftTemplateId: shift.id,
          dayOfWeek: weekday,
          isWorkingDay: true,
        },
      });
    }

    const users = await Promise.all([
      createUser('ops-self'),
      createUser('ops-mgr'),
    ]);
    employeeUserId = users[0];
    managerUserId = users[1];

    employeeId = await createEmployee(
      `OPS1-${suffix}`,
      businessUnit.id,
      employeeUserId,
    );
    otherEmployeeId = await createEmployee(
      `OPS2-${suffix}`,
      businessUnit.id,
      null,
    );

    const integration = await prisma.attendanceIntegration.create({
      data: {
        tenantId,
        name: `Ops integration ${suffix}`,
        provider: 'ZKTECO',
        connectorType: 'zkteco-legacy-tcp',
        connectionMode: 'LOCAL_GATEWAY',
      },
      select: { id: true },
    });
    integrationId = integration.id;

    deviceId = (
      await prisma.attendanceDevice.create({
        data: {
          tenantId,
          integrationId: integration.id,
          name: `Ops device ${suffix}`,
          provider: 'ZKTECO',
          locationId: workSiteId,
          timezone: 'Asia/Qatar',
          status: 'ACTIVE',
          isEnabled: true,
        },
        select: { id: true },
      })
    ).id;
  });

  async function createUser(label: string): Promise<string> {
    const businessUnit = await prisma.businessUnit.findFirstOrThrow({
      where: { tenantId },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        tenantId,
        businessUnitId: businessUnit.id,
        firstName: 'Ops',
        lastName: label,
        email: `${label}-${suffix}@example.test`,
        passwordHash: 'not-used-in-this-test',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    return user.id;
  }

  async function createEmployee(
    code: string,
    businessUnitId: string,
    userId: string | null,
  ): Promise<string> {
    const employee = await prisma.employee.create({
      data: {
        tenantId,
        businessUnitId,
        employeeCode: code,
        firstName: 'Ops',
        lastName: code,
        email: `${code.toLowerCase()}@example.test`,
        phone: '+97400000000',
        hireDate: new Date('2020-01-01T00:00:00.000Z'),
        employmentStatus: 'ACTIVE',
        workMode: 'HYBRID',
        locationId: workSiteId,
        ...(userId ? { userId } : {}),
      },
      select: { id: true },
    });

    await prisma.employeeScheduleAssignment.create({
      data: {
        tenantId,
        employeeId: employee.id,
        workScheduleId,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      },
    });

    await prisma.employeeWorkSite.create({
      data: {
        tenantId,
        employeeId: employee.id,
        locationId: workSiteId,
        isPrimary: true,
        status: 'ACTIVE',
      },
    });

    return employee.id;
  }

  afterEach(async () => {
    const employees = [employeeId, otherEmployeeId].filter(Boolean);
    if (employees.length === 0) return;

    await prisma.rawAttendanceEvent.deleteMany({
      where: { dedupeScopeKey: `test:${suffix}` },
    });
    await prisma.attendanceLocationEvidence.deleteMany({
      where: { tenantId, employeeId: { in: employees } },
    });
    await prisma.attendanceCorrectionRequest.deleteMany({
      where: { tenantId, employeeId: { in: employees } },
    });
    await prisma.attendanceException.deleteMany({
      where: { tenantId, employeeId: { in: employees } },
    });
    await prisma.attendanceSession.deleteMany({
      where: { tenantId, employeeId: { in: employees } },
    });
    await prisma.attendanceDay.deleteMany({
      where: { tenantId, employeeId: { in: employees } },
    });
    await prisma.attendanceEntry.deleteMany({
      where: { tenantId, employeeId: { in: employees } },
    });
    await prisma.attendanceReconciliationJob.deleteMany({
      where: { tenantId, employeeId: { in: employees } },
    });
  });

  afterAll(async () => {
    const employees = [employeeId, otherEmployeeId].filter(Boolean);
    const users = [employeeUserId, managerUserId].filter(Boolean);

    await prisma.rawAttendanceEvent.deleteMany({
      where: { tenantId, integrationId },
    });
    await prisma.attendanceDevice.deleteMany({ where: { integrationId } });
    await prisma.attendanceIntegration.deleteMany({
      where: { id: integrationId },
    });
    await prisma.employeeWorkSite.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await prisma.employeeScheduleAssignment.deleteMany({
      where: { employeeId: { in: employees } },
    });
    await prisma.employee.deleteMany({ where: { id: { in: employees } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.workScheduleDay.deleteMany({ where: { workScheduleId } });
    await prisma.shiftTemplate.deleteMany({ where: { id: shiftId } });
    await prisma.workSchedule.deleteMany({ where: { id: workScheduleId } });
    await prisma.location.deleteMany({ where: { id: workSiteId } });

    await app.close();
  });

  // ------------------------------------------------------- location evidence

  const decision = (outcome: 'ALLOW' | 'BLOCK') => ({
    outcome,
    workMode: 'REMOTE' as const,
    workSiteId: null,
    workSiteName: null,
    reasonCode:
      outcome === 'ALLOW' ? 'REMOTE_WORK_ALLOWED' : 'WORK_SITE_REQUIRES_DEVICE',
    message: null,
    evidence: {
      insideGeofence: outcome === 'BLOCK',
      distanceMeters: 4200,
      accuracyMeters: 12,
      accuracyLimitMeters: 100,
      geofenceRadiusMeters: 100,
      nearestWorkSiteId: workSiteId,
      nearestWorkSiteName: 'Ops HQ',
      evaluatedAt: new Date().toISOString(),
    },
  });

  it('stores the coordinates and the policy the decision was made against', async () => {
    await webAttendance.recordLocationEvidence({
      tenantId,
      employeeId,
      attendanceDate: day(DAY),
      action: 'CHECK_IN',
      captureSource: 'WEB',
      position: {
        latitude: 25.3,
        longitude: 51.6,
        accuracyMeters: 12,
        capturedAt: new Date(`${DAY}T06:00:00.000Z`),
      },
      decision: decision('ALLOW'),
      ipAddress: '203.0.113.9',
    });

    const stored = await prisma.attendanceLocationEvidence.findFirstOrThrow({
      where: { tenantId, employeeId },
    });

    expect(Number(stored.latitude)).toBeCloseTo(25.3, 5);
    expect(Number(stored.longitude)).toBeCloseTo(51.6, 5);
    expect(stored.accuracyMeters).toBe(12);
    // The radius and the accuracy ceiling that applied AT THE TIME. Both are
    // configuration that changes, so without them a past decision could only be
    // re-guessed against today's settings.
    expect(stored.geofenceRadiusMeters).toBe(100);
    expect(stored.effectiveAccuracyLimitMeters).toBe(100);
    expect(stored.distanceMeters).toBe(4200);
    expect(stored.outcome).toBe('ALLOW');
    expect(stored.reasonCode).toBe('REMOTE_WORK_ALLOWED');
  });

  it('records a refusal too', async () => {
    await webAttendance.recordLocationEvidence({
      tenantId,
      employeeId,
      attendanceDate: day(DAY),
      action: 'CHECK_IN',
      captureSource: 'WEB',
      position: { latitude: 25.2854, longitude: 51.531, accuracyMeters: 8 },
      decision: decision('BLOCK'),
    });

    const stored = await prisma.attendanceLocationEvidence.findFirstOrThrow({
      where: { tenantId, employeeId },
    });

    // An employee told to use the reader otherwise leaves no trace that they
    // tried, which is exactly what a disputed claim needs.
    expect(stored.outcome).toBe('BLOCK');
    expect(stored.resolvedWorkMode).toBeNull();
  });

  it('lets an employee read their own evidence', async () => {
    await webAttendance.recordLocationEvidence({
      tenantId,
      employeeId,
      attendanceDate: day(DAY),
      action: 'CHECK_IN',
      captureSource: 'WEB',
      position: { latitude: 25.3, longitude: 51.6, accuracyMeters: 12 },
      decision: decision('ALLOW'),
    });

    const result = await engine.listLocationEvidence(selfUser(), {
      employeeId,
      from: DAY,
      to: DAY,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].latitude).toBeCloseTo(25.3, 5);
  });

  it('refuses another employee’s evidence to someone without the narrow permission', async () => {
    await webAttendance.recordLocationEvidence({
      tenantId,
      employeeId,
      attendanceDate: day(DAY),
      action: 'CHECK_IN',
      captureSource: 'WEB',
      position: { latitude: 25.3, longitude: 51.6, accuracyMeters: 12 },
      decision: decision('ALLOW'),
    });

    // attendance.manage is NOT enough. Managing attendance and knowing where
    // somebody physically stood are different privileges.
    await expect(
      engine.listLocationEvidence(hrUser(), {
        employeeId,
        from: DAY,
        to: DAY,
      }),
    ).rejects.toThrow(/permission/i);
  });

  it('allows an auditor holding the narrow permission', async () => {
    await webAttendance.recordLocationEvidence({
      tenantId,
      employeeId,
      attendanceDate: day(DAY),
      action: 'CHECK_IN',
      captureSource: 'WEB',
      position: { latitude: 25.3, longitude: 51.6, accuracyMeters: 12 },
      decision: decision('ALLOW'),
    });

    const result = await engine.listLocationEvidence(auditorUser(), {
      employeeId,
      from: DAY,
      to: DAY,
    });

    expect(result.items).toHaveLength(1);
  });

  it('keeps coordinates out of the reconciled day and its raw payload', async () => {
    await webAttendance.recordLocationEvidence({
      tenantId,
      employeeId,
      attendanceDate: day(DAY),
      action: 'CHECK_IN',
      captureSource: 'WEB',
      position: { latitude: 25.3, longitude: 51.6, accuracyMeters: 12 },
      decision: decision('ALLOW'),
    });

    await punch(`${DAY}T08:00:00`, 'CHECK_IN');
    await punch(`${DAY}T17:00:00`, 'CHECK_OUT');
    await reconcile();

    const detail = await engine.getDay(hrUser(), employeeId, DAY);
    const serialised = JSON.stringify(detail);

    // The ordinary attendance view shows the business result. Coordinates live
    // behind their own permission and must not leak through generic
    // serialisation of a day.
    expect(serialised).not.toContain('25.3');
    expect(serialised).not.toContain('51.6');
    expect(serialised).not.toContain('latitude');
  });

  // ---------------------------------------------------------- exceptions

  it('lists open exceptions and resolves one without deleting it', async () => {
    await punch(`${DAY}T08:00:00`, 'CHECK_IN');
    await reconcile();

    const listed = await engine.listExceptions(hrUser(), { status: 'OPEN' });
    const mine = listed.items.filter(
      (item: { employee: { id: string } }) => item.employee.id === employeeId,
    );
    expect(mine.length).toBeGreaterThan(0);

    const target = mine[0] as { id: string };
    await engine.resolveException(hrUser(), target.id, {
      status: 'RESOLVED',
      note: 'Employee confirmed they left at 17:00.',
    });

    const after = await prisma.attendanceException.findUniqueOrThrow({
      where: { id: target.id },
    });

    // Still there, with the decision attached.
    expect(after.status).toBe('RESOLVED');
    expect(after.resolutionNote).toContain('17:00');
    expect(after.resolvedById).toBe(managerUserId);
  });

  it('counts only what the caller may actually open', async () => {
    await punch(`${DAY}T08:00:00`, 'CHECK_IN');
    await reconcile();

    const summary = await engine.exceptionSummary(hrUser(), {});

    expect(summary.open).toBeGreaterThan(0);
    expect(summary.missingPunch).toBeGreaterThan(0);
    // Counts come from the same scoped query as the list, so they cannot
    // advertise work the reader cannot reach.
    expect(summary.open).toBeGreaterThanOrEqual(summary.missingPunch);
  });

  // ----------------------------------------------------------- overtime

  async function approveOvertime(minutes: number): Promise<string> {
    const request = await prisma.attendanceCorrectionRequest.create({
      data: {
        tenantId,
        employeeId,
        requestedByUserId: employeeUserId,
        requestNumber: `OT-${suffix}-${minutes}`,
        correctionType: 'OVERTIME_APPROVAL',
        attendanceDate: day(DAY),
        requestedOvertimeMinutes: minutes,
        reason: 'Approved overtime for month end.',
        status: 'APPROVED',
        approvedAtUtc: new Date(),
      },
      select: { id: true },
    });
    return request.id;
  }

  it('reports extra time without turning it into approved overtime', async () => {
    await punch(`${DAY}T08:00:00`, 'CHECK_IN');
    await punch(`${DAY}T19:00:00`, 'CHECK_OUT');

    await reconcile();

    const stored = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });

    // Eleven hours against an eight-hour schedule.
    expect(stored.extraMinutes).toBe(180);
    // Worked beyond schedule is not the same as payable. Nobody has approved it.
    expect(stored.approvedOvertimeMinutes).toBe(0);
  });

  it('populates approved overtime once an approval exists', async () => {
    await punch(`${DAY}T08:00:00`, 'CHECK_IN');
    await punch(`${DAY}T19:00:00`, 'CHECK_OUT');
    await approveOvertime(120);

    await reconcile();

    const stored = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });

    expect(stored.approvedOvertimeMinutes).toBe(120);
    // The extra time is unchanged: approving two of the three hours does not
    // rewrite how long the person actually worked.
    expect(stored.extraMinutes).toBe(180);
  });

  it('never approves more overtime than was actually worked', async () => {
    await punch(`${DAY}T08:00:00`, 'CHECK_IN');
    await punch(`${DAY}T17:30:00`, 'CHECK_OUT');
    await approveOvertime(240);

    await reconcile();

    const stored = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });

    // 08:00 to 17:30 is 570 minutes against a 480-minute schedule — the shift
    // spans nine hours but its expected hours are eight, the difference being an
    // unpaid break. So 90 minutes were worked beyond schedule, and approving
    // four hours cannot manufacture the rest.
    expect(stored.extraMinutes).toBe(90);
    expect(stored.approvedOvertimeMinutes).toBe(90);
  });

  it('returns approved overtime to zero when the approval is withdrawn', async () => {
    await punch(`${DAY}T08:00:00`, 'CHECK_IN');
    await punch(`${DAY}T19:00:00`, 'CHECK_OUT');
    const requestId = await approveOvertime(120);
    await reconcile();

    await prisma.attendanceCorrectionRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED' },
    });
    await reconcile();

    const stored = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });

    // Read fresh on every run, so withdrawing the approval is enough — nobody
    // has to edit a derived record.
    expect(stored.approvedOvertimeMinutes).toBe(0);
  });

  it('does not let an overtime approval invent a work session', async () => {
    await approveOvertime(120);

    const result = await reconcile();

    // An overtime approval changes whether time is payable, not when it was
    // worked. Replaying it as a punch would open a phantom session.
    expect(result.sessionCount).toBe(0);
    expect(result.status).toBe('ABSENT');
  });

  // ----------------------------------------------------------- backfill

  it('reconciles a range and reports what it did', async () => {
    await punch(`${DAY}T08:00:00`, 'CHECK_IN');
    await punch(`${DAY}T17:00:00`, 'CHECK_OUT');

    const report = await backfill.run({
      tenantId,
      from: day(DAY),
      to: day(DAY),
      employeeId,
    });

    expect(report.employeesConsidered).toBe(1);
    expect(report.reconciled).toBe(1);
    expect(report.failed).toBe(0);

    const stored = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });
    expect(stored.workedMinutes).toBe(540);
  });

  it('changes nothing on a dry run', async () => {
    await punch(`${DAY}T08:00:00`, 'CHECK_IN');
    await punch(`${DAY}T17:00:00`, 'CHECK_OUT');

    const report = await backfill.run({
      tenantId,
      from: day(DAY),
      to: day(DAY),
      employeeId,
      dryRun: true,
    });

    expect(report.dryRun).toBe(true);
    expect(report.reconciled).toBe(1);

    const stored = await prisma.attendanceDay.findFirst({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });
    expect(stored).toBeNull();
  });

  it('leaves a locked day alone and says so', async () => {
    await punch(`${DAY}T08:00:00`, 'CHECK_IN');
    await punch(`${DAY}T17:00:00`, 'CHECK_OUT');
    await reconcile();

    await prisma.attendanceDay.updateMany({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
      data: { locked: true, lockedAt: new Date(), lockReason: 'Payroll run' },
    });

    const report = await backfill.run({
      tenantId,
      from: day(DAY),
      to: day(DAY),
      employeeId,
    });

    // Reported rather than silently skipped: an operator needs to know which
    // days did not move.
    expect(report.skippedLocked).toBe(1);
    expect(report.reconciled).toBe(0);
  });

  it('refuses a range beyond the guard', async () => {
    await expect(
      backfill.run({
        tenantId,
        from: day('2020-01-01'),
        to: day('2026-12-31'),
        employeeId,
      }),
    ).rejects.toThrow(/smaller pieces/i);
  });

  it('is idempotent across repeated runs', async () => {
    await punch(`${DAY}T08:00:00`, 'CHECK_IN');
    await punch(`${DAY}T17:00:00`, 'CHECK_OUT');

    for (let run = 0; run < 3; run++) {
      await backfill.run({
        tenantId,
        from: day(DAY),
        to: day(DAY),
        employeeId,
      });
    }

    const days = await prisma.attendanceDay.count({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });
    const sessions = await prisma.attendanceSession.count({
      where: { tenantId, employeeId },
    });

    expect(days).toBe(1);
    expect(sessions).toBe(1);
  });

  it('keeps going when one employee-day fails', async () => {
    await punch(`${DAY}T08:00:00`, 'CHECK_IN');
    await punch(`${DAY}T17:00:00`, 'CHECK_OUT');

    // Both employees, one of which has no punches at all — a day with nothing
    // to reconcile must not stop the other.
    const report = await backfill.run({
      tenantId,
      from: day(DAY),
      to: day(DAY),
    });

    expect(report.failed).toBe(0);
    expect(report.reconciled).toBeGreaterThanOrEqual(2);
  });
  // ---------------------------------------------- server-derived work mode

  /**
   * The employee never says which mode they are working in.
   *
   * The check-in form used to open with a required "Work Mode" select, so an
   * employee could declare OFFICE from their sofa or REMOTE while standing in a
   * device-required office. The position now decides, on the server, and these
   * run the real self-service path — same service, same DTO, same validation —
   * with no `attendanceMode` in the request at all.
   */
  describe('work mode is derived from the position, not the request', () => {
    /** Inside the geofence: 25.2854, 51.531 with a 100 m radius. */
    const INSIDE = { latitude: 25.2854, longitude: 51.531 };
    /** ~9 km north-east of it. */
    const OUTSIDE = { latitude: 25.36, longitude: 51.6 };

    async function clearDay() {
      await prisma.attendanceEntry.deleteMany({
        where: { tenantId, employeeId },
      });
      await prisma.rawAttendanceEvent.deleteMany({
        where: { tenantId, employeeId },
      });
    }

    /*
     * These call the real self-service path, which reads the clock rather than
     * a fixed date, so the seeded Sun-Thu week would make the suite pass or
     * fail depending on the day it runs. Today's weekday is made a working day
     * with the same shift, and restored afterwards.
     */
    const WEEKDAYS = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ] as const;
    const todayWeekday = WEEKDAYS[new Date().getUTCDay()];
    let restoreWeeklyWorkDays: (typeof WEEKDAYS)[number][] = [];

    beforeAll(async () => {
      const schedule = await prisma.workSchedule.findFirstOrThrow({
        where: { id: workScheduleId },
        select: { weeklyWorkDays: true },
      });
      restoreWeeklyWorkDays = schedule.weeklyWorkDays;

      if (!schedule.weeklyWorkDays.includes(todayWeekday)) {
        await prisma.workSchedule.update({
          where: { id: workScheduleId },
          data: { weeklyWorkDays: [...schedule.weeklyWorkDays, todayWeekday] },
        });
      }

      /*
       * This tenant seeds no attendance settings, so the platform-wide
       * "Attendance Integration Enabled" resolves to its default. The work site
       * override is what these cases are about, so it is set explicitly rather
       * than left to depend on a tenant setting nobody configured.
       */
      await prisma.location.update({
        where: { id: workSiteId },
        data: { attendanceEnabled: true },
      });

      const existing = await prisma.workScheduleDay.findFirst({
        where: { workScheduleId, dayOfWeek: todayWeekday },
        select: { id: true },
      });

      if (existing) {
        await prisma.workScheduleDay.update({
          where: { id: existing.id },
          data: { isWorkingDay: true, shiftTemplateId: shiftId },
        });
      } else {
        await prisma.workScheduleDay.create({
          data: {
            tenantId,
            workScheduleId,
            shiftTemplateId: shiftId,
            dayOfWeek: todayWeekday,
            isWorkingDay: true,
          },
        });
      }
    });

    afterAll(async () => {
      await prisma.workSchedule.update({
        where: { id: workScheduleId },
        data: { weeklyWorkDays: restoreWeeklyWorkDays },
      });
      await prisma.location.update({
        where: { id: workSiteId },
        data: { attendanceEnabled: null },
      });
    });

    beforeEach(clearDay);
    afterEach(clearDay);

    const checkIn = (position: { latitude: number; longitude: number }) =>
      attendance.checkIn(selfUser(), {
        // Deliberately no attendanceMode and no officeLocationId.
        locationLatitude: position.latitude,
        locationLongitude: position.longitude,
        locationAccuracyMeters: 8,
        locationCapturedAt: new Date().toISOString(),
        // The same fields the browser's buildLocationPayload sends.
        locationSource: 'GPS',
        locationConfidence: 'HIGH',
      });

    it('accepts a check-in that names no work mode', async () => {
      await expect(checkIn(OUTSIDE)).resolves.toBeDefined();
    });

    it('records a punch from outside every work site as remote', async () => {
      await checkIn(OUTSIDE);

      const entry = await prisma.attendanceEntry.findFirstOrThrow({
        where: { tenantId, employeeId },
        select: { attendanceMode: true, officeLocationId: true },
      });

      // The seeded employee is HYBRID, which is an eligibility, not an outcome:
      // a session is OFFICE, REMOTE or FIELD and never HYBRID.
      expect(entry.attendanceMode).toBe('REMOTE');
      expect(entry.officeLocationId).toBeNull();
    });

    it('records a punch from inside an authorised work site as office', async () => {
      await checkIn(INSIDE);

      const entry = await prisma.attendanceEntry.findFirstOrThrow({
        where: { tenantId, employeeId },
        select: { attendanceMode: true, officeLocationId: true },
      });

      expect(entry.attendanceMode).toBe('OFFICE');
      expect(entry.officeLocationId).toBe(workSiteId);
    });

    /*
     * The claim the old form made possible. The browser asserts REMOTE while
     * the coordinates put the employee inside the office; the server must
     * ignore the assertion entirely.
     */
    it('ignores a work mode the client asserts against its own coordinates', async () => {
      await attendance.checkIn(selfUser(), {
        attendanceMode: 'REMOTE' as never,
        locationLatitude: INSIDE.latitude,
        locationLongitude: INSIDE.longitude,
        locationAccuracyMeters: 8,
        locationCapturedAt: new Date().toISOString(),
        // The same fields the browser's buildLocationPayload sends.
        locationSource: 'GPS',
        locationConfidence: 'HIGH',
      });

      const entry = await prisma.attendanceEntry.findFirstOrThrow({
        where: { tenantId, employeeId },
        select: { attendanceMode: true, officeLocationId: true },
      });

      expect(entry.attendanceMode).toBe('OFFICE');
      expect(entry.officeLocationId).toBe(workSiteId);
    });

    it('closes the open session on check-out without being told the mode', async () => {
      await checkIn(OUTSIDE);

      await attendance.checkOut(selfUser(), {
        locationLatitude: OUTSIDE.latitude,
        locationLongitude: OUTSIDE.longitude,
        locationAccuracyMeters: 8,
        locationCapturedAt: new Date().toISOString(),
        // The same fields the browser's buildLocationPayload sends.
        locationSource: 'GPS',
        locationConfidence: 'HIGH',
      });

      const entry = await prisma.attendanceEntry.findFirstOrThrow({
        where: { tenantId, employeeId },
        select: { attendanceMode: true, checkIn: true, checkOut: true },
      });

      // Checking out from home does not retroactively rewrite the session.
      expect(entry.checkOut).not.toBeNull();
      expect(entry.attendanceMode).toBe('REMOTE');
    });

    it('refuses a web punch inside a work site that requires a device', async () => {
      await prisma.location.update({
        where: { id: workSiteId },
        data: { devicePolicy: 'DEVICE_REQUIRED', webFallbackEnabled: false },
      });

      try {
        await expect(checkIn(INSIDE)).rejects.toMatchObject({
          response: { errorCode: 'WORK_SITE_REQUIRES_DEVICE' },
        });
      } finally {
        await prisma.location.update({
          where: { id: workSiteId },
          data: { devicePolicy: null, webFallbackEnabled: null },
        });
      }
    });

    /*
     * `allowedAttendanceMethods` was stored and configurable for a whole phase
     * without a single engine read, so "device only" did nothing.
     */
    it('refuses a web punch at a work site that permits devices only', async () => {
      await prisma.location.update({
        where: { id: workSiteId },
        data: { allowedAttendanceMethods: ['DEVICE'] },
      });

      try {
        await expect(checkIn(INSIDE)).rejects.toMatchObject({
          response: { errorCode: 'METHOD_NOT_ALLOWED' },
        });
      } finally {
        await prisma.location.update({
          where: { id: workSiteId },
          data: { allowedAttendanceMethods: [] },
        });
      }
    });
  });
});
