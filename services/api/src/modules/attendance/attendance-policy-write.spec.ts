import { AttendanceMode } from '@prisma/client';

import { AttendanceService } from './attendance.service';

/**
 * What `PATCH /attendance/policy` writes, and what it refuses to be told.
 *
 * Three defects meet on this path:
 *
 * - **BUG-1978** - "Allow off-day check-in" and "Allow holiday check-in" are
 *   `AttendancePolicy` columns, not tenant-settings catalog keys. They were
 *   rendered on the settings page, which cannot save them; they now live here,
 *   on the screen that writes the columns backing them.
 * - **BUG-1981** - seven location columns were editable and never read. Input
 *   for them is no longer accepted, and the columns are written at the mandated
 *   values so the stored row stops contradicting the engine.
 * - **BUG-1980** - creating the policy row used to fill omitted fields with
 *   hardcoded constants, so the single act of saving this screen silently reset
 *   whatever the tenant had configured in Settings.
 */

const SETTINGS = {
  defaultGraceMinutes: 10,
  allowManualAdjustments: true,
  enforceOfficeLocationForOfficeMode: true,
  requireRemoteLocationCapture: true,
  locationCaptureRequired: false,
  locationRequiredForModes: [],
  allowIpFallback: true,
  allowManualLocationException: false,
  locationTimeoutSeconds: 45,
  locationRetryAttempts: 2,
  highAccuracyLocation: false,
  maxAllowedAccuracyMeters: 250,
  captureLocationOnCheckIn: false,
  captureLocationOnCheckOut: false,
  storeIpAddress: true,
  storeUserAgent: true,
  standardWorkHoursPerDay: 8,
  allowedModes: [
    AttendanceMode.OFFICE,
    AttendanceMode.REMOTE,
    AttendanceMode.HYBRID,
  ],
};

/** The minimum a client must send: every non-optional DTO field. */
const REQUIRED_INPUT = {
  lateCheckInGraceMinutes: 12,
  lateCheckOutGraceMinutes: 12,
  requireOfficeLocationForOfficeMode: true,
  allowManualAdjustments: true,
  preventDuplicateAttendance: true,
  allowCheckInOnApprovedLeave: false,
  markMissingCheckout: true,
};

