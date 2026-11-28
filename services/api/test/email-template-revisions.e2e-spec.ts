import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EmailExecutionService } from '../src/modules/notifications/email/email-execution.service';
import { NotificationsRepository } from '../src/modules/notifications/notifications.repository';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * DP-MASTER WP-04.S2.
 *
 * EVIDENCE CLASS: database-backed integration with the REAL e-mail execution and
 * renderer (a dry run, so nothing leaves). The claim under test: a send that holds
 * a revision renders that revision's content however the template row changes, and
 * no tenant can render another tenant's revision.
 */
describeWithDatabase()('Immutable e-mail template revisions (e2e, DB)', () => {
  jest.setTimeout(300_000);

  const suffix = randomUUID().slice(0, 6);
  let moduleRef: TestingModule;
  let app: INestApplication;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let execution: EmailExecutionService;
  let repository: NotificationsRepository;
  let tenantId: string;
  let otherTenantId: string;
  let eventCode: string;
  let templateId: string;

  const render = (extra: Record<string, unknown> = {}, tenant = tenantId) =>
    execution.execute({
      tenantId: tenant,
      eventCode,
      templateId,
      recipient: 'revision@example.com',
      variables: { name: 'Sam' },
      dryRun: true,
      ...extra,
    } as never);

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    execution = app.get(EmailExecutionService);
    repository = app.get(NotificationsRepository);
    fixtures = new DbFixtures(prisma, 'tplrev');
    tenantId = (await fixtures.createTenant('tr1')).id;
    otherTenantId = (await fixtures.createTenant('tr2')).id;
    eventCode = (
      await prisma.notificationEvent.findFirstOrThrow({
        select: { code: true },
      })
    ).code;
    templateId = (
      await prisma.emailTemplate.create({
        data: {
          tenantId,
          scopeKey: `TENANT:${tenantId}`,
          eventCode,
          templateKey: `rev-${suffix}`,
          name: 'Revision test',
          subjectTemplate: 'Hello {{name}} v1',
          htmlTemplate: '<p>First wording for {{name}}</p>',
          availableVariables: ['name'],
          status: 'ACTIVE',
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      await prisma.emailDeliveryLog.deleteMany({
        where: { tenantId: { in: [tenantId, otherTenantId] } },
      });
      await prisma.emailTemplateRevision.deleteMany({ where: { templateId } });
      await prisma.emailTemplate.deleteMany({ where: { id: templateId } });
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  it('a revision renders the content it captured after the template row is edited', async () => {
    const first = await render({ pinTemplateRevision: true });
    expect(first.templateRevisionId).toBeTruthy();
    expect(first.rendered.renderedSubject).toBe('Hello Sam v1');

    await prisma.emailTemplate.update({
      where: { id: templateId },
      data: {
        subjectTemplate: 'Changed {{name}} v2',
        htmlTemplate: '<p>Second wording for {{name}}</p>',
        version: { increment: 1 },
      },
    });

    // A retry holding the revision still renders the first wording.
    const retry = await render({
      templateRevisionId: first.templateRevisionId,
    });
    expect(retry.rendered.renderedSubject).toBe('Hello Sam v1');
    expect(retry.rendered.renderedHtml).toContain('First wording for Sam');
    expect(retry.templateRevisionId).toBe(first.templateRevisionId);

    // A send with no revision follows the row, as it always did.
    const fresh = await render();
    expect(fresh.rendered.renderedSubject).toBe('Changed Sam v2');
  });

  it('identical content is one revision; changed content is a new one; revisions are never rewritten', async () => {
    const row = await prisma.emailTemplate.findUniqueOrThrow({
      where: { id: templateId },
    });
    const a = await repository.ensureTemplateRevision(row);
    const b = await repository.ensureTemplateRevision(row);
    expect(b.id).toBe(a.id);

    const revisions = await prisma.emailTemplateRevision.findMany({
      where: { templateId },
      orderBy: { version: 'asc' },
    });
    expect(revisions.map((r) => r.version)).toEqual([1, 2]);
    expect(revisions[0].subjectTemplate).toBe('Hello {{name}} v1');
    expect(revisions[1].subjectTemplate).toBe('Changed {{name}} v2');
  });

  it("another tenant cannot render this tenant's revision, and a revision cannot be applied to a different template", async () => {
    const revision = await prisma.emailTemplateRevision.findFirstOrThrow({
      where: { templateId },
    });
    await expect(
      render({ templateRevisionId: revision.id }, otherTenantId),
    ).rejects.toThrow();

    const otherTemplate = await prisma.emailTemplate.create({
      data: {
        tenantId,
        scopeKey: `TENANT:${tenantId}`,
        eventCode,
        templateKey: `rev-other-${suffix}`,
        name: 'Other',
        subjectTemplate: 'Other',
        htmlTemplate: '<p>Other</p>',
        availableVariables: [],
        status: 'ARCHIVED',
      },
      select: { id: true },
    });
    try {
      await expect(
        execution.execute({
          tenantId,
          eventCode,
          templateId: otherTemplate.id,
          templateRevisionId: revision.id,
          recipient: 'revision@example.com',
          variables: {},
          dryRun: true,
        } as never),
      ).rejects.toThrow('revision was not found');
    } finally {
      await prisma.emailTemplate.delete({ where: { id: otherTemplate.id } });
    }
  });
});
