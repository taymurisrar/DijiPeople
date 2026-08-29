import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AttendanceEngineService } from '../src/modules/attendance-engine/attendance-engine.service';
import { AttendanceReconciliationService } from '../src/modules/attendance-engine/attendance-reconciliation.service';
import { ImpossibleTravelDetectorService } from '../src/modules/attendance-engine/impossible-travel-detector.service';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';

/**
 * The review surfaces: what a manager opens, and what the travel detector puts
 * in front of them.
 *
 * These run against the real database because the questions are about scope and
 * about rows — who may open an exception, whether a finding is raised once or
 * twice, whether a view's count describes the whole filtered set. None of those
 * can be answered honestly against a mock.
 */
describe('Attendance review surfaces (e2e)', () => {
  jest.setTimeout(240_000);

  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let reconciliation: AttendanceReconciliationService;
  let engine: AttendanceEngineService;
  let detector: ImpossibleTravelDetectorService;

  const suffix = `rev-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  let tenantId: string;
  let otherTenantId: string;
  let employeeId: string;
  let colleagueId: string;
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

  const KARACHI = { latitude: 24.8607, longitude: 67.0011 };
  const LONDON = { latitude: 51.5074, longitude: -0.1278 };

  /** Manages attendance, but is not an auditor: may not see coordinates. */
  const hrUser = (): AuthenticatedUser =>
    ({
      userId: managerUserId,
      tenantId,
      email: 'hr@example.test',
      permissionKeys: ['attendance.read', 'attendance.manage'],
    }) as AuthenticatedUser;

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

  /** A reviewer in a different tenant, with every attendance permission. */
  const foreignUser = (): AuthenticatedUser =>
    ({
      userId: randomUUID(),
      tenantId: otherTenantId,
      email: 'foreign@example.test',
      permissionKeys: [
        'attendance.read',
        'attendance.manage',
        'attendance.locationEvidence.read',
      ],
    }) as AuthenticatedUser;

  async function punch(
    localTime: string,
    direction: 'CHECK_IN' | 'CHECK_OUT',
    employee = employeeId,
  ) {
    await prisma.rawAttendanceEvent.create({
      data: {
        tenantId,
        employeeId: employee,
        integrationId,
        deviceId,
        provider: 'ZKTECO',
        externalUserId: '31',
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

  async function evidence(input: {
    employee?: string;
    at: string;
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    outcome?: 'ALLOW' | 'BLOCK';
  }): Promise<string> {
    const row = await prisma.attendanceLocationEvidence.create({
      data: {
        tenantId,
        employeeId: input.employee ?? employeeId,
        attendanceDate: day(DAY),
        capturedAt: new Date(input.at),
        action: 'CHECK_IN',
        captureSource: 'WEB',
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMeters: input.accuracyMeters ?? 20,
        matchedWorkSiteId: workSiteId,
        outcome: input.outcome ?? 'ALLOW',
        reasonCode: 'INSIDE_GEOFENCE',
        resolvedWorkMode: 'OFFICE',
      },
      select: { id: true },
    });
    return row.id;
  }

  const reconcile = (date = DAY, employee = employeeId) =>
    reconciliation.reconcile(tenantId, employee, day(date));

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
    detector = app.get(ImpossibleTravelDetectorService);

    const tenant = await prisma.tenant.findFirstOrThrow({
      where: { businessUnits: { some: {} } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    tenantId = tenant.id;

    // Any second tenant will do; the point is only that it is not this one.
    const other = await prisma.tenant.findFirst({
      where: { id: { not: tenantId } },
      select: { id: true },
    });
    otherTenantId = other?.id ?? randomUUID();

    const businessUnit = await prisma.businessUnit.findFirstOrThrow({
      where: { tenantId },
      select: { id: true },
    });

    workSiteId = (
      await prisma.location.create({
        data: {
          tenantId,
          name: `Review HQ ${suffix}`,
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
        name: `Review schedule ${suffix}`,
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
        name: `Review shift ${suffix}`,
        code: `REV-${suffix}`,
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

    employeeUserId = await createUser('rev-self');
    managerUserId = await createUser('rev-mgr');

    employeeId = await createEmployee(
      `REV1-${suffix}`,
      businessUnit.id,
      employeeUserId,
    );
    colleagueId = await createEmployee(`REV2-${suffix}`, businessUnit.id, null);

    const integration = await prisma.attendanceIntegration.create({
      data: {
        tenantId,
        name: `Review integration ${suffix}`,
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
          name: `Review device ${suffix}`,
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
        firstName: 'Review',
        lastName: label,
        email: `${label}-${suffix}@example.test`,
        passwordHash: 'not-used-in-this-test',
        /*
         * TASK-0009 WP-09 — `identityId` is required since the contract phase.
         *
         * `upsert` rather than `create`: a fixture that puts the same address in
         * two tenants is modelling one person in two workspaces, which is what
         * Identity is for — and `Identity.email` is globally unique, so a plain
         * create would collide on the second.
         *
         * Resolved to a scalar rather than written as a nested relation because
         * Prisma refuses to mix the two: one nested write here would require
         * `tenant` and `businessUnit` to be nested as well.
         */
        identityId: (
          await prisma.identity.upsert({
            where: {
              email: `${label}-${suffix}@example.test`.trim().toLowerCase(),
            },
            update: {},
            create: {
              email: `${label}-${suffix}@example.test`.trim().toLowerCase(),
              passwordHash: 'not-used-in-this-test',
            },
            select: { id: true },
          })
        ).id,
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
        firstName: 'Review',
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

  /** An exception of a given type, created directly so the test states its case. */
  async function exception(
    type: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const row = await prisma.attendanceException.create({
      data: {
        tenantId,
        employeeId,
        attendanceDate: day(DAY),
        type: type as never,
        severity: 'WARNING',
        status: 'OPEN',
        dedupeKey: `${suffix}-${type}-${randomUUID()}`,
        message: 'Raised by a test.',
        ...overrides,
      },
      select: { id: true },
    });
    return row.id;
  }

  afterEach(async () => {
    const employees = [employeeId, colleagueId].filter(Boolean);
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
    const employees = [employeeId, colleagueId].filter(Boolean);
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
    await moduleRef.close();
  });

  // ---------------------------------------------------------- exception detail

  describe('exception detail', () => {
    it('answers with the day behind the exception, not just the exception', async () => {
      await punch(`${DAY}T08:00:00`, 'CHECK_IN');
      await punch(`${DAY}T17:00:00`, 'CHECK_OUT');
      await reconcile();

      const id = await exception('MISSING_CHECKOUT');
      const detail = await engine.getExceptionDetail(hrUser(), id);

      // The whole reason the drawer exists: a reviewer decides from the day, not
      // from a one-line message.
      expect(detail.attendanceDay).not.toBeNull();
      expect(detail.attendanceDay!.workedMinutes).toBeGreaterThan(0);
      expect(detail.sessions.length).toBeGreaterThan(0);
      // Sessions come back in the order they were worked, not by id.
      expect(detail.sessions[0].sequence).toBe(0);
      expect(detail.employee.id).toBe(employeeId);
      expect(detail.attendanceDate).toBe(DAY);
    });

    it('says plainly that there is no reconciled day rather than guessing one', async () => {
      const id = await exception('MISSING_CHECKIN');
      const detail = await engine.getExceptionDetail(hrUser(), id);

      // A guessed total would be worse than none: it would be read as a result.
      expect(detail.attendanceDay).toBeNull();
      expect(detail.sessions).toEqual([]);
    });

    it('carries the approved leave that makes an attendance-during-leave case make sense', async () => {
      const leaveType = await prisma.leaveType.findFirst({
        where: { tenantId },
        select: { id: true },
      });

      if (!leaveType) {
        // The tenant has no leave types configured; the linkage is exercised by
        // the query shape rather than skipped silently.
        const id = await exception('ATTENDANCE_DURING_LEAVE');
        expect(
          (await engine.getExceptionDetail(hrUser(), id)).leave,
        ).toBeNull();
        return;
      }

      const leave = await prisma.leaveRequest.create({
        data: {
          tenantId,
          employeeId,
          leaveTypeId: leaveType.id,
          startDate: day(DAY),
          endDate: day(DAY),
          totalDays: 1,
          status: 'APPROVED',
          reason: 'Annual leave.',
        },
        select: { id: true },
      });

      try {
        const id = await exception('ATTENDANCE_DURING_LEAVE');
        const detail = await engine.getExceptionDetail(hrUser(), id);

        expect(detail.leave).not.toBeNull();
        expect(detail.leave!.id).toBe(leave.id);
      } finally {
        await prisma.leaveRequest.deleteMany({ where: { id: leave.id } });
      }
    });

    it('shows the corrections raised for the same day, and builds history only from real timestamps', async () => {
      const created = new Date('2026-08-18T06:00:00.000Z');
      const approved = new Date('2026-08-18T08:00:00.000Z');

      await prisma.attendanceCorrectionRequest.create({
        data: {
          tenantId,
          employeeId,
          requestedByUserId: employeeUserId,
          requestNumber: `CR-${suffix}`,
          correctionType: 'MISSED_CHECK_OUT',
          attendanceDate: day(DAY),
          reason: 'I forgot to check out.',
          status: 'APPROVED',
          createdAtUtc: created,
          approvedAtUtc: approved,
        },
      });

      const id = await exception('MISSING_CHECKOUT');
      const detail = await engine.getExceptionDetail(hrUser(), id);

      expect(detail.corrections).toHaveLength(1);

      const labels = detail.history.map((entry) => entry.label);
      expect(labels).toContain('Detected');
      expect(labels).toContain('Correction requested');
      expect(labels).toContain('Correction approved');
      // Nothing invented: a request that was never rejected has no rejection.
      expect(labels).not.toContain('Correction rejected');

      const times = detail.history.map((entry) => new Date(entry.at).getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    it('keeps a closed exception readable, with what was decided', async () => {
      const resolvedAt = new Date('2026-08-18T09:00:00.000Z');
      const id = await exception('MISSING_CHECKOUT', {
        status: 'RESOLVED',
        resolvedAt,
        resolvedById: managerUserId,
        resolutionNote: 'Employee confirmed they left at 17:00.',
        resolutionSource: 'MANUAL',
      });

      const detail = await engine.getExceptionDetail(hrUser(), id);

      // Closed items are the audit trail for attendance that was eventually
      // paid. They are kept, never deleted, and stay openable.
      expect(detail.status).toBe('RESOLVED');
      expect(detail.resolutionNote).toContain('17:00');
      expect(detail.history.map((entry) => entry.label)).toContain('Resolved');
    });

    it('cannot be opened from another tenant, whatever the permissions', async () => {
      const id = await exception('MISSING_CHECKOUT');

      await expect(
        engine.getExceptionDetail(foreignUser(), id),
      ).rejects.toThrow(/could not be found/i);
    });

    it('cannot be opened for somebody else by an employee with only self access', async () => {
      const id = await prisma.attendanceException
        .create({
          data: {
            tenantId,
            employeeId: colleagueId,
            attendanceDate: day(DAY),
            type: 'MISSING_CHECKOUT',
            severity: 'WARNING',
            status: 'OPEN',
            dedupeKey: `${suffix}-colleague-${randomUUID()}`,
            message: 'Raised by a test.',
          },
          select: { id: true },
        })
        .then((row) => row.id);

      await expect(engine.getExceptionDetail(selfUser(), id)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------- evidence access

  describe('location evidence access', () => {
    it('offers coordinates only for exceptions that turn on a position', async () => {
      const missing = await exception('MISSING_CHECKOUT');
      const geofence = await exception('GEOFENCE_FAILURE');

      const forMissing = await engine.getExceptionDetail(
        auditorUser(),
        missing,
      );
      const forGeofence = await engine.getExceptionDetail(
        auditorUser(),
        geofence,
      );

      // Someone reviewing a forgotten punch has no reason to pull a position.
      expect(forMissing.locationEvidence.relevant).toBe(false);
      expect(forMissing.locationEvidence.viewable).toBe(false);
      expect(forGeofence.locationEvidence.relevant).toBe(true);
      expect(forGeofence.locationEvidence.viewable).toBe(true);
    });

    it('does not open coordinates to attendance.manage on its own', async () => {
      const id = await exception('IMPOSSIBLE_TRAVEL');

      const forHr = await engine.getExceptionDetail(hrUser(), id);

      // Managing attendance is a different question from auditing where a
      // person was. The panel is absent rather than present and refused.
      expect(forHr.locationEvidence.relevant).toBe(true);
      expect(forHr.locationEvidence.viewable).toBe(false);
    });

    it('lets an employee see the positions recorded about themselves', async () => {
      const id = await exception('GEOFENCE_FAILURE');

      const forSelf = await engine.getExceptionDetail(selfUser(), id);

      expect(forSelf.locationEvidence.viewable).toBe(true);
    });
  });

  // --------------------------------------------------------------- team days

  describe('team days', () => {
    it('counts the whole filtered set, not the page', async () => {
      await punch(`${DAY}T08:00:00`, 'CHECK_IN');
      await punch(`${DAY}T17:00:00`, 'CHECK_OUT');
      await reconcile();

      const result = await engine.listTeamDays(hrUser(), {
        from: DAY,
        to: DAY,
        employeeId,
        pageSize: 1,
      });

      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].employee.id).toBe(employeeId);
      // The link target for the row, so the UI does not need a second detail page.
      expect(result.items[0]).toHaveProperty('attendanceEntryId');
    });

    it('finds the days with something open under Needs review', async () => {
      await punch(`${DAY}T08:00:00`, 'CHECK_IN');
      await reconcile();

      const needsReview = await engine.listTeamDays(hrUser(), {
        from: DAY,
        to: DAY,
        employeeId,
        view: 'NEEDS_REVIEW',
      });

      // A check-in with no check-out is exactly what this view is for.
      expect(needsReview.total).toBe(1);
      expect(needsReview.items[0].openExceptionCount).toBeGreaterThan(0);
    });

    it('reports hybrid from the day that was worked, never the employee record', async () => {
      // The fixture employee is configured HYBRID and worked a single office
      // day, so a view keyed on configuration would wrongly return it.
      await punch(`${DAY}T08:00:00`, 'CHECK_IN');
      await punch(`${DAY}T17:00:00`, 'CHECK_OUT');
      await reconcile();

      const configured = await prisma.employee.findUniqueOrThrow({
        where: { id: employeeId },
        select: { workMode: true },
      });
      expect(configured.workMode).toBe('HYBRID');

      const hybrid = await engine.listTeamDays(hrUser(), {
        from: DAY,
        to: DAY,
        employeeId,
        view: 'HYBRID',
      });

      expect(hybrid.total).toBe(0);
    });

    it('separates finalised days from finalised days that gained new evidence', async () => {
      await punch(`${DAY}T08:00:00`, 'CHECK_IN');
      await punch(`${DAY}T17:00:00`, 'CHECK_OUT');
      await reconcile();

      await prisma.attendanceDay.updateMany({
        where: { tenantId, employeeId, attendanceDate: day(DAY) },
        data: {
          locked: true,
          lockedAt: new Date(),
          lockReason: 'Payroll run.',
        },
      });

      const locked = await engine.listTeamDays(hrUser(), {
        from: DAY,
        to: DAY,
        employeeId,
        view: 'LOCKED',
      });
      expect(locked.total).toBe(1);

      const before = await engine.listTeamDays(hrUser(), {
        from: DAY,
        to: DAY,
        employeeId,
        view: 'LOCKED_WITH_NEW_EVIDENCE',
      });
      expect(before.total).toBe(0);

      // A punch arriving after the lock is evidence, not a revision. Attached to
      // the day, as reconciliation attaches the ones it raises.
      const lockedDay = await prisma.attendanceDay.findFirstOrThrow({
        where: { tenantId, employeeId, attendanceDate: day(DAY) },
        select: { id: true },
      });
      await exception('LOCKED_PERIOD_EVENT', { attendanceDayId: lockedDay.id });

      const after = await engine.listTeamDays(hrUser(), {
        from: DAY,
        to: DAY,
        employeeId,
        view: 'LOCKED_WITH_NEW_EVIDENCE',
      });
      expect(after.total).toBe(1);
      expect(after.items[0].locked).toBe(true);
    });

    it('shows nothing from another tenant', async () => {
      await punch(`${DAY}T08:00:00`, 'CHECK_IN');
      await punch(`${DAY}T17:00:00`, 'CHECK_OUT');
      await reconcile();

      const foreign = await engine.listTeamDays(foreignUser(), {
        from: DAY,
        to: DAY,
      });

      expect(
        foreign.items.some((item) => item.employee.id === employeeId),
      ).toBe(false);
    });
  });

  // -------------------------------------------------------- impossible travel

  describe('impossible travel', () => {
    it('raises one warning for two positions that cannot both be true', async () => {
      await evidence({ at: `${DAY}T05:00:00.000Z`, ...KARACHI });
      const second = await evidence({ at: `${DAY}T05:30:00.000Z`, ...LONDON });

      const result = await detector.evaluateForEvidence(tenantId, second);
      expect(result.flagged).toBe(1);

      const raised = await prisma.attendanceException.findMany({
        where: { tenantId, employeeId, type: 'IMPOSSIBLE_TRAVEL' },
      });

      expect(raised).toHaveLength(1);
      expect(raised[0].severity).toBe('WARNING');
      expect(raised[0].status).toBe('OPEN');

      // Positions stay in AttendanceLocationEvidence behind their own
      // permission; the exception carries the arithmetic only.
      const serialised = JSON.stringify(raised[0]);
      expect(serialised).not.toContain(String(LONDON.latitude));
      expect(serialised).not.toContain(String(KARACHI.longitude));
    });

    it('does not stack duplicates when the same pair is re-evaluated', async () => {
      const first = await evidence({ at: `${DAY}T05:00:00.000Z`, ...KARACHI });
      const second = await evidence({ at: `${DAY}T05:30:00.000Z`, ...LONDON });

      await detector.evaluateForEvidence(tenantId, second);
      await detector.evaluateForEvidence(tenantId, second);
      // From the other end of the same pair, which must produce the same key.
      await detector.evaluateForEvidence(tenantId, first);

      const raised = await prisma.attendanceException.count({
        where: { tenantId, employeeId, type: 'IMPOSSIBLE_TRAVEL' },
      });

      expect(raised).toBe(1);
    });

    it('does not reopen a finding a person has already closed', async () => {
      await evidence({ at: `${DAY}T05:00:00.000Z`, ...KARACHI });
      const second = await evidence({ at: `${DAY}T05:30:00.000Z`, ...LONDON });

      await detector.evaluateForEvidence(tenantId, second);

      await prisma.attendanceException.updateMany({
        where: { tenantId, employeeId, type: 'IMPOSSIBLE_TRAVEL' },
        data: {
          status: 'IGNORED',
          resolvedAt: new Date(),
          resolutionNote: 'Known GPS fault on this handset.',
        },
      });

      await detector.evaluateForEvidence(tenantId, second);

      const raised = await prisma.attendanceException.findMany({
        where: { tenantId, employeeId, type: 'IMPOSSIBLE_TRAVEL' },
      });

      // HR who has already decided "bad GPS" should not be asked again on
      // every re-run.
      expect(raised).toHaveLength(1);
      expect(raised[0].status).toBe('IGNORED');
    });

    it('puts the day in front of a manager rather than only in the table', async () => {
      await punch(`${DAY}T08:00:00`, 'CHECK_IN');
      await punch(`${DAY}T17:00:00`, 'CHECK_OUT');
      await reconcile();

      await evidence({ at: `${DAY}T05:00:00.000Z`, ...KARACHI });
      const second = await evidence({ at: `${DAY}T05:30:00.000Z`, ...LONDON });
      await detector.evaluateForEvidence(tenantId, second);

      const needsReview = await engine.listTeamDays(hrUser(), {
        from: DAY,
        to: DAY,
        employeeId,
        view: 'NEEDS_REVIEW',
      });

      // The view is keyed on the day's open count. A finding that never reached
      // that column would exist and still be invisible to the person who reviews.
      expect(needsReview.total).toBe(1);
      expect(needsReview.items[0].openExceptionCount).toBe(1);
    });

    it('leaves the day, its sessions and its worked time untouched', async () => {
      await punch(`${DAY}T08:00:00`, 'CHECK_IN');
      await punch(`${DAY}T17:00:00`, 'CHECK_OUT');
      const reconciled = await reconcile();

      await evidence({ at: `${DAY}T05:00:00.000Z`, ...KARACHI });
      const second = await evidence({ at: `${DAY}T05:30:00.000Z`, ...LONDON });
      await detector.evaluateForEvidence(tenantId, second);

      const after = await prisma.attendanceDay.findFirstOrThrow({
        where: { tenantId, employeeId, attendanceDate: day(DAY) },
      });

      // A risk signal, nothing more. It never rejects attendance, alters a
      // session, reduces worked time or blocks payroll.
      expect(after.workedMinutes).toBe(reconciled.workedMinutes);
      expect(after.sessionCount).toBe(reconciled.sessionCount);
      expect(after.locked).toBe(false);
    });

    it('never compares one person against a colleague', async () => {
      await evidence({ at: `${DAY}T05:00:00.000Z`, ...KARACHI });
      const colleagueEvidence = await evidence({
        employee: colleagueId,
        at: `${DAY}T05:30:00.000Z`,
        ...LONDON,
      });

      const result = await detector.evaluateForEvidence(
        tenantId,
        colleagueEvidence,
      );

      expect(result.flagged).toBe(0);
      expect(
        await prisma.attendanceException.count({
          where: { tenantId, type: 'IMPOSSIBLE_TRAVEL' },
        }),
      ).toBe(0);
    });

    it('ignores a refused position entirely', async () => {
      await evidence({
        at: `${DAY}T05:00:00.000Z`,
        ...KARACHI,
        outcome: 'BLOCK',
      });
      const second = await evidence({ at: `${DAY}T05:30:00.000Z`, ...LONDON });

      const result = await detector.evaluateForEvidence(tenantId, second);

      // A refused punch is not a statement about where anybody was.
      expect(result.pairsExamined).toBe(0);
      expect(result.flagged).toBe(0);
    });

    it('says nothing about an ordinary day at one site', async () => {
      await evidence({ at: `${DAY}T05:00:00.000Z`, ...KARACHI });
      const second = await evidence({
        at: `${DAY}T13:00:00.000Z`,
        latitude: KARACHI.latitude + 0.05,
        longitude: KARACHI.longitude,
      });

      const result = await detector.evaluateForEvidence(tenantId, second);

      expect(result.pairsExamined).toBe(1);
      expect(result.flagged).toBe(0);
    });
  });
});
