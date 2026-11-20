import { PlatformOnboardingService } from './platform-onboarding.service';

/**
 * BUG-4467 / BUG-4484: the steps that follow tenant creation must be safe to run
 * again, because a retried provisioning request runs them again.
 */
describe('PlatformOnboardingService recovery steps', () => {
  function build(options: {
    liveInvitation: boolean;
    existingDomain: boolean;
    tenantExists?: boolean;
  }) {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue(
          options.tenantExists === false
            ? null
            : {
                ownerUserId: 'owner-1',
                slug: 'acme',
              },
        ),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'owner-1',
            email: 'o@example.test',
            firstName: 'O',
            lastName: 'Wner',
          },
        ]),
      },
      userInvitation: {
        findFirst: jest
          .fn()
          .mockResolvedValue(options.liveInvitation ? { id: 'inv-1' } : null),
      },
      tenantDomain: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            options.existingDomain ? { domain: 'acme.test' } : null,
          ),
      },
    };
    const invitations = {
      issueInvitation: jest.fn().mockResolvedValue({ invitationId: 'inv-2' }),
    };
    const tenantProvisioning = {
      provisionSystemDomain: jest
        .fn()
        .mockResolvedValue({ domain: 'acme.test', resolvedUrl: 'https://x' }),
    };
    const service = new PlatformOnboardingService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      invitations as never,
      {} as never,
      tenantProvisioning as never,
    );
    return { service, prisma, invitations, tenantProvisioning };
  }

  it('issues an invitation to an invited owner who has none', async () => {
    const { service, invitations } = build({
      liveInvitation: false,
      existingDomain: false,
    });
    await service.ensureOwnerInvitations('tenant-1', null);
    expect(invitations.issueInvitation).toHaveBeenCalledTimes(1);
  });

  it('does not send a second email when a live invitation exists', async () => {
    const { service, invitations } = build({
      liveInvitation: true,
      existingDomain: false,
    });
    await service.ensureOwnerInvitations('tenant-1', null);
    expect(invitations.issueInvitation).not.toHaveBeenCalled();
  });

  it('scopes every read to the tenant', async () => {
    const { service, prisma } = build({
      liveInvitation: false,
      existingDomain: false,
    });
    await service.ensureOwnerInvitations('tenant-1', null);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1' }) as unknown,
      }),
    );
  });

  it('issues the system hostname once and never re-announces it', async () => {
    const first = build({ liveInvitation: false, existingDomain: false });
    await first.service.ensureSystemDomain('tenant-1', null);
    expect(
      first.tenantProvisioning.provisionSystemDomain,
    ).toHaveBeenCalledTimes(1);

    const again = build({ liveInvitation: false, existingDomain: true });
    const result = await again.service.ensureSystemDomain('tenant-1', null);
    expect(result.domain).toBe('acme.test');
    expect(
      again.tenantProvisioning.provisionSystemDomain,
    ).not.toHaveBeenCalled();
  });
});
