import { PartnerExperienceService } from './partner-experience.service';
import { AppError } from '../../common/errors/app-error';

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
            // The one state activation starts from after onboarding approval.
            status: 'INFORMATION_APPROVED',
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
      { log: jest.fn() } as never,
      { next: jest.fn(async () => 'PART-000001') } as never,
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
            // The one state activation starts from after onboarding approval.
            status: 'INFORMATION_APPROVED',
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
      { log: jest.fn() } as never,
      { next: jest.fn(async () => 'PART-000001') } as never,
    );
    await expect(
      service.activatePartner(platformAdmin, 'partner-1'),
    ).rejects.toThrow('fully signed partner agreement');
  });

  function activationHarness(
    input: {
      delivery?: 'SENT' | 'FAILED';
      existingPortalUser?: Record<string, unknown> | null;
      finalCommitFailure?: boolean;
    } = {},
  ) {
    const partner = {
      id: 'partner-1',
      status: 'INFORMATION_APPROVED',
      accountStatus: 'NOT_PROVISIONED',
      email: 'contact@partner.example',
      contactFirstName: 'Partner',
      contactLastName: 'Contact',
      updatedAt: new Date('2026-10-08T00:00:00Z'),
      onboardingApplications: [{ status: 'APPROVED' }],
      agreements: [{ id: 'agreement-1', status: 'FULLY_SIGNED' }],
    };
    let portalUser = input.existingPortalUser ?? null;
    let delivery: 'SENT' | 'FAILED' = input.delivery ?? 'SENT';
    let finalCommitFailure = input.finalCommitFailure ?? false;
    const sendEmail = jest.fn(async () => ({
      id: 'email-1',
      status: delivery,
    }));
    const audit = { log: jest.fn(async () => undefined) };

    const prisma = {
      partner: {
        findUnique: jest.fn(async () => ({ ...partner })),
        updateMany: jest.fn(
          async (args: {
            where: { id: string; status?: string; updatedAt?: Date };
            data: { status?: string; accountStatus?: string; updatedAt?: Date };
          }) => {
            if (
              args.where.id !== partner.id ||
              (args.where.status && args.where.status !== partner.status) ||
              (args.where.updatedAt &&
                args.where.updatedAt.getTime() !== partner.updatedAt.getTime())
            )
              return { count: 0 };
            Object.assign(partner, args.data);
            if (!args.data.updatedAt) partner.updatedAt = new Date();
            return { count: 1 };
          },
        ),
      },
      partnerPortalUser: {
        findUnique: jest.fn(
          async (args: { where: { email?: string; id?: string } }) =>
            portalUser &&
            ((args.where.email && portalUser.email === args.where.email) ||
              (args.where.id && portalUser.id === args.where.id))
              ? { ...portalUser }
              : null,
        ),
        findUniqueOrThrow: jest.fn(async () => {
          if (finalCommitFailure) {
            finalCommitFailure = false;
            throw new Error('final activation commit failed');
          }
          if (!portalUser) throw new Error('portal user missing');
          return { ...portalUser };
        }),
        create: jest.fn(async (args: { data: Record<string, unknown> }) => {
          portalUser = { id: 'portal-1', activatedAt: null, ...args.data };
          return { ...portalUser };
        }),
        update: jest.fn(async (args: { data: Record<string, unknown> }) => {
          portalUser = { ...portalUser, ...args.data };
          return { ...portalUser };
        }),
        updateMany: jest.fn(
          async (args: {
            where: {
              id: string;
              partnerId: string;
              invitationTokenHash: string;
            };
            data: Record<string, unknown>;
          }) => {
            if (
              !portalUser ||
              portalUser.id !== args.where.id ||
              portalUser.partnerId !== args.where.partnerId ||
              portalUser.invitationTokenHash !== args.where.invitationTokenHash
            )
              return { count: 0 };
            portalUser = { ...portalUser, ...args.data };
            return { count: 1 };
          },
        ),
        deleteMany: jest.fn(
          async (args: {
            where: {
              id: string;
              partnerId: string;
              invitationTokenHash: string;
            };
          }) => {
            if (
              !portalUser ||
              portalUser.id !== args.where.id ||
              portalUser.partnerId !== args.where.partnerId ||
              portalUser.invitationTokenHash !== args.where.invitationTokenHash
            )
              return { count: 0 };
            portalUser = null;
            return { count: 1 };
          },
        ),
      },
      platformOutboundEmail: {
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      partnerReferralLink: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'link-1' })),
      },
      partnerTimeline: {
        create: jest.fn(async () => ({ id: 'timeline-1' })),
      },
      $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work(prisma),
      ),
    };
    const service = new PartnerExperienceService(
      prisma as never,
      {} as never,
      { sendEmail } as never,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
    );
    return {
      service,
      partner,
      sendEmail,
      audit,
      portalUser: () => portalUser,
      deliverSuccessfully: () => {
        delivery = 'SENT';
      },
    };
  }

  it('does not activate on failed delivery and permits a successful retry', async () => {
    const h = activationHarness({ delivery: 'FAILED' });

    await expect(
      h.service.activatePartner(platformAdmin, 'partner-1'),
    ).rejects.toMatchObject({
      errorCode: 'PARTNER_INVITATION_DELIVERY_FAILED',
    } satisfies Partial<AppError>);
    expect(h.partner).toMatchObject({
      status: 'INFORMATION_APPROVED',
      accountStatus: 'NOT_PROVISIONED',
    });
    expect(h.portalUser()).toBeNull();
    expect(h.audit.log).not.toHaveBeenCalled();

    h.deliverSuccessfully();
    await expect(
      h.service.activatePartner(platformAdmin, 'partner-1'),
    ).resolves.toMatchObject({ portalUserId: 'portal-1' });
    expect(h.partner).toMatchObject({
      status: 'ACTIVE',
      accountStatus: 'INVITED',
    });
    expect(h.audit.log).toHaveBeenCalledTimes(1);
  });

  it('refuses an email already owned by another partner without rotating it', async () => {
    const existing = {
      id: 'portal-other',
      partnerId: 'partner-other',
      email: 'contact@partner.example',
      status: 'INVITED',
      activatedAt: null,
      invitationTokenHash: 'existing-hash',
      invitationExpiresAt: new Date(Date.now() + 86_400_000),
    };
    const h = activationHarness({ existingPortalUser: existing });

    await expect(
      h.service.activatePartner(platformAdmin, 'partner-1'),
    ).rejects.toMatchObject({ errorCode: 'PARTNER_CONTACT_EMAIL_IN_USE' });
    expect(h.portalUser()).toEqual(existing);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.partner.status).toBe('INFORMATION_APPROVED');
  });

  it('revokes its token when the final lifecycle commit fails so retry is possible', async () => {
    const h = activationHarness({ finalCommitFailure: true });

    await expect(
      h.service.activatePartner(platformAdmin, 'partner-1'),
    ).rejects.toThrow('final activation commit failed');
    expect(h.partner.status).toBe('INFORMATION_APPROVED');
    expect(h.portalUser()).toBeNull();

    await expect(
      h.service.activatePartner(platformAdmin, 'partner-1'),
    ).resolves.toMatchObject({ portalUserId: 'portal-1' });
    expect(h.partner.status).toBe('ACTIVE');
  });
});
