import { createHash } from 'node:crypto';
import { AppError } from '../../common/errors/app-error';
import { PartnerExperienceService } from './partner-experience.service';

/**
 * EXECPLAN-0055 WP-05 (D6) — the partner onboarding invitation.
 *
 * The defects this guards: a resend was deduplicated by the outbox (same
 * idempotency key every time) so it never arrived while the partner's existing
 * link had just been revoked; an ACTIVE partner could be demoted to
 * ONBOARDING_PENDING; the raw token was returned to the console; and a failed
 * delivery was reported as sent.
 *
 * The Prisma double below keeps real state (partner, applications, timeline,
 * outbound rows) so "the old link is rejected after a resend" is checked by
 * presenting the old token to the public endpoint, not by inspecting a mock.
 */

type Application = {
  id: string;
  partnerId: string;
  status: string;
  invitationTokenHash: string;
  tokenExpiresAt: Date;
  submittedAt: Date | null;
  updatedAt: Date;
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

const PROVIDER_FAILURE = 'No platform email provider is configured.';

function harness(
  options: {
    status?: string;
    email?: string;
    agreements?: Array<{ contractType: string; status: string }>;
    settings?: Record<string, unknown>;
    delivery?: 'SENT' | 'FAILED' | 'REJECTED';
  } = {},
) {
  const partner = {
    id: 'partner-1',
    status: options.status ?? 'AGREEMENT_EXECUTED',
    email: options.email ?? 'Contact@Partner.Example',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  const applications: Application[] = [];
  const timeline: Array<Record<string, unknown>> = [];
  const outbound: Array<{
    id: string;
    status: string;
    idempotencyKey?: string;
    htmlBody: string;
    errorMessage: string | null;
    nextRetryAt: Date | null;
  }> = [];
  let sequence = 0;
  const clock = () => new Date(Date.now() + sequence++);

  const prisma = {
    platformSetting: {
      findUnique: jest.fn(async () => ({
        value: {
          requiredAgreementTypes: ['MASTER_PARTNER_AGREEMENT'],
          agreementRequiredForOnboarding: true,
          onboardingLinkExpiryDays: 14,
          ...options.settings,
        },
      })),
    },
    partner: {
      findUnique: jest.fn(async () => ({
        ...partner,
        agreements: options.agreements ?? [
          {
            contractType: 'MASTER_PARTNER_AGREEMENT',
            status: 'FULLY_EXECUTED',
          },
        ],
        onboardingApplications: applications
          .filter((item) => !['APPROVED', 'REJECTED'].includes(item.status))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, 1)
          .map((item) => ({ ...item })),
      })),
      updateMany: jest.fn(
        async (args: {
          where: { id: string; status?: string; updatedAt?: Date };
          data: { status?: string; updatedAt?: Date };
        }) => {
          const { where, data } = args;
          if (where.status && where.status !== partner.status)
            return { count: 0 };
          if (
            where.updatedAt &&
            where.updatedAt.getTime() !== partner.updatedAt.getTime()
          )
            return { count: 0 };
          if (data.status) partner.status = data.status;
          partner.updatedAt = data.updatedAt ?? clock();
          return { count: 1 };
        },
      ),
    },
    partnerOnboardingApplication: {
      create: jest.fn(async (args: { data: Partial<Application> }) => {
        const created: Application = {
          id: `application-${applications.length + 1}`,
          partnerId: 'partner-1',
          status: 'INVITED',
          invitationTokenHash: '',
          tokenExpiresAt: new Date(),
          submittedAt: null,
          ...args.data,
          updatedAt: clock(),
        };
        applications.push(created);
        return { id: created.id };
      }),
      updateMany: jest.fn(
        async (args: {
          where: { id: string; updatedAt?: Date };
          data: Partial<Application>;
        }) => {
          const item = applications.find((row) => row.id === args.where.id);
          if (
            !item ||
            (args.where.updatedAt &&
              args.where.updatedAt.getTime() !== item.updatedAt.getTime())
          )
            return { count: 0 };
          Object.assign(item, args.data, { updatedAt: clock() });
          return { count: 1 };
        },
      ),
      update: jest.fn(
        async (args: { where: { id: string }; data: Partial<Application> }) => {
          const item = applications.find((row) => row.id === args.where.id)!;
          Object.assign(item, { updatedAt: clock() }, args.data);
          return item;
        },
      ),
      deleteMany: jest.fn(async (args: { where: { id: string } }) => {
        const index = applications.findIndex((row) => row.id === args.where.id);
        if (index >= 0) applications.splice(index, 1);
        return { count: index >= 0 ? 1 : 0 };
      }),
      findUnique: jest.fn(
        async (args: { where: { invitationTokenHash: string } }) => {
          const item = applications.find(
            (row) => row.invitationTokenHash === args.where.invitationTokenHash,
          );
          return item
            ? {
                ...item,
                partner: { displayName: 'Acme', type: 'COMPANY', email: '' },
                submissions: [],
              }
            : null;
        },
      ),
    },
    partnerTimeline: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        timeline.push(args.data);
        return args.data;
      }),
    },
    platformOutboundEmail: {
      updateMany: jest.fn(
        async (args: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = outbound.find((item) => item.id === args.where.id);
          if (row) Object.assign(row, args.data);
          return { count: row ? 1 : 0 };
        },
      ),
    },
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work(prisma),
    ),
  };

  const sendEmail = jest.fn(
    async (input: { idempotencyKey?: string; html: string }) => {
      const status = options.delivery ?? 'SENT';
      const row = {
        id: `email-${outbound.length + 1}`,
        status,
        idempotencyKey: input.idempotencyKey,
        htmlBody: input.html,
        errorMessage: status === 'SENT' ? null : PROVIDER_FAILURE,
        nextRetryAt: status === 'FAILED' ? new Date() : null,
      };
      outbound.push(row);
      return row;
    },
  );
  const audit = { log: jest.fn() };

  const service = new PartnerExperienceService(
    prisma as never,
    {} as never,
    { sendEmail } as never,
    {} as never,
    {} as never,
    audit as never,
    {} as never,
  );

  /** The token the partner received in the most recent email. */
  function lastEmailedToken() {
    const html = outbound[outbound.length - 1]?.htmlBody ?? '';
    return /\/partners\/onboarding\/([A-Za-z0-9_-]+)/.exec(html)?.[1] ?? '';
  }
  /** Move the cooldown clock past the last issue. */
  function ageApplications(ms = 61_000) {
    for (const item of applications)
      item.updatedAt = new Date(item.updatedAt.getTime() - ms);
  }

  return {
    service,
    partner,
    applications,
    timeline,
    outbound,
    sendEmail,
    audit,
    lastEmailedToken,
    ageApplications,
  };
}

