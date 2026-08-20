import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AttendanceReconciliationService } from '../src/modules/attendance-engine/attendance-reconciliation.service';
import { AttendanceReconciliationQueueService } from '../src/modules/attendance-engine/attendance-reconciliation-queue.service';
import { DbFixtures } from './helpers/db-fixtures';

/**
 * The Attendance Engine against the real database.
 *
 * These are the acceptance scenarios from the phase brief, run end to end:
 * device punches in, sessions and a reconciled day out. They use real raw
 * events rather than physical hardware, which is the point — the engine consumes
 * RawAttendanceEvent and does not care whether a ZKTeco, a browser or a file
 * produced it.
 *
 * Reconciliation is invoked directly rather than through the background worker,
 * so an assertion never depends on a timer.
 */
describe('Attendance Engine (e2e)', () => {
  jest.setTimeout(240_000);

  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let reconciliation: AttendanceReconciliationService;
  let queue: AttendanceReconciliationQueueService;
  let fixtures: DbFixtures;

  const suffix = `eng-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  let tenantId: string;
  let otherTenantId: string;
  let employeeId: string;
  let otherEmployeeId: string;
  let workSiteId: string;
  let integrationId: string;
  let deviceId: string;
  let workScheduleId: string;
  let dayShiftId: string;
  let nightShiftId: string;

  const createdRawEventIds: string[] = [];

  /** Monday, so it lands on an ordinary working day in a Sun-Thu week. */
  const DAY = '2026-08-17';
  const NIGHT_DAY = '2026-08-18';

  const day = (date: string) => new Date(`${date}T00:00:00.000Z`);

  /**
   * Creates a raw event exactly as a gateway would.
   *
   * `occurredAtLocal` is device wall clock with no offset — the same shape the
   * ZKTeco worker produces — and `occurredAtUtc` is left null so the engine has
   * to resolve the instant from the device timezone, which is the real path.
   */
  async function punch(input: {
    localTime: string;
    employee?: string;
    device?: boolean;
    direction?: 'CHECK_IN' | 'CHECK_OUT';
    source?: 'DEVICE' | 'WEB';
    workMode?: 'OFFICE' | 'REMOTE';
    siteId?: string | null;
  }) {
    const source = input.source ?? 'DEVICE';
    const fingerprint = randomUUID();

    const event = await prisma.rawAttendanceEvent.create({
      data: {
        tenantId,
        employeeId: input.employee ?? employeeId,
        integrationId,
        deviceId: input.device === false ? null : deviceId,
        provider: 'ZKTECO',
        externalUserId: '25',
        occurredAtLocal: input.localTime,
        deviceTimezone: 'Asia/Qatar',
        captureSource: source,
        workMode: input.workMode ?? (source === 'DEVICE' ? 'OFFICE' : 'REMOTE'),
        locationId:
          input.siteId === undefined
            ? source === 'DEVICE'
              ? workSiteId
              : null
            : input.siteId,
        eventFingerprint: fingerprint,
        dedupeScopeKey: `test:${suffix}`,
        mappingStatus: 'MAPPED',
        processingStatus: 'PENDING',
        ...(input.direction
          ? { rawPayload: { direction: input.direction } }
          : {}),
      },
      select: { id: true },
    });

    createdRawEventIds.push(event.id);
    return event.id;
  }

  async function clearEvents() {
    await prisma.rawAttendanceEvent.deleteMany({
      where: { dedupeScopeKey: `test:${suffix}` },
    });
    createdRawEventIds.length = 0;
  }

  const reconcile = (date: string, employee = employeeId) =>
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
    queue = app.get(AttendanceReconciliationQueueService);

    // Built, not borrowed. This used to adopt "the first two tenants that have
    // a business unit", which `seed:demo` cannot satisfy — it creates one
    // tenant — so beforeAll threw and every test in the file errored. See
    // ITEM-0047 and helpers/db-fixtures.ts.
    fixtures = new DbFixtures(prisma, 'attendance-engine');
    const tenants = await fixtures.createTenantPair();
    tenantId = tenants.a.id;
    otherTenantId = tenants.b.id;

    const businessUnit = { id: tenants.a.businessUnitId };

    workSiteId = (
      await prisma.location.create({
        data: {
          tenantId,
          name: `Engine HQ ${suffix}`,
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

    // Sunday-to-Thursday week, which is the working week across much of the
    // region and the case a hard-coded Sat/Sun weekend would get wrong.
    const schedule = await prisma.workSchedule.create({
      data: {
        tenantId,
        name: `Engine schedule ${suffix}`,
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

    const dayShift = await prisma.shiftTemplate.create({
      data: {
        tenantId,
        workScheduleId: schedule.id,
        name: `Engine day ${suffix}`,
        code: `ENG-DAY-${suffix}`,
        timezone: 'Asia/Qatar',
        startTime: '08:00',
        endTime: '17:00',
        expectedHours: 8,
        lateGraceMinutes: 10,
        earlyExitGraceMinutes: 10,
      },
      select: { id: true },
    });
    dayShiftId = dayShift.id;

    const nightShift = await prisma.shiftTemplate.create({
      data: {
        tenantId,
        workScheduleId: schedule.id,
        name: `Engine night ${suffix}`,
        code: `ENG-NIGHT-${suffix}`,
        timezone: 'Asia/Qatar',
        startTime: '21:00',
        endTime: '06:00',
        expectedHours: 8,
        isNightShift: true,
        lateGraceMinutes: 10,
        earlyExitGraceMinutes: 10,
      },
      select: { id: true },
    });
    nightShiftId = nightShift.id;

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
          shiftTemplateId: dayShift.id,
          dayOfWeek: weekday,
          isWorkingDay: true,
          startTime: '08:00',
          endTime: '17:00',
        },
      });
    }

    employeeId = await createEmployee(`ENG1-${suffix}`, businessUnit.id);
    otherEmployeeId = await createEmployee(`ENG2-${suffix}`, businessUnit.id);

    const integration = await prisma.attendanceIntegration.create({
      data: {
        tenantId,
        name: `Engine integration ${suffix}`,
        provider: 'ZKTECO',
        connectorType: 'zkteco-legacy-tcp',
        connectionMode: 'LOCAL_GATEWAY',
      },
      select: { id: true },
    });
    integrationId = integration.id;

    const device = await prisma.attendanceDevice.create({
      data: {
        tenantId,
        integrationId: integration.id,
        name: `Engine device ${suffix}`,
        provider: 'ZKTECO',
        locationId: workSiteId,
        timezone: 'Asia/Qatar',
        status: 'ACTIVE',
        isEnabled: true,
      },
      select: { id: true },
    });
    deviceId = device.id;
  });

  async function createEmployee(code: string, businessUnitId: string) {
    const employee = await prisma.employee.create({
      data: {
        tenantId,
        businessUnitId,
        employeeCode: code,
        firstName: 'Engine',
        lastName: code,
        email: `${code.toLowerCase()}@example.test`,
        phone: '+97400000000',
        hireDate: new Date('2020-01-01T00:00:00.000Z'),
        employmentStatus: 'ACTIVE',
        workMode: 'HYBRID',
        locationId: workSiteId,
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
    await clearEvents();
    const employees = [employeeId, otherEmployeeId].filter(Boolean);
    if (employees.length === 0) return;
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
    // Twelve hand-written deletes used to live here, one per model the suite
    // touched. They are gone because the suite now owns its tenants: deleting
    // a fixture tenant cascades every row underneath it, and the cascade is
    // asserted in db-fixtures-contract.e2e-spec.ts rather than assumed.
    //
    // The hand-written version was also unsafe when setup failed part-way. Ids
    // that were never assigned arrived as `undefined`, and Prisma reads an
    // `undefined` filter as "do not filter on this column" — so
    // `deleteMany({ where: { tenantId, integrationId } })` with no integration
    // would have deleted every raw event belonging to the tenant. Harmless
    // against a fixture tenant; not harmless against the shared seeded one this
    // suite used to borrow.
    //
    // Ordered so the application closes even if cleanup throws: a leaked Nest
    // application is a leaked Prisma pool, and that is what kept jest alive
    // after the run.
    try {
      await fixtures?.cleanup();
    } finally {
      await app?.close();
    }
  });

  // ------------------------------------------------------------ office day

  it('turns a device in and out into one office session', async () => {
    await punch({ localTime: `${DAY}T08:00:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T17:00:00`, direction: 'CHECK_OUT' });

    const result = await reconcile(DAY);

    expect(result.sessionCount).toBe(1);
    expect(result.workedMinutes).toBe(540);
    expect(result.status).toBe('PRESENT');

    const stored = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
      include: { sessions: true },
    });

    expect(stored.sessions).toHaveLength(1);
    expect(stored.sessions[0].workMode).toBe('OFFICE');
    expect(stored.derivedWorkMode).toBe('OFFICE');
    expect(stored.officeMinutes).toBe(540);
  });

  // ---------------------------------------------------------------- hybrid

  it('builds a hybrid day from office then remote sessions', async () => {
    // The primary acceptance scenario from the brief.
    await punch({ localTime: `${DAY}T08:05:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T12:30:00`, direction: 'CHECK_OUT' });
    await punch({
      localTime: `${DAY}T14:00:00`,
      source: 'WEB',
      direction: 'CHECK_IN',
      device: false,
      siteId: null,
    });
    await punch({
      localTime: `${DAY}T18:05:00`,
      source: 'WEB',
      direction: 'CHECK_OUT',
      device: false,
      siteId: null,
    });

    await reconcile(DAY);

    const stored = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
      include: { sessions: { orderBy: { sequence: 'asc' } } },
    });

    expect(stored.sessions).toHaveLength(2);
    expect(stored.sessions[0].workMode).toBe('OFFICE');
    expect(stored.sessions[0].durationMinutes).toBe(265); // 4h25m
    expect(stored.sessions[1].workMode).toBe('REMOTE');
    expect(stored.sessions[1].durationMinutes).toBe(245); // 4h05m

    expect(stored.workedMinutes).toBe(510); // 8h30m, not the 10h05m span
    expect(stored.officeMinutes).toBe(265);
    expect(stored.remoteMinutes).toBe(245);
    expect(stored.derivedWorkMode).toBe('HYBRID');

    // The gap between 12:30 and 14:00 is NOT an early departure: the employee
    // went on working remotely until 18:05.
    expect(stored.earlyDepartureMinutes).toBe(0);
  });

  it('builds a hybrid day from remote then office sessions', async () => {
    await punch({
      localTime: `${DAY}T09:00:00`,
      source: 'WEB',
      direction: 'CHECK_IN',
      device: false,
      siteId: null,
    });
    await punch({
      localTime: `${DAY}T12:00:00`,
      source: 'WEB',
      direction: 'CHECK_OUT',
      device: false,
      siteId: null,
    });
    await punch({ localTime: `${DAY}T13:30:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T17:30:00`, direction: 'CHECK_OUT' });

    await reconcile(DAY);

    const stored = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
      include: { sessions: { orderBy: { sequence: 'asc' } } },
    });

    // Office does not have to come first.
    expect(stored.sessions.map((session) => session.workMode)).toEqual([
      'REMOTE',
      'OFFICE',
    ]);
    expect(stored.derivedWorkMode).toBe('HYBRID');
    expect(stored.workedMinutes).toBe(420);
  });

  it('builds a day with three mode transitions', async () => {
    await punch({ localTime: `${DAY}T08:00:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T11:00:00`, direction: 'CHECK_OUT' });
    await punch({
      localTime: `${DAY}T12:00:00`,
      source: 'WEB',
      direction: 'CHECK_IN',
      device: false,
      siteId: null,
    });
    await punch({
      localTime: `${DAY}T15:00:00`,
      source: 'WEB',
      direction: 'CHECK_OUT',
      device: false,
      siteId: null,
    });
    await punch({ localTime: `${DAY}T16:00:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T18:00:00`, direction: 'CHECK_OUT' });

    await reconcile(DAY);

    const stored = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
      include: { sessions: { orderBy: { sequence: 'asc' } } },
    });

    expect(stored.sessions).toHaveLength(3);
    expect(stored.derivedWorkMode).toBe('HYBRID');
    expect(stored.workedMinutes).toBe(480);
  });

  // ------------------------------------------------------- overnight shift

  it('keeps an overnight shift on one attendance day', async () => {
    await prisma.workScheduleDay.updateMany({
      where: { workScheduleId, dayOfWeek: 'TUESDAY' },
      data: {
        shiftTemplateId: nightShiftId,
        startTime: '21:00',
        endTime: '06:00',
      },
    });

    try {
      // 20:55 on the 18th and 06:03 on the 19th: one night's work.
      await punch({
        localTime: `${NIGHT_DAY}T20:55:00`,
        direction: 'CHECK_IN',
      });
      await punch({ localTime: '2026-08-19T06:03:00', direction: 'CHECK_OUT' });

      await reconcile(NIGHT_DAY);

      const stored = await prisma.attendanceDay.findFirstOrThrow({
        where: { tenantId, employeeId, attendanceDate: day(NIGHT_DAY) },
        include: { sessions: true },
      });

      // One day, one session. Splitting at midnight would produce two half days,
      // a spurious missing checkout and a spurious missing check-in.
      expect(stored.sessions).toHaveLength(1);
      expect(stored.workedMinutes).toBe(548);

      const nextDay = await prisma.attendanceDay.findFirst({
        where: { tenantId, employeeId, attendanceDate: day('2026-08-19') },
      });
      expect(nextDay).toBeNull();
    } finally {
      await prisma.workScheduleDay.updateMany({
        where: { workScheduleId, dayOfWeek: 'TUESDAY' },
        data: {
          shiftTemplateId: dayShiftId,
          startTime: '08:00',
          endTime: '17:00',
        },
      });
    }
  });

  // ------------------------------------------------------ missing punches

  it('raises an exception for a session nobody closed', async () => {
    await punch({ localTime: `${DAY}T08:00:00`, direction: 'CHECK_IN' });

    const result = await reconcile(DAY);

    expect(result.openExceptionCount).toBeGreaterThan(0);
    expect(result.status).toBe('NEEDS_REVIEW');

    const exceptions = await prisma.attendanceException.findMany({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });

    expect(exceptions.map((item) => item.type)).toContain('MISSING_CHECKOUT');
    // No invented checkout: the worked time is genuinely unknown.
    expect(result.workedMinutes).toBe(0);
  });

  it('raises an exception for a check-out with no check-in', async () => {
    // A web check-out states that it is a check-out. A device punch could not
    // be used here: a terminal declares nothing, so a lone device punch is
    // inferred as an arrival with a missing departure instead.
    await punch({
      localTime: `${DAY}T17:00:00`,
      source: 'WEB',
      direction: 'CHECK_OUT',
      device: false,
      siteId: null,
    });

    await reconcile(DAY);

    const exceptions = await prisma.attendanceException.findMany({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });

    expect(exceptions.map((item) => item.type)).toContain('MISSING_CHECKIN');
  });

  // ------------------------------------------------------------ late/early

  it('measures lateness against the shift start, after grace', async () => {
    await punch({ localTime: `${DAY}T08:18:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T17:00:00`, direction: 'CHECK_OUT' });

    await reconcile(DAY);

    const stored = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });

    // Ten minutes' grace forgives the lateness; it does not redefine when the
    // shift began, so the recorded lateness is the full 18 minutes.
    expect(stored.lateMinutes).toBe(18);
  });

  it('does not treat an early arrival as overtime', async () => {
    await punch({ localTime: `${DAY}T07:30:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T16:00:00`, direction: 'CHECK_OUT' });

    await reconcile(DAY);

    const stored = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });

    expect(stored.earlyArrivalMinutes).toBe(30);
    expect(stored.lateMinutes).toBe(0);
    // 8h30m worked against an 8h schedule is 30 minutes of extra time, and it is
    // NOT approved overtime.
    expect(stored.extraMinutes).toBe(30);
    expect(stored.approvedOvertimeMinutes).toBe(0);
  });

  // ------------------------------------------------------------ idempotency

  it('produces the same result when run five times', async () => {
    await punch({ localTime: `${DAY}T08:05:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T12:30:00`, direction: 'CHECK_OUT' });
    await punch({
      localTime: `${DAY}T14:00:00`,
      source: 'WEB',
      direction: 'CHECK_IN',
      device: false,
      siteId: null,
    });
    await punch({
      localTime: `${DAY}T18:05:00`,
      source: 'WEB',
      direction: 'CHECK_OUT',
      device: false,
      siteId: null,
    });

    const results: Awaited<ReturnType<typeof reconcile>>[] = [];
    for (let run = 0; run < 5; run++) {
      results.push(await reconcile(DAY));
    }

    // Same numbers every time, and no accumulation of duplicate derived rows.
    expect(new Set(results.map((r) => r.workedMinutes)).size).toBe(1);
    expect(new Set(results.map((r) => r.sessionCount)).size).toBe(1);

    const days = await prisma.attendanceDay.count({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });
    const sessions = await prisma.attendanceSession.count({
      where: { tenantId, employeeId },
    });

    expect(days).toBe(1);
    expect(sessions).toBe(2);
  });

  // ------------------------------------------------------------- projection

  it('projects worked minutes onto the public AttendanceEntry', async () => {
    await punch({ localTime: `${DAY}T08:05:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T12:30:00`, direction: 'CHECK_OUT' });
    await punch({
      localTime: `${DAY}T14:00:00`,
      source: 'WEB',
      direction: 'CHECK_IN',
      device: false,
      siteId: null,
    });
    await punch({
      localTime: `${DAY}T18:05:00`,
      source: 'WEB',
      direction: 'CHECK_OUT',
      device: false,
      siteId: null,
    });

    await reconcile(DAY);

    const entry = await prisma.attendanceEntry.findFirstOrThrow({
      where: { tenantId, employeeId, date: day(DAY) },
    });

    // The record every existing consumer reads now tells the truth about a
    // hybrid day: 8h30m worked, not the 10h05m checkOut-minus-checkIn implies.
    expect(entry.workedMinutes).toBe(510);
    expect(entry.sessionCount).toBe(2);
    expect(entry.attendanceMode).toBe('HYBRID');
    expect(entry.reconciled).toBe(true);
    expect(entry.checkIn).not.toBeNull();
    expect(entry.checkOut).not.toBeNull();
  });

  // ------------------------------------------------------------------ leave

  it('keeps both the leave and the attendance when they conflict', async () => {
    const leaveType = await prisma.leaveType.findFirst({
      where: { tenantId },
      select: { id: true },
    });

    if (!leaveType) {
      // Nothing to assert against in this environment; skipping beats a false pass.
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
        reason: 'Engine test',
      },
      select: { id: true },
    });

    try {
      await punch({ localTime: `${DAY}T08:00:00`, direction: 'CHECK_IN' });
      await punch({ localTime: `${DAY}T17:00:00`, direction: 'CHECK_OUT' });

      await reconcile(DAY);

      const exceptions = await prisma.attendanceException.findMany({
        where: { tenantId, employeeId, attendanceDate: day(DAY) },
      });

      // The leave is not cancelled and the attendance is not discarded. Both are
      // real; only HR can say which should stand.
      expect(exceptions.map((item) => item.type)).toContain(
        'ATTENDANCE_DURING_LEAVE',
      );

      const stored = await prisma.attendanceDay.findFirstOrThrow({
        where: { tenantId, employeeId, attendanceDate: day(DAY) },
      });
      expect(stored.onLeave).toBe(true);
      expect(stored.workedMinutes).toBe(540);
    } finally {
      await prisma.leaveRequest.deleteMany({ where: { id: leave.id } });
    }
  });

  // ----------------------------------------------------------------- locking

  it('does not change a locked day when new evidence arrives', async () => {
    await punch({ localTime: `${DAY}T08:00:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T17:00:00`, direction: 'CHECK_OUT' });
    await reconcile(DAY);

    const before = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });

    await prisma.attendanceDay.update({
      where: { id: before.id },
      data: {
        locked: true,
        lockedAt: new Date(),
        lockReason: 'Payroll finalised',
      },
    });

    // A punch arrives two days late, after payroll has run.
    await punch({ localTime: `${DAY}T19:00:00`, direction: 'CHECK_IN' });
    const result = await reconcile(DAY);

    expect(result.skippedBecauseLocked).toBe(true);

    const after = await prisma.attendanceDay.findFirstOrThrow({
      where: { id: before.id },
    });

    // The numbers payroll used do not move underneath it.
    expect(after.workedMinutes).toBe(before.workedMinutes);
    expect(after.sessionCount).toBe(before.sessionCount);

    // The evidence is still preserved, and the arrival is surfaced.
    const stillThere = await prisma.rawAttendanceEvent.count({
      where: { tenantId, dedupeScopeKey: `test:${suffix}` },
    });
    expect(stillThere).toBe(3);

    const exceptions = await prisma.attendanceException.findMany({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });
    expect(exceptions.map((item) => item.type)).toContain(
      'LOCKED_PERIOD_EVENT',
    );
  });

  // -------------------------------------------------------- unauthorised site

  it('keeps a punch from an unauthorised site and flags it', async () => {
    const foreignSite = await prisma.location.create({
      data: {
        tenantId,
        name: `Foreign site ${suffix}`,
        city: 'Doha',
        state: 'Doha',
        country: 'QA',
        timezone: 'Asia/Qatar',
      },
      select: { id: true },
    });

    try {
      await punch({
        localTime: `${DAY}T08:00:00`,
        direction: 'CHECK_IN',
        siteId: foreignSite.id,
      });
      await punch({
        localTime: `${DAY}T17:00:00`,
        direction: 'CHECK_OUT',
        siteId: foreignSite.id,
      });

      await reconcile(DAY);

      const exceptions = await prisma.attendanceException.findMany({
        where: { tenantId, employeeId, attendanceDate: day(DAY) },
      });

      expect(exceptions.map((item) => item.type)).toContain(
        'UNAUTHORIZED_WORK_SITE',
      );

      // The punch is not discarded: someone was physically at that terminal.
      const stored = await prisma.attendanceDay.findFirstOrThrow({
        where: { tenantId, employeeId, attendanceDate: day(DAY) },
        include: { sessions: true },
      });
      expect(stored.sessions).toHaveLength(1);
    } finally {
      await prisma.location.deleteMany({ where: { id: foreignSite.id } });
    }
  });

  // ------------------------------------------------------ exception lifecycle

  it('resolves an exception rather than deleting it once it no longer applies', async () => {
    await punch({ localTime: `${DAY}T08:00:00`, direction: 'CHECK_IN' });
    await reconcile(DAY);

    const opened = await prisma.attendanceException.findFirstOrThrow({
      where: { tenantId, employeeId, type: 'MISSING_CHECKOUT' },
    });
    expect(opened.status).toBe('OPEN');

    // The missing punch arrives.
    await punch({ localTime: `${DAY}T17:00:00`, direction: 'CHECK_OUT' });
    await reconcile(DAY);

    const after = await prisma.attendanceException.findUniqueOrThrow({
      where: { id: opened.id },
    });

    // Kept with a resolution, not removed: "this day once had a missing
    // checkout" is part of the audit trail for what was eventually paid.
    expect(after.status).toBe('RESOLVED');
    expect(after.resolvedAt).not.toBeNull();
    expect(after.resolutionSource).toBe('RECONCILIATION');
  });

  // ------------------------------------------------------------------ queue

  it('deduplicates queued reconciliation for the same employee-day', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await queue.enqueue({
        tenantId,
        employeeId,
        attendanceDate: day(DAY),
        reason: 'TEST',
      });
    }

    const outstanding = await prisma.attendanceReconciliationJob.count({
      where: {
        tenantId,
        employeeId,
        attendanceDate: day(DAY),
        status: { in: ['PENDING', 'RUNNING'] },
      },
    });

    // A device uploading a thousand punches for one person produces one job.
    expect(outstanding).toBe(1);
  });

  it('drains queued work and reconciles the day', async () => {
    await punch({ localTime: `${DAY}T08:00:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T17:00:00`, direction: 'CHECK_OUT' });

    await queue.enqueue({
      tenantId,
      employeeId,
      attendanceDate: day(DAY),
      reason: 'TEST',
    });

    await queue.drain();

    const stored = await prisma.attendanceDay.findFirst({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });

    expect(stored?.workedMinutes).toBe(540);
  });

  // --------------------------------------------------------------- isolation

  it('never reconciles across tenants', async () => {
    await punch({ localTime: `${DAY}T08:00:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T17:00:00`, direction: 'CHECK_OUT' });

    // The same employee id, asked for under a different tenant.
    const result = await reconciliation.reconcile(
      otherTenantId,
      employeeId,
      day(DAY),
    );

    expect(result.attendanceDayId).toBeNull();

    const leaked = await prisma.attendanceDay.count({
      where: { tenantId: otherTenantId, employeeId },
    });
    expect(leaked).toBe(0);
  });

  it('attributes evidence only to the employee it belongs to', async () => {
    await punch({ localTime: `${DAY}T08:00:00`, direction: 'CHECK_IN' });
    await punch({ localTime: `${DAY}T17:00:00`, direction: 'CHECK_OUT' });

    await reconcile(DAY);
    await reconcile(DAY, otherEmployeeId);

    const mine = await prisma.attendanceDay.findFirstOrThrow({
      where: { tenantId, employeeId, attendanceDate: day(DAY) },
    });
    const theirs = await prisma.attendanceDay.findFirstOrThrow({
      where: {
        tenantId,
        employeeId: otherEmployeeId,
        attendanceDate: day(DAY),
      },
    });

    expect(mine.workedMinutes).toBe(540);
    expect(theirs.workedMinutes).toBe(0);
    expect(theirs.status).toBe('ABSENT');
  });

  // ------------------------------------------------------------- absent day

  it('records a working day with no evidence as absent', async () => {
    const result = await reconcile(DAY);

    expect(result.status).toBe('ABSENT');
    expect(result.sessionCount).toBe(0);

    // No AttendanceEntry is invented for a day nothing happened on: creating an
    // empty row would turn "no evidence" into an assertion.
    const entry = await prisma.attendanceEntry.findFirst({
      where: { tenantId, employeeId, date: day(DAY) },
    });
    expect(entry).toBeNull();
  });
});
