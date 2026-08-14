import {
  AttendanceMethod,
  EmployeeWorkMode,
  WorkSiteDevicePolicy,
  WorkSiteWebAttendancePolicy,
} from '@prisma/client';

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { AttendanceGeofenceService } from './attendance-geofence.service';
import { AttendancePolicyResolverService } from './attendance-policy-resolver.service';
import type { AttendanceReconciliationQueueService } from './attendance-reconciliation-queue.service';
import { AttendanceWebAttendanceService } from './attendance-web-attendance.service';

/**
 * Who may record attendance from a browser, from where, and as what.
 *
 * The rule this suite exists for: an employee standing inside a work site that
 * requires an attendance device cannot check in from their phone, and the server
 * is what says so. Every case below is stated from the employee's position and
 * their work arrangement, because that is the pair that decides.
 */
describe('AttendanceWebAttendanceService', () => {
  const DOHA_HQ = { latitude: 25.2854, longitude: 51.531 };
  const FAR_AWAY = { latitude: 25.4295, longitude: 51.4911 };

  const TENANT = 'tenant-a';
  const EMPLOYEE = 'employee-1';
  const SITE = 'site-hq';

  let prisma: {
    employee: { findFirst: jest.Mock };
    employeeWorkSite: { findMany: jest.Mock };
    location: { findMany: jest.Mock };
    rawAttendanceEvent: { upsert: jest.Mock };
    attendanceLocationEvidence: { create: jest.Mock };
  };
  let tenantSettings: { getAttendanceSettings: jest.Mock };
  let queue: { enqueue: jest.Mock };
  let impossibleTravel: { evaluateForEvidence: jest.Mock };
  let service: AttendanceWebAttendanceService;

  const baseSettings = {
    integrationEnabled: true,
    attendanceEngineEffectiveFrom: '',
    maximumAllowedDistanceMeters: 100,
    maxAllowedAccuracyMeters: 100,
    webAttendancePolicy: 'ALLOWED',
    officeWebAttendancePolicy: 'ALLOWED',
    webFallbackPolicy: 'ALLOW_WHEN_DEVICE_UNAVAILABLE',
    semanticDuplicateWindowSeconds: 30,
    defaultPunchDirectionStrategy: 'ALTERNATING',
    workModeTransitionPolicy: 'CREATE_EXCEPTION',
    crossSiteAttendancePolicy: 'WARNING',
    autoCloseMissingCheckoutAtShiftEnd: false,
    treatSessionGapsAsBreaks: false,
    overtimeMinimumMinutes: 30,
  };

  function siteRow(overrides: Record<string, unknown> = {}) {
    return {
      id: SITE,
      name: 'Doha HQ',
      latitude: DOHA_HQ.latitude,
      longitude: DOHA_HQ.longitude,
      allowedRadiusMeters: 100,
      maximumAccuracyMeters: null,
      timezone: 'Asia/Qatar',
      attendanceEnabled: null,
      devicePolicy: null,
      webAttendancePolicy: null,
      webFallbackEnabled: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: EMPLOYEE,
          workMode: EmployeeWorkMode.HYBRID,
          organizationId: null,
          locationId: SITE,
        }),
      },
      employeeWorkSite: {
        findMany: jest.fn().mockResolvedValue([{ locationId: SITE }]),
      },
      location: { findMany: jest.fn().mockResolvedValue([siteRow()]) },
      rawAttendanceEvent: {
        upsert: jest.fn().mockResolvedValue({ id: 'raw-1' }),
      },
      attendanceLocationEvidence: {
        create: jest.fn().mockResolvedValue({ id: 'evidence-1' }),
      },
    };

    tenantSettings = {
      getAttendanceSettings: jest.fn().mockResolvedValue(baseSettings),
    };

    queue = { enqueue: jest.fn().mockResolvedValue(undefined) };

    impossibleTravel = {
      evaluateForEvidence: jest
        .fn()
        .mockResolvedValue({ pairsExamined: 0, flagged: 0, disabled: false }),
    };

    service = new AttendanceWebAttendanceService(
      prisma as unknown as PrismaService,
      new AttendanceGeofenceService(),
      new AttendancePolicyResolverService(
        prisma as unknown as PrismaService,
        tenantSettings as unknown as TenantSettingsResolverService,
      ),
      queue as unknown as AttendanceReconciliationQueueService,
      // The detector's own arithmetic has its own tests; what matters here is
      // whether this service hands it the evidence it just wrote.
      impossibleTravel as never,
    );
  });

  const evaluate = (
    position: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
    },
    captureMethod: AttendanceMethod = AttendanceMethod.WEB,
  ) =>
    service.evaluate({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      position: { accuracyMeters: 10, ...position },
      captureMethod,
      at: new Date('2026-08-14T09:00:00.000Z'),
    });

  function setWorkMode(workMode: EmployeeWorkMode) {
    prisma.employee.findFirst.mockResolvedValue({
      id: EMPLOYEE,
      workMode,
      organizationId: null,
      locationId: SITE,
    });
  }

  // --------------------------------------------------- inside a work site

  it('refuses a web punch inside a site that requires a device', () => {
    prisma.location.findMany.mockResolvedValue([
      siteRow({
        devicePolicy: WorkSiteDevicePolicy.DEVICE_REQUIRED,
        webFallbackEnabled: false,
      }),
    ]);

    return evaluate(DOHA_HQ).then((decision) => {
      expect(decision.outcome).toBe('BLOCK');
      expect(decision.reasonCode).toBe('WORK_SITE_REQUIRES_DEVICE');
      // Named, because "use the reader at Doha HQ" is actionable and a generic
      // refusal is not.
      expect(decision.message).toContain('Doha HQ');
      expect(decision.evidence.insideGeofence).toBe(true);
    });
  });

  it('offers a fallback request where the site and tenant both allow one', async () => {
    prisma.location.findMany.mockResolvedValue([
      siteRow({
        devicePolicy: WorkSiteDevicePolicy.DEVICE_REQUIRED,
        webFallbackEnabled: true,
      }),
    ]);

    const decision = await evaluate(DOHA_HQ);

    // Not an ordinary unrestricted web punch: it becomes a request someone
    // approves, which is the whole point of the fallback policy.
    expect(decision.outcome).toBe('REQUIRE_FALLBACK_REQUEST');
    expect(decision.message).toMatch(/request web attendance/i);
  });

  it('allows an in-office web punch where no device is required', async () => {
    const decision = await evaluate(DOHA_HQ);

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.workMode).toBe(EmployeeWorkMode.OFFICE);
    expect(decision.workSiteId).toBe(SITE);
  });

  it('blocks a hybrid employee standing in a device-required office', async () => {
    setWorkMode(EmployeeWorkMode.HYBRID);
    prisma.location.findMany.mockResolvedValue([
      siteRow({
        devicePolicy: WorkSiteDevicePolicy.DEVICE_REQUIRED,
        webFallbackEnabled: false,
      }),
    ]);

    const decision = await evaluate(DOHA_HQ);

    // Being permitted to work remotely does not make a browser an acceptable
    // way to record attendance while standing at the reader.
    expect(decision.outcome).toBe('BLOCK');
  });

  it('honours a work-site override that disallows web attendance', async () => {
    prisma.location.findMany.mockResolvedValue([
      siteRow({
        webAttendancePolicy: WorkSiteWebAttendancePolicy.DISALLOWED,
        webFallbackEnabled: false,
      }),
    ]);

    const decision = await evaluate(DOHA_HQ);
    expect(decision.outcome).toBe('BLOCK');
  });

  it('refuses attendance at a site that is not collecting it', async () => {
    prisma.location.findMany.mockResolvedValue([
      siteRow({ attendanceEnabled: false }),
    ]);

    const decision = await evaluate(DOHA_HQ);
    expect(decision.reasonCode).toBe('WORK_SITE_ATTENDANCE_DISABLED');
  });

  // -------------------------------------------------- outside every site

  it('allows a remote employee working away from every site', async () => {
    setWorkMode(EmployeeWorkMode.REMOTE);

    const decision = await evaluate(FAR_AWAY);

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.workMode).toBe(EmployeeWorkMode.REMOTE);
    expect(decision.workSiteId).toBeNull();
  });

  it('allows a hybrid employee working away from every site', async () => {
    setWorkMode(EmployeeWorkMode.HYBRID);

    const decision = await evaluate(FAR_AWAY);

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.workMode).toBe(EmployeeWorkMode.REMOTE);
  });

  it('refuses an office-only employee working away from every site', async () => {
    setWorkMode(EmployeeWorkMode.OFFICE);

    const decision = await evaluate(FAR_AWAY);

    // An office employee working from home is an exception a human should see,
    // not a silent default.
    expect(decision.outcome).toBe('BLOCK');
    expect(decision.reasonCode).toBe('WORK_MODE_DISALLOWS_REMOTE');
    // The refusal says how far away they are, so the reason is checkable.
    expect(decision.message).toMatch(/km|m from/);
  });

  it('allows a field employee anywhere', async () => {
    setWorkMode(EmployeeWorkMode.FIELD);

    const decision = await evaluate(FAR_AWAY);

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.workMode).toBe(EmployeeWorkMode.FIELD);
  });

  it('requires approval for remote work where the tenant made it fallback-only', async () => {
    setWorkMode(EmployeeWorkMode.REMOTE);
    tenantSettings.getAttendanceSettings.mockResolvedValue({
      ...baseSettings,
      webAttendancePolicy: 'FALLBACK_ONLY',
    });

    const decision = await evaluate(FAR_AWAY);

    expect(decision.outcome).toBe('REQUIRE_FALLBACK_REQUEST');
  });

  // ------------------------------------------------------ position quality

  it('refuses a position too inaccurate to be believed', async () => {
    const decision = await evaluate({ ...DOHA_HQ, accuracyMeters: 1500 });

    expect(decision.outcome).toBe('BLOCK');
    expect(decision.reasonCode).toBe('ACCURACY_TOO_LOW');
  });

  it('does not let poor accuracy downgrade an in-office punch to remote', async () => {
    // The loophole this closes: if a bad reading were treated as "outside the
    // office", anyone could bypass a device-required site by degrading their GPS.
    setWorkMode(EmployeeWorkMode.REMOTE);

    const decision = await evaluate({ ...DOHA_HQ, accuracyMeters: 5000 });

    expect(decision.outcome).toBe('BLOCK');
    expect(decision.workMode).not.toBe(EmployeeWorkMode.REMOTE);
  });

  // ---------------------------------------------------------- tenant gate

  it('refuses everything when web attendance is switched off', async () => {
    tenantSettings.getAttendanceSettings.mockResolvedValue({
      ...baseSettings,
      webAttendancePolicy: 'DISALLOWED',
    });

    const decision = await evaluate(FAR_AWAY);

    expect(decision.outcome).toBe('BLOCK');
    expect(decision.reasonCode).toBe('WEB_ATTENDANCE_DISABLED');
  });

  // --------------------------------------------------------------- record

  it('records an accepted punch as raw evidence and queues reconciliation', async () => {
    const decision = await evaluate(FAR_AWAY);

    await service.recordWebPunch({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      direction: 'CHECK_IN',
      occurredAt: new Date('2026-08-14T06:03:00.000Z'),
      decision,
      timezone: 'Asia/Qatar',
      attendanceDate: new Date('2026-08-14T00:00:00.000Z'),
      captureSource: 'WEB',
    });

    const written = prisma.rawAttendanceEvent.upsert.mock.calls[0][0];

    // Web punches go through the same pipeline as device punches — without the
    // raw event the engine has nothing to reconcile, and a hybrid day cannot be
    // paired at all.
    expect(written.create.captureSource).toBe('WEB');
    // Wall clock in the site's zone: 06:03 UTC is 09:03 in Doha.
    expect(written.create.occurredAtLocal).toBe('2026-08-14T09:03:00');
    expect(written.create.rawPayload.direction).toBe('CHECK_IN');
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('records no coordinates on the raw event payload', async () => {
    const decision = await evaluate(FAR_AWAY);

    await service.recordWebPunch({
      tenantId: TENANT,
      employeeId: EMPLOYEE,
      direction: 'CHECK_IN',
      occurredAt: new Date('2026-08-14T06:03:00.000Z'),
      decision,
      timezone: 'Asia/Qatar',
      attendanceDate: new Date('2026-08-14T00:00:00.000Z'),
      captureSource: 'WEB',
    });

    const payload = prisma.rawAttendanceEvent.upsert.mock.calls[0][0].create
      .rawPayload as Record<string, unknown>;

    // Distance and inside/outside are the audit evidence; the coordinates
    // themselves belong on the attendance record, not on a payload that travels
    // with the event.
    expect(payload).not.toHaveProperty('latitude');
    expect(payload).not.toHaveProperty('longitude');
    expect(payload).toHaveProperty('distanceMeters');
  });

  // ------------------------------------------------------ effective dating

  it('only considers work sites the employee was assigned to at the time', async () => {
    await evaluate(DOHA_HQ);

    const where = prisma.employeeWorkSite.findMany.mock.calls[0][0].where;

    // Reconciling last quarter with this month's assignments would invent — or
    // revoke — authorisation for punches that were valid when they happened.
    expect(where.status).toBe('ACTIVE');
    expect(JSON.stringify(where.AND)).toContain('validFrom');
    expect(JSON.stringify(where.AND)).toContain('validTo');
  });

  // ------------------------------------------------- impossible travel wiring

  describe('location evidence', () => {
    const record = (position: { latitude: number; longitude: number }) =>
      evaluate(position).then((decision) =>
        service.recordLocationEvidence({
          tenantId: TENANT,
          employeeId: EMPLOYEE,
          attendanceDate: new Date('2026-08-14T00:00:00.000Z'),
          action: 'CHECK_IN',
          captureSource: 'WEB',
          position: {
            latitude: position.latitude,
            longitude: position.longitude,
            accuracyMeters: 20,
            capturedAt: new Date('2026-08-14T06:03:00.000Z'),
          },
          decision,
        }),
      );

    it('evaluates travel against the evidence it just wrote, when the punch was accepted', async () => {
      await record(DOHA_HQ);

      const created = prisma.attendanceLocationEvidence.create.mock.calls[0][0];
      expect(created.data.outcome).toBe('ALLOW');
      expect(impossibleTravel.evaluateForEvidence).toHaveBeenCalledWith(
        TENANT,
        'evidence-1',
      );
    });

    it('does not evaluate travel from a refused punch', async () => {
      // A refusal is not a statement about where anybody was. Treating it as one
      // would let a rejected position create a travel alert against a good punch.
      tenantSettings.getAttendanceSettings.mockResolvedValue({
        ...baseSettings,
        webAttendancePolicy: 'DISALLOWED',
      });

      await record(FAR_AWAY);

      const created = prisma.attendanceLocationEvidence.create.mock.calls[0][0];
      expect(created.data.outcome).not.toBe('ALLOW');
      expect(impossibleTravel.evaluateForEvidence).not.toHaveBeenCalled();
    });

    it('still records the attendance decision when the detector fails', async () => {
      // The punch has already been decided. Failing it because a risk signal
      // could not be computed would be the wrong trade entirely.
      impossibleTravel.evaluateForEvidence.mockRejectedValue(
        new Error('detector unavailable'),
      );

      await expect(record(DOHA_HQ)).resolves.toBeUndefined();
      expect(prisma.attendanceLocationEvidence.create).toHaveBeenCalledTimes(1);
    });
  });
  // ------------------------------------------- allowed attendance methods

  /**
   * `allowedAttendanceMethods` decides whether a channel may be used here at
   * all.
   *
   * It was stored and configurable for a whole phase without a single engine
   * read, so a tenant could set "device only" on a work site and watch web
   * punches sail through. It is an additional AND: the method must be allowed,
   * AND the work-mode policy must allow it, AND the site policy must allow it.
   */
  describe('allowed attendance methods', () => {
    it('refuses a web punch at a device-only work site', async () => {
      prisma.location.findMany.mockResolvedValue([
        siteRow({ allowedAttendanceMethods: [AttendanceMethod.DEVICE] }),
      ]);

      const decision = await evaluate(DOHA_HQ);

      expect(decision.outcome).toBe('BLOCK');
      expect(decision.reasonCode).toBe('METHOD_NOT_ALLOWED');
      expect(decision.message).toContain('attendance device');
      expect(decision.evidence.insideGeofence).toBe(true);
    });

    /*
     * The ordering that matters: a method the tenant excluded must not be
     * offered as the fallback for a broken reader. Allowing that would let the
     * fallback policy quietly re-enable a channel the site switched off.
     */
    it('does not offer a web fallback for a method the site excluded', async () => {
      prisma.location.findMany.mockResolvedValue([
        siteRow({
          allowedAttendanceMethods: [AttendanceMethod.DEVICE],
          devicePolicy: WorkSiteDevicePolicy.DEVICE_REQUIRED,
          webFallbackEnabled: true,
        }),
      ]);

      const decision = await evaluate(DOHA_HQ);

      expect(decision.outcome).toBe('BLOCK');
      expect(decision.reasonCode).toBe('METHOD_NOT_ALLOWED');
    });

    it('still applies the device rule when the method itself is permitted', async () => {
      prisma.location.findMany.mockResolvedValue([
        siteRow({
          allowedAttendanceMethods: [
            AttendanceMethod.DEVICE,
            AttendanceMethod.WEB,
          ],
          devicePolicy: WorkSiteDevicePolicy.DEVICE_REQUIRED,
          webFallbackEnabled: false,
        }),
      ]);

      const decision = await evaluate(DOHA_HQ);

      // Permitting WEB as a method does not permit it in defiance of the
      // device rule: every condition has to pass, not just the loosest one.
      expect(decision.outcome).toBe('BLOCK');
      expect(decision.reasonCode).toBe('WORK_SITE_REQUIRES_DEVICE');
    });

    it('allows a web punch where the site permits DEVICE and WEB and asks for neither', async () => {
      prisma.location.findMany.mockResolvedValue([
        siteRow({
          allowedAttendanceMethods: [
            AttendanceMethod.DEVICE,
            AttendanceMethod.WEB,
          ],
        }),
      ]);

      const decision = await evaluate(DOHA_HQ);

      expect(decision.outcome).toBe('ALLOW');
      expect(decision.workMode).toBe(EmployeeWorkMode.OFFICE);
    });

    it('treats an empty list as inherit, not as "nothing allowed"', async () => {
      prisma.location.findMany.mockResolvedValue([
        siteRow({ allowedAttendanceMethods: [] }),
      ]);

      const decision = await evaluate(DOHA_HQ);

      // Reading empty as "no method permitted" would switch attendance off at
      // every site that never configured a restriction.
      expect(decision.outcome).toBe('ALLOW');
    });

    it('judges the method that was actually used', async () => {
      prisma.location.findMany.mockResolvedValue([
        siteRow({ allowedAttendanceMethods: [AttendanceMethod.MOBILE] }),
      ]);

      await expect(
        evaluate(DOHA_HQ, AttendanceMethod.MOBILE),
      ).resolves.toMatchObject({ outcome: 'ALLOW' });
      await expect(
        evaluate(DOHA_HQ, AttendanceMethod.WEB),
      ).resolves.toMatchObject({ reasonCode: 'METHOD_NOT_ALLOWED' });
    });

    /*
     * The restriction is a property of a site. Outside every geofence there is
     * no site to restrict, so a remote punch is judged on work mode alone.
     */
    it('does not apply a site restriction to someone outside every site', async () => {
      setWorkMode(EmployeeWorkMode.REMOTE);
      prisma.location.findMany.mockResolvedValue([
        siteRow({ allowedAttendanceMethods: [AttendanceMethod.DEVICE] }),
      ]);

      const decision = await evaluate(FAR_AWAY);

      expect(decision.outcome).toBe('ALLOW');
      expect(decision.workMode).toBe(EmployeeWorkMode.REMOTE);
    });
  });

  // ------------------------------------------------ work-mode enforcement

  describe('work mode decides what an outside punch means', () => {
    it('records a remote employee outside every site as REMOTE', async () => {
      setWorkMode(EmployeeWorkMode.REMOTE);

      const decision = await evaluate(FAR_AWAY);

      expect(decision.outcome).toBe('ALLOW');
      expect(decision.workMode).toBe(EmployeeWorkMode.REMOTE);
      expect(decision.workSiteId).toBeNull();
    });

    it('records a hybrid employee outside every site as REMOTE', async () => {
      setWorkMode(EmployeeWorkMode.HYBRID);

      const decision = await evaluate(FAR_AWAY);

      expect(decision.outcome).toBe('ALLOW');
      expect(decision.workMode).toBe(EmployeeWorkMode.REMOTE);
    });

    it('refuses an office-only employee outside every site', async () => {
      setWorkMode(EmployeeWorkMode.OFFICE);

      const decision = await evaluate(FAR_AWAY);

      expect(decision.outcome).toBe('BLOCK');
      expect(decision.reasonCode).toBe('WORK_MODE_DISALLOWS_REMOTE');
    });

    /*
     * A field employee is away from fixed sites by definition, so being outside
     * every geofence is the expected condition. FIELD must not silently become
     * REMOTE or HYBRID.
     */
    it('keeps FIELD distinct from REMOTE', async () => {
      setWorkMode(EmployeeWorkMode.FIELD);

      const decision = await evaluate(FAR_AWAY);

      expect(decision.outcome).toBe('ALLOW');
      expect(decision.workMode).toBe(EmployeeWorkMode.FIELD);
    });

    /*
     * The physical context decides the session, not the employee's eligibility:
     * a remote-eligible employee standing in an unrestricted office is at the
     * office, and the day is what turns a mixture into HYBRID.
     */
    it('records an inside punch as OFFICE even for a remote employee', async () => {
      setWorkMode(EmployeeWorkMode.REMOTE);

      const decision = await evaluate(DOHA_HQ);

      expect(decision.outcome).toBe('ALLOW');
      expect(decision.workMode).toBe(EmployeeWorkMode.OFFICE);
      expect(decision.workSiteId).toBe(SITE);
    });

    it('never returns HYBRID as a session work mode', async () => {
      for (const workMode of [
        EmployeeWorkMode.OFFICE,
        EmployeeWorkMode.REMOTE,
        EmployeeWorkMode.HYBRID,
        EmployeeWorkMode.FIELD,
      ]) {
        setWorkMode(workMode);
        const inside = await evaluate(DOHA_HQ);
        const outside = await evaluate(FAR_AWAY);
        expect(inside.workMode).not.toBe(EmployeeWorkMode.HYBRID);
        expect(outside.workMode).not.toBe(EmployeeWorkMode.HYBRID);
      }
    });
  });
});
