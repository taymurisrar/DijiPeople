import { BadRequestException } from '@nestjs/common';

import { TenantSettingsService } from './tenant-settings.service';

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
