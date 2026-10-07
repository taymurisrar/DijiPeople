import { createHash, randomUUID } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  DEFAULT_PLATFORM_EMAIL_SETTINGS,
  PLATFORM_EMAIL_SETTINGS_KEY,
} from '../src/modules/notifications/email/platform-email-settings.shared';
import { describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * EXECPLAN-0055 WP-05 (D6) — the partner onboarding invitation over real HTTP
 * and a real database: the runtime record route the console calls, the
 * outbox row the email becomes, and the public link the partner opens.
 *
 * What it proves that the unit spec cannot: the idempotency key on the stored
 * outbound row really carries the token hash (so a resend is a new delivery,
 * not a deduplicated no-op), the old link is refused by the public endpoint
 * after a resend, the response never carries the token, and a live partner is
 * refused without being demoted.
 *
 * The partners and their agreement rows are created directly — the contract
 * signing path has its own suite (`partner-lead-funnel`), and a bare
 * FULLY_EXECUTED contract with no versions or documents is deletable, so this
 * suite leaves nothing behind but the platform audit rows.
 *
 * Email: with no stored platform email settings and a non-production
 * environment, delivery resolves to the console provider, which accepts. The
 * last case stores disabled platform email settings (restored afterwards) so
 * the provider resolves to none, as a production deployment without email
 * configured would.
 */
describeWithDatabase()('Partner onboarding invitation (e2e)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let actors: HttpActors;
  let manager: HttpActor;
  let auditor: HttpActor;

  const runId = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const partnerIds: string[] = [];
  const contractIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (actor: HttpActor) => ({
    Authorization: `Bearer ${actor.token}`,
    'X-DijiPeople-App': actor.client,
  });
  const send = (partnerId: string, actor: HttpActor = manager) =>
    http()
      .post(
        `/api/platform-runtime/partners/${partnerId}/actions/send-onboarding-link`,
      )
      .set(as(actor))
      .send({});

  async function requiredAgreementType() {
    const row = await prisma.platformSetting.findUnique({
      where: { key: 'partner-settings' },
    });
    const value = (row?.value ?? {}) as { requiredAgreementTypes?: unknown };
    return Array.isArray(value.requiredAgreementTypes) &&
      typeof value.requiredAgreementTypes[0] === 'string'
      ? (value.requiredAgreementTypes[0] as 'PARTNER_AGREEMENT')
      : 'PARTNER_AGREEMENT';
  }

  async function createPartner(label: string, status: string) {
    const email = `onboarding-${label}-${runId}@example.invalid`;
    const partner = await prisma.partner.create({
      data: {
        code: `E2E-INV-${label}-${runId}`.toUpperCase(),
        displayName: `Invitation ${label} ${runId}`,
        companyName: `Invitation ${label} ${runId}`,
        email,
        currencyCode: 'USD',
        status: status as 'AGREEMENT_EXECUTED',
      },
      select: { id: true, email: true },
    });
    partnerIds.push(partner.id);
    const contract = await prisma.contract.create({
      data: {
        contractNumber: `E2E-INV-${label}-${runId}`.toUpperCase(),
        title: `Partner agreement ${label} ${runId}`,
        contractType: await requiredAgreementType(),
        counterpartyName: `Invitation ${label} ${runId}`,
        status: 'FULLY_EXECUTED',
        partnerId: partner.id,
      },
      select: { id: true },
    });
    contractIds.push(contract.id);
    return partner;
  }

  async function latestEmail(partnerId: string) {
    return prisma.platformOutboundEmail.findFirst({
      where: {
        eventCode: 'PARTNER_ONBOARDING_INVITATION',
        entityId: partnerId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  function tokenFrom(html: string | undefined) {
    return /\/partners\/onboarding\/([A-Za-z0-9_-]+)/.exec(html ?? '')?.[1];
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    // As main.ts does, so refusals carry their catalog `errorCode`.
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    actors = new HttpActors(app, runId);
    manager = await actors.platformUser('PARTNER_MANAGER', 'invite-manager');
    auditor = await actors.platformUser('READ_ONLY_AUDITOR', 'invite-auditor');
  });

  afterAll(async () => {
    if (prisma && partnerIds.length > 0) {
      await prisma.platformOutboundEmail.deleteMany({
        where: { entityId: { in: partnerIds } },
      });
      await prisma.partnerOnboardingApplication.deleteMany({
        where: { partnerId: { in: partnerIds } },
      });
      await prisma.partnerTimeline.deleteMany({
        where: { partnerId: { in: partnerIds } },
      });
      await prisma.contract.deleteMany({ where: { id: { in: contractIds } } });
      await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
    }
    await actors?.cleanup();
    await app?.close();
  });

  it('sends, resends after the cooldown, and refuses the replaced link', async () => {
    const partner = await createPartner('flow', 'AGREEMENT_EXECUTED');

    // partners.manage is required; the read-only auditor is refused.
    await send(partner.id, auditor).expect(403);

    const first = await send(partner.id).expect(201);
    const body = first.body as {
      message: string;
      data: Record<string, unknown>;
    };
    expect(Object.keys(body.data).sort()).toEqual([
      'applicationId',
      'expiresAt',
      'message',
      'partnerStatus',
      'resend',
      'sentTo',
    ]);
    expect(body.data).toMatchObject({
      sentTo: partner.email,
      resend: false,
      partnerStatus: 'ONBOARDING_INVITED',
    });
    expect(body.message).toMatch(
      /^Onboarding link sent to .+\. It expires on /,
    );
    expect(JSON.stringify(first.body)).not.toMatch(/partners\/onboarding\//);

    const firstEmail = await latestEmail(partner.id);
    const firstToken = tokenFrom(firstEmail?.htmlBody);
    expect(firstEmail?.status).toBe('SENT');
    expect(firstToken).toBeTruthy();
    const firstHash = createHash('sha256').update(firstToken!).digest('hex');
    expect(firstEmail?.idempotencyKey).toBe(
      `partner-onboarding:${String(body.data.applicationId)}:${firstHash}`,
    );
    expect(
      (await prisma.partner.findUniqueOrThrow({ where: { id: partner.id } }))
        .status,
    ).toBe('ONBOARDING_INVITED');
    await http()
      .get(`/api/public/partners/onboarding/${firstToken}`)
      .expect(200);

    // Inside the cooldown: refused, nothing rotated.
    const early = await send(partner.id).expect(429);
    expect((early.body as { errorCode: string }).errorCode).toBe(
      'PARTNER_INVITATION_COOLDOWN',
    );
    await http()
      .get(`/api/public/partners/onboarding/${firstToken}`)
      .expect(200);

    // Past the cooldown: a resend is a new delivery with a new link.
    await prisma.partnerOnboardingApplication.update({
      where: { id: String(body.data.applicationId) },
      data: { updatedAt: new Date(Date.now() - 5 * 60_000) },
    });
    const resent = await send(partner.id).expect(201);
    expect((resent.body as { data: { resend: boolean } }).data.resend).toBe(
      true,
    );
    const secondEmail = await latestEmail(partner.id);
    const secondToken = tokenFrom(secondEmail?.htmlBody);
    expect(secondEmail?.status).toBe('SENT');
    expect(secondEmail?.id).not.toBe(firstEmail?.id);
    expect(secondToken).toBeTruthy();
    expect(secondToken).not.toBe(firstToken);

    const replaced = await http()
      .get(`/api/public/partners/onboarding/${firstToken}`)
      .expect(404);
    expect((replaced.body as { errorCode: string }).errorCode).toBe(
      'PARTNER_ONBOARDING_LINK_INVALID',
    );
    await http()
      .get(`/api/public/partners/onboarding/${secondToken}`)
      .expect(200);

    // An expired link is refused with its own code.
    await prisma.partnerOnboardingApplication.update({
      where: { id: String(body.data.applicationId) },
      data: { tokenExpiresAt: new Date(Date.now() - 60_000) },
    });
    const expired = await http()
      .get(`/api/public/partners/onboarding/${secondToken}`)
      .expect(410);
    expect((expired.body as { errorCode: string }).errorCode).toBe(
      'PARTNER_ONBOARDING_LINK_EXPIRED',
    );
  });

  it('refuses a live partner without demoting it', async () => {
    const partner = await createPartner('live', 'ACTIVE');
    const refused = await send(partner.id).expect(409);
    expect((refused.body as { errorCode: string }).errorCode).toBe(
      'PARTNER_ALREADY_ONBOARDED',
    );
    expect(
      (await prisma.partner.findUniqueOrThrow({ where: { id: partner.id } }))
        .status,
    ).toBe('ACTIVE');
    expect(await latestEmail(partner.id)).toBeNull();
  });

  it('reports an undelivered invitation as a domain error when platform email is disabled', async () => {
    const partner = await createPartner('nomail', 'AGREEMENT_EXECUTED');
    const previous = await prisma.platformSetting.findUnique({
      where: { key: PLATFORM_EMAIL_SETTINGS_KEY },
    });
    await prisma.platformSetting.upsert({
      where: { key: PLATFORM_EMAIL_SETTINGS_KEY },
      create: {
        key: PLATFORM_EMAIL_SETTINGS_KEY,
        value: { ...DEFAULT_PLATFORM_EMAIL_SETTINGS, enabled: false },
      },
      update: {
        value: { ...DEFAULT_PLATFORM_EMAIL_SETTINGS, enabled: false },
      },
    });
    try {
      const failed = await send(partner.id).expect(502);
      const failure = failed.body as { errorCode: string; message: string };
      expect(failure.errorCode).toBe('PARTNER_INVITATION_DELIVERY_FAILED');
      expect(failure.message).toContain('No platform email provider');
    } finally {
      if (previous)
        await prisma.platformSetting.update({
          where: { key: PLATFORM_EMAIL_SETTINGS_KEY },
          data: { value: previous.value as object },
        });
      else
        await prisma.platformSetting.delete({
          where: { key: PLATFORM_EMAIL_SETTINGS_KEY },
        });
    }

    // Not marked invited, no link left behind, and the dead email is not
    // scheduled for an automatic retry.
    const after = await prisma.partner.findUniqueOrThrow({
      where: { id: partner.id },
    });
    expect(after.status).toBe('AGREEMENT_EXECUTED');
    expect(
      await prisma.partnerOnboardingApplication.count({
        where: { partnerId: partner.id },
      }),
    ).toBe(0);
    const email = await latestEmail(partner.id);
    expect(email?.status).toBe('FAILED');
    expect(email?.nextRetryAt).toBeNull();
    expect(
      await prisma.partnerTimeline.count({
        where: {
          partnerId: partner.id,
          eventType: 'PARTNER_ONBOARDING_INVITATION_FAILED',
        },
      }),
    ).toBe(1);
  });
});
