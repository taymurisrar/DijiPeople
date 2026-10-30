import { BadRequestException } from '@nestjs/common';
import { TenantSettingsService } from './tenant-settings.service';

/**
 * DP-QA-012. `PATCH /tenant-settings` stored "Not/AZone" and then every page
 * threw `RangeError: Invalid time zone` from Intl.DateTimeFormat.
 */
describe('TenantSettingsService time zone validation', () => {
  let service: TenantSettingsService;
  let upsertSettings: jest.Mock;

  beforeEach(() => {
    upsertSettings = jest.fn();
    const repository = {
      findTenantById: jest.fn().mockResolvedValue(null),
      findSettingsByTenant: jest.fn().mockResolvedValue([]),
      upsertSettings,
      upsertFeatures: jest.fn(),
    };
    service = new TenantSettingsService(
      repository as never,
      {
        getAllowedKeysByCategory: jest
          .fn()
          .mockReturnValue(new Map([['organization', new Set(['timezone'])]])),
        invalidateTenantCache: jest.fn(),
      } as never,
      { getResolvedTenantFeatures: jest.fn() } as never,
      { log: jest.fn() } as never,
      { delete: jest.fn(), deleteByPrefix: jest.fn() } as never,
    );
  });

  const update = (key: string, value: unknown) =>
    service.updateTenantSettings(
      { tenantId: 'tenant-1', userId: 'user-1' } as never,
      { updates: [{ category: 'organization', key, value }] } as never,
    );

  it.each(['timezone'])(
    'rejects an invalid %s and stores nothing',
    async (key) => {
      await expect(update(key, 'Not/AZone')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(upsertSettings).not.toHaveBeenCalled();
    },
  );

  it('accepts a real IANA zone', async () => {
    await update('timezone', 'Asia/Karachi');
    expect(upsertSettings).toHaveBeenCalledTimes(1);
    const [, updates] = upsertSettings.mock.calls[0] as [string, unknown[]];
    expect(updates[0]).toMatchObject({
      key: 'timezone',
      value: 'Asia/Karachi',
    });
  });
});
