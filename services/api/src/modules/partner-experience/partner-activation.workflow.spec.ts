import { PartnerExperienceService } from './partner-experience.service';

const platformAdmin = {
  userId: 'user-1',
  tenantId: 'platform',
  email: 'admin@example.test',
  roleIds: [],
  roleKeys: [],
  permissionKeys: ['partners.manage'],
  platform: { id: 'user-1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
} as never;

describe('partner activation workflow', () => {
  it('requires approved onboarding before activation', async () => {
    const service = new PartnerExperienceService(
      {
        partner: {
          findUnique: jest.fn(async () => ({
            id: 'partner-1',
            onboardingApplications: [{ status: 'SUBMITTED' }],
            agreements: [{ status: 'FULLY_SIGNED' }],
          })),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        resolvePublished: jest.fn(async () => null),
        acknowledge: jest.fn(),
      } as never,
    );
    await expect(
      service.activatePartner(platformAdmin, 'partner-1'),
    ).rejects.toThrow('onboarding must be approved');
  });

  it('requires a fully signed agreement after onboarding approval', async () => {
    const service = new PartnerExperienceService(
      {
        partner: {
          findUnique: jest.fn(async () => ({
            id: 'partner-1',
            onboardingApplications: [{ status: 'APPROVED' }],
            agreements: [{ status: 'READY_FOR_SIGNATURE' }],
          })),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        resolvePublished: jest.fn(async () => null),
        acknowledge: jest.fn(),
      } as never,
    );
    await expect(
      service.activatePartner(platformAdmin, 'partner-1'),
    ).rejects.toThrow('fully signed partner agreement');
  });
});
