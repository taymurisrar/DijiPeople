import { BadRequestException } from '@nestjs/common';

import {
  enforceCriticalAttendanceSetting,
  MANDATORY_ATTENDANCE_SETTINGS,
  TenantSettingsService,
} from './tenant-settings.service';

/**
 * The mandated attendance settings, and the refusal that now reports them.
 *
 * Device location capture is a platform integrity control (ADR-0003). Seven
 * attendance settings keys are locked on write, and until BUG-1979 that lock
 * had **zero** test coverage of any kind - which is what made it safe-looking
 * to delete, and is tracked as ITEM-0112.
 *
 * Two things are asserted here, and they are different things:
 *
 *  1. The LOCK still holds. A mandated key can never be written at any value
 *     other than the mandated one.
 *  2. The REFUSAL is reported. A submitted value that differs now fails the
 *     request and names the key, instead of being silently swapped for the
 *     mandated one - which made the change-diff drop it as a no-op, so the
 *     administrator got a successful save, no warning, an audit row recording
 *     no change, and the old value back on reload.
 *
 * This file is deliberately separate from `tenant-settings.service.spec.ts`:
 * the settings catalog is under concurrent work, and the attendance mandate is
 * a self-contained subject.
 */

const MANDATED = [
  ['requireRemoteLocationCapture', true, false],
  ['locationCaptureRequired', true, false],
  ['captureLocationOnCheckIn', true, false],
  ['captureLocationOnCheckOut', true, false],
  ['allowManualLocationException', false, true],
  ['highAccuracyLocation', true, false],
  /*
   * BUG-2335, and mandated for a different reason from the rest. The others
   * lock a control that is enforced elsewhere; this one locks a capability that
   * does not exist — `captureIpFallbackLocation` cannot succeed on any input,
   * and the check-in path never calls it. It shipped as a live, saveable
   * checkbox reporting itself as enabled.
   *
   * It belongs in this table specifically because disabling the UI control is
   * not enough: the UI is cosmetic, and a tenant whose stored value is already
   * `true` would keep serving `allowIpFallback: true` in its runtime policy.
   */
  ['allowIpFallback', false, true],
] as const;

