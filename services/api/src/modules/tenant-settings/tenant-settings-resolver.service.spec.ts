import { TenantSettingsResolverService } from './tenant-settings-resolver.service';

describe('TenantSettingsResolverService', () => {
  it('resolves system behavior flags from persisted tenant settings', async () => {
    const repository = {
      findSettingsByTenant: jest.fn().mockResolvedValue([
        {
          category: 'system',
          key: 'enableStickyFilters',
          value: false,
        },
        {
          category: 'system',
          key: 'showHelpTips',
          value: false,
        },
      ]),
    };
    const service = new TenantSettingsResolverService(
      repository as never,
      {} as never,
    );

    await expect(service.getSystemSettings('tenant-1')).resolves.toMatchObject({
      enableStickyFilters: false,
      showHelpTips: false,
    });
  });
});
