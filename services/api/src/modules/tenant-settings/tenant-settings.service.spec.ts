import { BadRequestException } from '@nestjs/common';
import { TenantSettingsService } from './tenant-settings.service';

describe('TenantSettingsService', () => {
  let service: TenantSettingsService;
  let tenantSettingsRepository: {
    findTenantById: jest.Mock;
    findSettingsByTenant: jest.Mock;
    upsertSettings: jest.Mock;
    upsertFeatures: jest.Mock;
  };
  let featureAccessService: {
    getResolvedTenantFeatures: jest.Mock;
  };

  beforeEach(() => {
    tenantSettingsRepository = {
      findTenantById: jest.fn().mockResolvedValue(null),
      findSettingsByTenant: jest.fn().mockResolvedValue([]),
      upsertSettings: jest.fn(),
      upsertFeatures: jest.fn(),
    };
    featureAccessService = {
      getResolvedTenantFeatures: jest.fn(),
    };

    service = new TenantSettingsService(
      tenantSettingsRepository as never,
      {
        getAllowedKeysByCategory: jest.fn().mockReturnValue(
          new Map([
            ['organization', new Set(['companyDisplayName'])],
            ['branding', new Set(['appTitle'])],
          ]),
        ),
        invalidateTenantCache: jest.fn(),
      } as never,
      featureAccessService as never,
      { log: jest.fn() } as never,
      { delete: jest.fn(), deleteByPrefix: jest.fn() } as never,
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

  it('persists multivalue tenant settings from runtime forms as arrays', async () => {
    service = new TenantSettingsService(
      tenantSettingsRepository as never,
      {
        getAllowedKeysByCategory: jest
          .fn()
          .mockReturnValue(
            new Map([['attendance', new Set(['allowedModes'])]]),
          ),
        invalidateTenantCache: jest.fn(),
      } as never,
      featureAccessService as never,
      { log: jest.fn() } as never,
      { delete: jest.fn(), deleteByPrefix: jest.fn() } as never,
    );

    await service.updateTenantSettings(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
      } as never,
      {
        updates: [
          {
            category: 'attendance',
            key: 'allowedModes',
            value: ['REMOTE', 'OFFICE'],
          },
        ],
      },
    );

    expect(tenantSettingsRepository.upsertSettings).toHaveBeenCalledWith(
      'tenant-1',
      [
        {
          actorUserId: 'user-1',
          category: 'attendance',
          key: 'allowedModes',
          value: ['OFFICE', 'REMOTE'],
        },
      ],
    );
  });
});