describe('mandated attendance settings', () => {
  let tenantSettingsRepository: {
    findTenantById: jest.Mock;
    findSettingsByTenant: jest.Mock;
    upsertSettings: jest.Mock;
    upsertFeatures: jest.Mock;
  };
  let service: TenantSettingsService;

  function buildService(allowedAttendanceKeys: string[]) {
    tenantSettingsRepository = {
      findTenantById: jest.fn().mockResolvedValue(null),
      findSettingsByTenant: jest.fn().mockResolvedValue([]),
      upsertSettings: jest.fn(),
      upsertFeatures: jest.fn(),
    };

    return new TenantSettingsService(
      tenantSettingsRepository as never,
      {
        getAllowedKeysByCategory: jest
          .fn()
          .mockReturnValue(
            new Map([['attendance', new Set(allowedAttendanceKeys)]]),
          ),
        invalidateTenantCache: jest.fn(),
      } as never,
      { getResolvedTenantFeatures: jest.fn() } as never,
      { log: jest.fn() } as never,
      { delete: jest.fn(), deleteByPrefix: jest.fn() } as never,
    );
  }

  const actor = { tenantId: 'tenant-1', userId: 'user-1' } as never;

  function submit(key: string, value: unknown) {
    return service.updateTenantSettings(actor, {
      updates: [{ category: 'attendance', key, value }] as never,
    });
  }

  describe('the refusal is reported', () => {
    it.each(MANDATED)(
      'refuses a value for attendance.%s that contradicts the mandate',
      async (key, _mandated, contradicting) => {
        service = buildService([key]);

        await expect(submit(key, contradicting)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(tenantSettingsRepository.upsertSettings).not.toHaveBeenCalled();
      },
    );

    it('names the key and the reason rather than failing anonymously', async () => {
      service = buildService(['locationCaptureRequired']);

      await expect(
        submit('locationCaptureRequired', false),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'ATTENDANCE_SETTING_ENFORCED_BY_PLATFORM',
          message: expect.stringContaining(
            'attendance.locationCaptureRequired',
          ) as string,
        }) as Record<string, unknown>,
      });
    });

    it('refuses a locationRequiredForModes that drops a mandated mode', async () => {
      service = buildService(['locationRequiredForModes']);

      await expect(
        submit('locationRequiredForModes', ['REMOTE', 'HYBRID']),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects the whole submission, so no other key is written either', async () => {
      service = buildService(['allowedModes', 'locationCaptureRequired']);

      await expect(
        service.updateTenantSettings(actor, {
          updates: [
            { category: 'attendance', key: 'allowedModes', value: ['OFFICE'] },
            {
              category: 'attendance',
              key: 'locationCaptureRequired',
              value: false,
            },
          ] as never,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tenantSettingsRepository.upsertSettings).not.toHaveBeenCalled();
    });
  });

  describe('a submission that matches the mandate is a no-op, not an error', () => {
    it.each(MANDATED)(
      'accepts attendance.%s at its mandated value',
      async (key, mandated) => {
        service = buildService([key]);

        await expect(submit(key, mandated)).resolves.toBeDefined();
      },
    );

    it('accepts locationRequiredForModes in a different order', async () => {
      service = buildService(['locationRequiredForModes']);

      await expect(
        submit('locationRequiredForModes', ['HYBRID', 'OFFICE', 'REMOTE']),
      ).resolves.toBeDefined();
    });
  });

  /*
   * The lock is defence in depth and is deliberately unreachable from this
   * entry point now: the refusal above runs first, so nothing gets as far as
   * the substitution with a contradicting value. What IS reachable, and what
   * these cases pin, is the invariant the lock exists for - no path through
   * `updateTenantSettings` can leave a mandated key stored at any other value.
   */
  describe('no mandated key can end up stored at another value', () => {
    it.each(MANDATED)(
      'rewrites a contradicting stored attendance.%s to the mandate',
      async (key, mandated, contradicting) => {
        service = buildService([key]);
        tenantSettingsRepository.findSettingsByTenant.mockResolvedValue([
          { category: 'attendance', key, value: contradicting },
        ]);

        await submit(key, mandated);

        expect(tenantSettingsRepository.upsertSettings).toHaveBeenCalledWith(
          'tenant-1',
          [expect.objectContaining({ key, value: mandated })],
        );
      },
    );

    it('leaves an unmandated attendance key alone', async () => {
      service = buildService(['defaultGraceMinutes']);
      tenantSettingsRepository.findSettingsByTenant.mockResolvedValue([
        { category: 'attendance', key: 'defaultGraceMinutes', value: 10 },
      ]);

      await submit('defaultGraceMinutes', 25);

      expect(tenantSettingsRepository.upsertSettings).toHaveBeenCalledWith(
        'tenant-1',
        [expect.objectContaining({ key: 'defaultGraceMinutes', value: 25 })],
      );
    });
  });

  it('does not police keys outside the attendance category', async () => {
    service = new TenantSettingsService(
      {
        findTenantById: jest.fn().mockResolvedValue(null),
        findSettingsByTenant: jest.fn().mockResolvedValue([]),
        upsertSettings: jest.fn(),
        upsertFeatures: jest.fn(),
      } as never,
      {
        getAllowedKeysByCategory: jest
          .fn()
          .mockReturnValue(
            new Map([['timesheets', new Set(['highAccuracyLocation'])]]),
          ),
        invalidateTenantCache: jest.fn(),
      } as never,
      { getResolvedTenantFeatures: jest.fn() } as never,
      { log: jest.fn() } as never,
      { delete: jest.fn(), deleteByPrefix: jest.fn() } as never,
    );

    await expect(
      service.updateTenantSettings(actor, {
        updates: [
          {
            category: 'timesheets',
            key: 'highAccuracyLocation',
            value: false,
          },
        ] as never,
      }),
    ).resolves.toBeDefined();
  });
});

/*
 * ITEM-0112 — everything above exercises the lock only through the public
 * `updateTenantSettings` entry point, and `assertAttendanceSettingIsChangeable`
 * throws before `enforceCriticalAttendanceSetting` is ever reached for a
 * contradicting value, so the write-time lock itself — the function this
 * record is about — had no test naming it. `grep -rn
 * "enforceCriticalAttendanceSetting" services/api/src --include=*.spec.ts`
 * returned nothing before this block existed.
 *
 * These tests call the function directly, so deleting it fails the suite at
 * compile time rather than only at runtime, and they check the exported
 * `MANDATORY_ATTENDANCE_SETTINGS` map's *key set* against the independent
 * `MANDATED` table above — not by re-deriving expected values from the map
 * itself, which would pass whatever the map says (the mutation-testing
 * failure this repository has hit before), but by asserting the two lists of
 * *which keys are mandated* agree. Adding a key to the map without deciding
 * whether it belongs in `MANDATED` now fails a test instead of shipping
 * silently.
 */
describe('ITEM-0112 — enforceCriticalAttendanceSetting has direct test coverage', () => {
  it.each(MANDATED)(
    'rewrites a submitted attendance.%s to the mandated value regardless of input',
    (key, mandated, contradicting) => {
      expect(
        enforceCriticalAttendanceSetting('attendance', key, contradicting),
      ).toEqual(mandated);
      expect(
        enforceCriticalAttendanceSetting('attendance', key, mandated),
      ).toEqual(mandated);
    },
  );

  it('passes through a non-mandated attendance key unchanged', () => {
    expect(
      enforceCriticalAttendanceSetting('attendance', 'defaultGraceMinutes', 25),
    ).toBe(25);
  });

  it('does not police a mandated key name outside the attendance category', () => {
    // Same key name as a mandated attendance setting, different category: the
    // `category !== 'attendance'` early return must fire before the map is
    // even consulted.
    expect(
      enforceCriticalAttendanceSetting(
        'timesheets',
        'locationCaptureRequired',
        false,
      ),
    ).toBe(false);
  });

  it('the MANDATED table names exactly the keys the exported map mandates', () => {
    /*
     * `locationRequiredForModes` is mandated but array-valued, so it is
     * covered by its own tests above ("refuses a locationRequiredForModes
     * that drops a mandated mode", "accepts ... in a different order") rather
     * than by the [key, mandated, contradicting]-of-booleans shape `MANDATED`
     * uses. It is listed here explicitly rather than silently excluded, so a
     * second array-valued key added to the map without a decision either way
     * still fails this test.
     */
    const coveredElsewhere = ['locationRequiredForModes'];
    expect(Object.keys(MANDATORY_ATTENDANCE_SETTINGS).sort()).toEqual(
      [...MANDATED.map(([key]) => key), ...coveredElsewhere].sort(),
    );
  });
});