function platformUser(role: string, permissionKeys: string[] = []) {
  return {
    userId: `user-${role}`,
    tenantId: 'platform',
    email: `${role.toLowerCase()}@example.test`,
    roleIds: [],
    roleKeys: [],
    permissionKeys,
    platform: { id: `user-${role}`, role, status: 'ACTIVE' },
  } as never;
}

const superAdmin = platformUser('SUPER_ADMIN');

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => {
      throw new Error('expected a refusal');
    },
    (caught: unknown) => caught,
  );
  return error as AppError & { getStatus?: () => number };
}

describe('partner onboarding invitation (EXECPLAN-0055 WP-05)', () => {
  beforeAll(() => {
    process.env.LANDING_APP_URL = 'https://www.dijipeople.example';
  });

  it('sends to the single onboarding contact and marks the partner invited', async () => {
    const h = harness();
    const result = await h.service.sendOnboardingInvitation(
      superAdmin,
      'partner-1',
    );

    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.sendEmail.mock.calls[0][0]).toMatchObject({
      recipient: 'contact@partner.example',
      eventCode: 'PARTNER_ONBOARDING_INVITATION',
    });
    expect(h.partner.status).toBe('ONBOARDING_INVITED');
    // Exactly these keys: nothing that could carry the token or the link.
    expect(Object.keys(result).sort()).toEqual([
      'applicationId',
      'expiresAt',
      'message',
      'partnerStatus',
      'resend',
      'sentTo',
    ]);
    expect(result).toMatchObject({
      applicationId: 'application-1',
      sentTo: 'contact@partner.example',
      resend: false,
      partnerStatus: 'ONBOARDING_INVITED',
    });
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.message).toMatch(
      /^Onboarding link sent to contact@partner\.example\. It expires on \d+ \w+ \d{4}\.$/,
    );
    expect(h.timeline[h.timeline.length - 1]).toMatchObject({
      eventType: 'PARTNER_ONBOARDING_INVITED',
      actorId: 'user-SUPER_ADMIN',
    });
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PARTNER_ONBOARDING_INVITATION_SENT',
        actorUserId: 'user-SUPER_ADMIN',
      }),
    );
  });

  it('keys the email on the token hash, and stores only the hash', async () => {
    const h = harness();
    await h.service.sendOnboardingInvitation(superAdmin, 'partner-1');
    const token = h.lastEmailedToken();
    // 32 random bytes, base64url.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(h.applications[0].invitationTokenHash).toBe(sha256(token));
    expect(h.sendEmail.mock.calls[0][0].idempotencyKey).toBe(
      `partner-onboarding:application-1:${sha256(token)}`,
    );
  });

  it('never puts the token, its hash or the link in the response, timeline or audit', async () => {
    const h = harness();
    const result = await h.service.sendOnboardingInvitation(
      superAdmin,
      'partner-1',
    );
    const token = h.lastEmailedToken();
    const exposed = JSON.stringify([
      result,
      h.timeline,
      h.audit.log.mock.calls,
    ]);
    expect(exposed).not.toContain(token);
    expect(exposed).not.toContain(sha256(token));
    expect(exposed).not.toContain('/partners/onboarding/');
  });

  it('resends from ONBOARDING_INVITED: a new key, a new link, and the old link rejected', async () => {
    const h = harness();
    await h.service.sendOnboardingInvitation(superAdmin, 'partner-1');
    const firstToken = h.lastEmailedToken();
    h.ageApplications();

    const resent = await h.service.sendOnboardingInvitation(
      superAdmin,
      'partner-1',
    );
    const secondToken = h.lastEmailedToken();

    expect(resent.resend).toBe(true);
    expect(resent.message).toMatch(/^Onboarding link resent to /);
    expect(secondToken).not.toBe(firstToken);
    // The same application is reused, so the partner has one live link.
    expect(h.applications).toHaveLength(1);
    const keys = h.sendEmail.mock.calls.map((call) => call[0].idempotencyKey);
    expect(new Set(keys).size).toBe(2);

    await expect(h.service.getOnboarding(secondToken)).resolves.toMatchObject({
      id: 'application-1',
    });
    const old = await refusal(h.service.getOnboarding(firstToken));
    expect(old.errorCode).toBe('PARTNER_ONBOARDING_LINK_INVALID');
    expect(old.statusCode).toBe(404);
  });

  it('rejects an expired link, and a link whose application was decided', async () => {
    const h = harness();
    await h.service.sendOnboardingInvitation(superAdmin, 'partner-1');
    const token = h.lastEmailedToken();

    h.applications[0].tokenExpiresAt = new Date(Date.now() - 1000);
    const expired = await refusal(h.service.getOnboarding(token));
    expect(expired.errorCode).toBe('PARTNER_ONBOARDING_LINK_EXPIRED');
    const submitExpired = await refusal(
      h.service.submitOnboarding(token, { data: {} } as never),
    );
    expect(submitExpired.errorCode).toBe('PARTNER_ONBOARDING_LINK_EXPIRED');

    h.applications[0].status = 'APPROVED';
    const closed = await refusal(h.service.getOnboarding(token));
    expect(closed.errorCode).toBe('PARTNER_ONBOARDING_CLOSED');
  });

  it('refuses a resend inside the cooldown, without sending or rotating', async () => {
    const h = harness();
    await h.service.sendOnboardingInvitation(superAdmin, 'partner-1');
    const hash = h.applications[0].invitationTokenHash;

    const error = await refusal(
      h.service.sendOnboardingInvitation(superAdmin, 'partner-1'),
    );
    expect(error.errorCode).toBe('PARTNER_INVITATION_COOLDOWN');
    expect(error.statusCode).toBe(429);
    expect(error.message).toMatch(/Wait \d+ seconds/);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.applications[0].invitationTokenHash).toBe(hash);
  });

  it.each([
    ['ACTIVE', 'PARTNER_ALREADY_ONBOARDED'],
    ['SUBMITTED', 'PARTNER_ALREADY_ONBOARDED'],
    ['INFORMATION_APPROVED', 'PARTNER_ALREADY_ONBOARDED'],
    ['SUSPENDED', 'PARTNER_INVITATION_NOT_ALLOWED'],
    ['INACTIVE', 'PARTNER_INVITATION_NOT_ALLOWED'],
    ['TERMINATED', 'PARTNER_INVITATION_NOT_ALLOWED'],
    ['REJECTED', 'PARTNER_INVITATION_NOT_ALLOWED'],
    ['DRAFT', 'PARTNER_ACTION_NOT_AVAILABLE'],
  ])(
    'refuses a partner in %s with %s and changes nothing',
    async (status, code) => {
      const h = harness({ status });
      const error = await refusal(
        h.service.sendOnboardingInvitation(superAdmin, 'partner-1'),
      );
      expect(error.errorCode).toBe(code);
      // The old code demoted an ACTIVE partner to ONBOARDING_PENDING here.
      expect(h.partner.status).toBe(status);
      expect(h.sendEmail).not.toHaveBeenCalled();
      expect(h.applications).toHaveLength(0);
    },
  );

  it('names the missing agreement before the agreement is executed (400)', async () => {
    const h = harness({
      status: 'APPROVED_AWAITING_AGREEMENT',
      agreements: [],
    });
    const error = await refusal(
      h.service.sendOnboardingInvitation(superAdmin, 'partner-1'),
    );
    expect(error.errorCode).toBe('PARTNER_ONBOARDING_AGREEMENT_REQUIRED');
    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('MASTER_PARTNER_AGREEMENT');
  });

  it.each([
    ['', 'PARTNER_ONBOARDING_CONTACT_MISSING'],
    ['   ', 'PARTNER_ONBOARDING_CONTACT_MISSING'],
    ['not-an-email', 'PARTNER_ONBOARDING_CONTACT_INVALID'],
    ['two@@example.test', 'PARTNER_ONBOARDING_CONTACT_INVALID'],
  ])('refuses contact email %j with %s', async (email, code) => {
    const h = harness({ email });
    const error = await refusal(
      h.service.sendOnboardingInvitation(superAdmin, 'partner-1'),
    );
    expect(error.errorCode).toBe(code);
    expect(error.statusCode).toBe(400);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it.each(['FAILED', 'REJECTED'] as const)(
    'a %s delivery is a domain error: no status change, no link left behind',
    async (delivery) => {
      const h = harness({ delivery });
      const error = await refusal(
        h.service.sendOnboardingInvitation(superAdmin, 'partner-1'),
      );
      expect(error.errorCode).toBe('PARTNER_INVITATION_DELIVERY_FAILED');
      expect(error.statusCode).toBe(502);
      expect(error.message).toContain(PROVIDER_FAILURE);
      expect(h.partner.status).toBe('AGREEMENT_EXECUTED');
      // The never-delivered first link is withdrawn.
      expect(h.applications).toHaveLength(0);
      // ...and taken off the automatic retry schedule.
      expect(h.outbound[0].nextRetryAt).toBeNull();
      expect(h.timeline[h.timeline.length - 1]).toMatchObject({
        eventType: 'PARTNER_ONBOARDING_INVITATION_FAILED',
      });
      expect(h.audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PARTNER_ONBOARDING_INVITATION_FAILED',
          actorUserId: 'user-SUPER_ADMIN',
        }),
      );
    },
  );

  it('a failed resend keeps the link the partner already holds working', async () => {
    const h = harness();
    await h.service.sendOnboardingInvitation(superAdmin, 'partner-1');
    const firstToken = h.lastEmailedToken();
    h.ageApplications();
    h.sendEmail.mockImplementationOnce(async (input) => {
      const row = {
        id: 'email-failed',
        status: 'FAILED',
        idempotencyKey: input.idempotencyKey,
        htmlBody: input.html,
        errorMessage: PROVIDER_FAILURE,
        nextRetryAt: new Date(),
      };
      h.outbound.push(row);
      return row;
    });

    const error = await refusal(
      h.service.sendOnboardingInvitation(superAdmin, 'partner-1'),
    );
    expect(error.errorCode).toBe('PARTNER_INVITATION_DELIVERY_FAILED');
    expect(error.message).toContain('the previous link still works');
    await expect(h.service.getOnboarding(firstToken)).resolves.toMatchObject({
      id: 'application-1',
    });
    // The failure does not start the cooldown.
    await expect(
      h.service.sendOnboardingInvitation(superAdmin, 'partner-1'),
    ).resolves.toMatchObject({ resend: true });
  });

  it('a resend after changes were requested keeps ONBOARDING_IN_PROGRESS', async () => {
    const h = harness({ status: 'ONBOARDING_IN_PROGRESS' });
    h.applications.push({
      id: 'application-1',
      partnerId: 'partner-1',
      status: 'CHANGES_REQUESTED',
      invitationTokenHash: 'old-hash',
      tokenExpiresAt: new Date(Date.now() - 1000),
      submittedAt: new Date(),
      updatedAt: new Date(Date.now() - 120_000),
    });
    await h.service.sendOnboardingInvitation(superAdmin, 'partner-1');
    expect(h.partner.status).toBe('ONBOARDING_IN_PROGRESS');
    expect(h.applications[0].status).toBe('CHANGES_REQUESTED');
    expect(h.applications[0].invitationTokenHash).not.toBe('old-hash');
  });

  it('requires partners.manage: read-only roles are refused, PARTNER_MANAGER and SUPER_ADMIN are allowed', async () => {
    const readOnly = harness();
    await expect(
      readOnly.service.sendOnboardingInvitation(
        platformUser('PLATFORM_OPERATIONS'),
        'partner-1',
      ),
    ).rejects.toThrow('Partner management access is required.');
    expect(readOnly.sendEmail).not.toHaveBeenCalled();

    const manager = harness();
    await expect(
      manager.service.sendOnboardingInvitation(
        platformUser('PARTNER_MANAGER'),
        'partner-1',
      ),
    ).resolves.toMatchObject({ sentTo: 'contact@partner.example' });

    const tenantUser = harness();
    await expect(
      tenantUser.service.sendOnboardingInvitation(
        {
          userId: 'tenant-user',
          tenantId: 'tenant-1',
          permissionKeys: ['partners.manage'],
          roleIds: [],
          roleKeys: [],
        } as never,
        'partner-1',
      ),
    ).rejects.toThrow('Platform access is required.');
  });
});