describe('AttendanceService.updatePolicy', () => {
  const currentUser = { tenantId: 'tenant-1', userId: 'user-1' } as never;

  let attendanceRepository: {
    findAttendancePolicy: jest.Mock;
    upsertAttendancePolicy: jest.Mock;
  };
  let service: AttendanceService;

  function build(existingPolicy: Record<string, unknown> | null = null) {
    attendanceRepository = {
      findAttendancePolicy: jest.fn().mockResolvedValue(existingPolicy),
      upsertAttendancePolicy: jest
        .fn()
        .mockResolvedValue({ id: 'policy-1', tenantId: 'tenant-1' }),
    };

    return new AttendanceService(
      attendanceRepository as never,
      {} as never,
      { getAttendanceSettings: jest.fn().mockResolvedValue(SETTINGS) } as never,
      {} as never,
      { log: jest.fn().mockResolvedValue(undefined) } as never,
      { emit: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  /** The create half of the upsert. */
  function created() {
    return attendanceRepository.upsertAttendancePolicy.mock.calls[0][1];
  }

  /** The update half of the upsert. */
  function updated() {
    return attendanceRepository.upsertAttendancePolicy.mock.calls[0][2];
  }

  describe('BUG-1978 - the two non-catalog switches are writable here', () => {
    it('persists allowOffDayCheckIn and allowHolidayCheckIn', async () => {
      service = build();

      await service.updatePolicy(currentUser, {
        ...REQUIRED_INPUT,
        allowOffDayCheckIn: true,
        allowHolidayCheckIn: true,
      } as never);

      expect(created()).toEqual(
        expect.objectContaining({
          allowOffDayCheckIn: true,
          allowHolidayCheckIn: true,
        }),
      );
      expect(updated()).toEqual(
        expect.objectContaining({
          allowOffDayCheckIn: true,
          allowHolidayCheckIn: true,
        }),
      );
    });

    it('leaves an existing value alone when the field is omitted', async () => {
      service = build({ allowOffDayCheckIn: true, allowHolidayCheckIn: true });

      await service.updatePolicy(currentUser, { ...REQUIRED_INPUT } as never);

      expect(updated()).toEqual(
        expect.objectContaining({
          allowOffDayCheckIn: true,
          allowHolidayCheckIn: true,
        }),
      );
    });
  });

  describe('BUG-1981 - the mandated location columns are written, not taken', () => {
    const MANDATED = {
      requireRemoteLocationForRemoteMode: true,
      allowRemoteWithoutLocation: false,
      locationCaptureRequired: true,
      locationRequiredForModes: [
        AttendanceMode.OFFICE,
        AttendanceMode.REMOTE,
        AttendanceMode.HYBRID,
      ],
      allowManualLocationException: false,
      captureLocationOnCheckIn: true,
      captureLocationOnCheckOut: true,
    };

    it('writes the mandated values on create', async () => {
      service = build();

      await service.updatePolicy(currentUser, { ...REQUIRED_INPUT } as never);

      expect(created()).toEqual(expect.objectContaining(MANDATED));
    });

    it('writes the mandated values on update, correcting a stale row', async () => {
      service = build({
        requireRemoteLocationForRemoteMode: false,
        allowRemoteWithoutLocation: true,
        locationCaptureRequired: false,
        locationRequiredForModes: [],
        captureLocationOnCheckIn: false,
        captureLocationOnCheckOut: false,
      });

      await service.updatePolicy(currentUser, { ...REQUIRED_INPUT } as never);

      expect(updated()).toEqual(expect.objectContaining(MANDATED));
    });

    it('reports the mandate through the resolved policy', async () => {
      service = build({
        requireRemoteLocationForRemoteMode: false,
        allowRemoteWithoutLocation: true,
        locationCaptureRequired: false,
        locationRequiredForModes: [],
        captureLocationOnCheckIn: false,
        captureLocationOnCheckOut: false,
        allowManualLocationException: true,
      });

      /*
       * Even with a policy row that says the opposite in every column, the
       * resolved policy reports the mandate. This is the assertion that stops
       * anyone "restoring configurability" by pointing resolvePolicy at the
       * columns - which would change what the client is told without changing
       * what the server enforces.
       */
      await expect(service.getPolicy(currentUser)).resolves.toEqual(
        expect.objectContaining(MANDATED),
      );
    });
  });

  describe('BUG-1980 - creating the row does not change behaviour', () => {
    it('seeds omitted fields from the currently effective values', async () => {
      service = build();

      await service.updatePolicy(currentUser, { ...REQUIRED_INPUT } as never);

      /*
       * Every one of these differs from the constant the create branch used to
       * write, so a regression to hardcoded defaults fails here rather than
       * passing by coincidence.
       */
      expect(created()).toEqual(
        expect.objectContaining({
          allowIpFallback: true,
          locationTimeoutSeconds: 45,
          highAccuracyLocation: false,
          maxAllowedAccuracyMeters: 250,
          storeIpAddress: true,
          storeUserAgent: true,
        }),
      );
    });

    it('still prefers an explicitly submitted value over the effective one', async () => {
      service = build();

      await service.updatePolicy(currentUser, {
        ...REQUIRED_INPUT,
        locationTimeoutSeconds: 90,
        storeIpAddress: false,
      } as never);

      expect(created()).toEqual(
        expect.objectContaining({
          locationTimeoutSeconds: 90,
          storeIpAddress: false,
        }),
      );
    });

    it('scopes both halves of the upsert to the caller tenant', async () => {
      service = build();

      await service.updatePolicy(currentUser, { ...REQUIRED_INPUT } as never);

      expect(attendanceRepository.upsertAttendancePolicy.mock.calls[0][0]).toBe(
        'tenant-1',
      );
      expect(created()).toEqual(
        expect.objectContaining({ tenantId: 'tenant-1' }),
      );
    });

    it('seeds the grace-minute and office-location fields from the effective settings, not the column default, when the DTO omits them', async () => {
      service = build();

      /*
       * These three fields are fed by the attendance settings category
       * (`defaultGraceMinutes`, `enforceOfficeLocationForOfficeMode`) rather
       * than by a policy-only constant. The rest of REQUIRED_INPUT's fix
       * covered the other create-branch fields; these three kept falling to
       * the column default (0/0/true) on first save regardless of what the
       * tenant had configured, because the create branch wrote `dto.X` bare
       * with no `?? effective.X` fallback. `markMissingCheckout` is flipped
       * here to prove the omission - not a same-value patch - is what is
       * under test.
       */
      const {
        lateCheckInGraceMinutes: _omittedGraceIn,
        lateCheckOutGraceMinutes: _omittedGraceOut,
        requireOfficeLocationForOfficeMode: _omittedOfficeLocation,
        ...dtoWithoutSettingsBackedFields
      } = REQUIRED_INPUT;

      await service.updatePolicy(currentUser, {
        ...dtoWithoutSettingsBackedFields,
        markMissingCheckout: false,
      } as never);

      expect(created()).toEqual(
        expect.objectContaining({
          lateCheckInGraceMinutes: SETTINGS.defaultGraceMinutes,
          lateCheckOutGraceMinutes: SETTINGS.defaultGraceMinutes,
          requireOfficeLocationForOfficeMode:
            SETTINGS.enforceOfficeLocationForOfficeMode,
        }),
      );

      /*
       * Round-trip through the same path a client actually observes: a
       * second read of the tenant's policy after the row exists. This is the
       * exact repro from BUG-1980 - `defaultGraceMinutes: 10` configured in
       * Settings, no policy row yet, one save that leaves grace minutes
       * untouched - and it is what a regression to `dto.X` with no fallback
       * would fail, reporting `0` instead of `10`.
       */
      attendanceRepository.findAttendancePolicy.mockResolvedValue(created());

      await expect(service.getPolicy(currentUser)).resolves.toEqual(
        expect.objectContaining({
          lateCheckInGraceMinutes: SETTINGS.defaultGraceMinutes,
          lateCheckOutGraceMinutes: SETTINGS.defaultGraceMinutes,
          requireOfficeLocationForOfficeMode:
            SETTINGS.enforceOfficeLocationForOfficeMode,
        }),
      );
    });
  });
});
