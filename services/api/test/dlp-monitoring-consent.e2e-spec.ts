/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call -- supertest response bodies are untyped JSON; assertions read them directly. */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AgentService } from '../src/modules/agent/agent.service';
import {
  DLP_MONITORING_POLICY_SLUG,
  hasCurrentMonitoringConsent,
} from '../src/modules/agent/dlp/dlp-consent';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors } from './helpers/http-actors';

/**
 * DP-MASTER WP-17 against a real database: consent is for the CURRENT policy
 * version, publishing a new version withdraws it, no policy means no consent, and
 * the config handed to the agent says capture is OFF until the employee has
 * acknowledged.
 */
describeWithDatabase()('DLP monitoring consent (e2e, DB)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let agent: AgentService;
  let tenantId: string;
  let userId: string;
  let documentId: string;
  const versionIds: string[] = [];
  const suffix = randomUUID().slice(0, 6);
  const past = new Date(Date.now() - 86_400_000);

  const publish = async (version: number) => {
    // A new version supersedes the old one: close the old window, open the new.
    await prisma.legalDocumentVersion.updateMany({
      where: { legalDocumentId: documentId, effectiveTo: null },
      data: { effectiveTo: new Date(Date.now() - 1_000) },
    });
    const created = await prisma.legalDocumentVersion.create({
      data: {
        legalDocumentId: documentId,
        version,
        status: 'PUBLISHED',
        contentMarkdown: `policy v${version}`,
        effectiveFrom: past,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    versionIds.push(created.id);
    return created.id;
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    agent = app.get(AgentService);
    fixtures = new DbFixtures(prisma, 'dlpconsent');
    actors = new HttpActors(app, suffix);
    const tenant = await fixtures.createTenant('dlpc');
    tenantId = tenant.id;
    const org = await fixtures.createOrganization(tenantId);
    const unit = await fixtures.createBusinessUnit(tenantId, org);
    userId = (await actors.tenantUser(tenantId, unit, 'dlp-user')).id;
    await prisma.agentTrackingSettings.create({
      data: {
        tenantId,
        allowClipboardCapture: true,
        allowScreenshotCapture: true,
        dlpConsentRequired: true,
      },
    });
    await prisma.dlpRule.create({
      data: {
        tenantId,
        name: 'consent-rule',
        enabled: true,
        sourceAppPatterns: ['excel'],
        channelAppPatterns: ['whatsapp'],
      },
    });
    const existing = await prisma.legalDocument.findUnique({
      where: { slug: DLP_MONITORING_POLICY_SLUG },
    });
    expect(existing).toBeNull(); // the test owns this document; refuse to touch a real one
    documentId = (
      await prisma.legalDocument.create({
        data: {
          type: 'SECURITY_NOTICE',
          slug: DLP_MONITORING_POLICY_SLUG,
          title: 'Monitoring policy (test)',
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      await prisma.legalDocumentAcknowledgement.deleteMany({
        where: { legalDocumentVersionId: { in: versionIds } },
      });
      await prisma.legalDocumentVersion.deleteMany({
        where: { legalDocumentId: documentId },
      });
      await prisma.legalDocument.deleteMany({ where: { id: documentId } });
      await prisma.dlpRule.deleteMany({ where: { tenantId } });
      await prisma.agentTrackingSettings.deleteMany({ where: { tenantId } });
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  const config = () =>
    agent.getConfig(tenantId, userId) as Promise<Record<string, any>>;
  const user = () => ({ tenantId, userId }) as never;

  it('with no policy published nobody has consented, and the agent is told capture is off', async () => {
    expect(await hasCurrentMonitoringConsent(prisma, tenantId, userId)).toBe(
      false,
    );
    const c = await config();
    expect(c.privacy).toMatchObject({
      allowClipboardTracking: false,
      allowScreenshots: false,
    });
    expect(c.dlpConsent).toEqual({ required: true, granted: false });
  });

  it('a published policy alone is not consent: capture stays off and no rules are shipped', async () => {
    await publish(1);
    expect(await hasCurrentMonitoringConsent(prisma, tenantId, userId)).toBe(
      false,
    );
    const c = await config();
    expect(c.privacy.allowClipboardTracking).toBe(false);
    expect(JSON.stringify(c)).not.toContain('consent-rule');
  });

  it('acknowledging the current version turns capture on for that employee only', async () => {
    const policy = await agent.getMonitoringPolicy(user());
    expect(policy).toMatchObject({
      available: true,
      version: 1,
      acknowledged: false,
    });
    await agent.acknowledgeMonitoringPolicy(user(), {
      versionId: (policy as { versionId: string }).versionId,
    });
    expect(await hasCurrentMonitoringConsent(prisma, tenantId, userId)).toBe(
      true,
    );
    const c = await config();
    expect(c.privacy).toMatchObject({
      allowClipboardTracking: true,
      allowScreenshots: true,
    });
    expect(JSON.stringify(c)).toContain('consent-rule');

    // A colleague in the same tenant has not consented.
    expect(
      await hasCurrentMonitoringConsent(prisma, tenantId, randomUUID()),
    ).toBe(false);
  });

  it('publishing a new version withdraws consent until it is acknowledged again', async () => {
    await publish(2);
    expect(await hasCurrentMonitoringConsent(prisma, tenantId, userId)).toBe(
      false,
    );
    expect((await config()).privacy.allowClipboardTracking).toBe(false);
  });

  it('refuses to record an acknowledgement of a superseded version', async () => {
    await expect(
      agent.acknowledgeMonitoringPolicy(user(), { versionId: versionIds[0] }),
    ).rejects.toMatchObject({
      response: { code: 'MONITORING_POLICY_NOT_CURRENT' },
    });
    expect(
      await prisma.legalDocumentAcknowledgement.count({
        where: { tenantId, userId, legalDocumentVersionId: versionIds[0] },
      }),
    ).toBe(1); // only the earlier, valid acknowledgement
  });
});
