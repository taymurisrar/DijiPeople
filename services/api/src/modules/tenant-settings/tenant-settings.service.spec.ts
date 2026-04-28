import { BadRequestException } from '@nestjs/common';
import { TenantSettingsService } from './tenant-settings.service';

describe('TenantSettingsService', () => {
  let service: TenantSettingsService;
  let tenantSettingsRepository: {
    findSettingsByTenant: jest.Mock;
    upsertSettings: jest.Mock;
    upsertFeatures: jest.Mock;
  };
  let featureAccessService: {
    getResolvedTenantFeatures: jest.Mock;
  };

  beforeEach(() => {
    tenantSettingsRepository = {
      findSettingsByTenant: jest.fn().mockResolvedValue([]),
      upsertSettings: jest.fn(),
      upsertFeatures: jest.fn(),
    };
    featureAccessService = {
      getResolvedTenantFeatures: jest.fn(),
    };

    service = new TenantSettingsService(
      tenantSettingsRepository as never,
      featureAccessService as never,
      { log: jest.fn() } as never,
    );
  });

  it('rejects whitespace-only setting keys after trimming', async () => {
    await expect(
      service.updateTenantSettings(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
        } as never,
        {
          updates: [
            {
              category: 'organization',
              key: '   ',
              value: true,
            },
          ],
        },
      ),
    ).rejects.toThrow(new BadRequestException('Setting keys cannot be empty.'));
  });

  it('rejects enabling features that are not included in the current plan', async () => {
    featureAccessService.getResolvedTenantFeatures.mockResolvedValue({
      items: [
        {
          key: 'payroll',
          isIncludedInPlan: false,
          isEnabled: false,
          tenantOverrideEnabled: null,
        },
      ],
    });

    await expect(
      service.updateTenantFeatures(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
        } as never,
        {
          updates: [
            {
              key: 'payroll',
              isEnabled: true,
            },
          ],
        },
      ),
    ).rejects.toThrow(
      new BadRequestException(
        'Feature payroll is not available on the current subscription plan.',
      ),
    );
  });
});
