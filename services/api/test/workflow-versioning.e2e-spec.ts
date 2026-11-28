import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { WorkflowRuntimeService } from '../src/modules/workflows/workflow-runtime.service';
import { WorkflowsService } from '../src/modules/workflows/workflows.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors } from './helpers/http-actors';

/**
 * DP-MASTER WP-03.S2 and the pinned-execution rule, against a real database:
 * the key never changes, a version is minted only when behaviour changes, and a
 * run executes and records the PUBLISHED snapshot even if the live rows are
 * edited underneath it.
 */
describeWithDatabase()(
  'Workflow keys, versions and pinned runs (e2e, DB)',
  () => {
    jest.setTimeout(600_000);

    let moduleRef: TestingModule;
    let app: INestApplication;
    let prisma: PrismaService;
    let fixtures: DbFixtures;
    let actors: HttpActors;
    let workflows: WorkflowsService;
    let runtime: WorkflowRuntimeService;
    let tenantId: string;
    let userId: string;
    let eventCode: string;
    const suffix = randomUUID().slice(0, 6);

    const asUser = () => ({ tenantId, userId }) as never;
    const action = (recipientAddress: string) => ({
      recipientMode: 'FIXED',
      recipientAddress,
      templateKey: 'x',
    });

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
      workflows = app.get(WorkflowsService);
      runtime = app.get(WorkflowRuntimeService);
      fixtures = new DbFixtures(prisma, 'wfver');
      actors = new HttpActors(app, suffix);
      const tenant = await fixtures.createTenant('wfv');
      tenantId = tenant.id;
      const org = await fixtures.createOrganization(tenantId);
      const unit = await fixtures.createBusinessUnit(tenantId, org);
      userId = (await actors.tenantUser(tenantId, unit, 'wf-author')).id;
      const event = await prisma.notificationEvent.findFirstOrThrow({
        select: { code: true },
      });
      eventCode = event.code;
    });

    afterAll(async () => {
      try {
        await prisma.workflow.deleteMany({ where: { tenantId } });
        await actors.cleanup();
        await fixtures.cleanup();
      } finally {
        await app.close();
      }
    });

    it('assigns a stable key, publishes version 1, and mints a new version only when behaviour changes', async () => {
      const created = await workflows.create(asUser(), {
        name: 'Notify Finance!',
        eventCode,
        status: 'ACTIVE',
        conditions: [],
        actions: [
          {
            recipientMode: 'FIXED',
            recipientAddress: 'a@example.com',
            templateKey: 'x',
          },
        ],
      } as never);
      expect(created.workflowKey).toBe('notify-finance');
      const versions = () =>
        prisma.workflowVersion.findMany({
          where: { workflowId: created.id },
          orderBy: { version: 'asc' },
        });
      expect(await versions()).toHaveLength(1);

      // A cosmetic save changes nothing about behaviour: no new version.
      await workflows.update(asUser(), created.id, {
        description: 'now with words',
      } as never);
      expect(await versions()).toHaveLength(1);

      // A rename never touches the key, and does not mint a version either.
      const renamed = await workflows.update(asUser(), created.id, {
        name: 'Brand new name',
      } as never);
      expect(renamed.workflowKey).toBe('notify-finance');
      expect(await versions()).toHaveLength(1);

      // A behaviour change publishes version 2 and leaves version 1 untouched.
      await workflows.update(asUser(), created.id, {
        conditions: [
          { field: 'totalDays', operator: 'greaterThan', value: '3' },
        ],
      } as never);
      const all = await versions();
      expect(all.map((v) => v.version)).toEqual([1, 2]);
      expect(all[0].definition).toMatchObject({ conditions: [] });
    });

    it('duplicate-looking names in one tenant get suffixed keys', async () => {
      const a = await workflows.create(asUser(), {
        name: 'Dup Name',
        eventCode,
        status: 'DRAFT',
        actions: [action('d@example.com')],
      } as never);
      const b = await workflows.create(asUser(), {
        name: 'Dup  Name!!',
        eventCode,
        status: 'DRAFT',
        actions: [action('d@example.com')],
      } as never);
      expect([a.workflowKey, b.workflowKey]).toEqual([
        'dup-name',
        'dup-name-2',
      ]);
    });

    it('rejects ill-typed conditions with nothing written', async () => {
      const before = await prisma.workflow.count({ where: { tenantId } });
      await expect(
        workflows.create(asUser(), {
          name: 'Bad conditions',
          eventCode,
          status: 'ACTIVE',
          conditions: [
            { field: 'a.constructor', operator: 'equals', value: 'x' },
          ],
          actions: [],
        } as never),
      ).rejects.toMatchObject({
        response: { code: 'WORKFLOW_CONDITIONS_INVALID' },
      });
      expect(await prisma.workflow.count({ where: { tenantId } })).toBe(before);
    });

    it('runs the PUBLISHED snapshot and records its version, even when the live rows are edited underneath', async () => {
      const created = await workflows.create(asUser(), {
        name: 'Pinned run',
        eventCode,
        status: 'ACTIVE',
        conditions: [{ field: 'channel', operator: 'equals', value: 'pinned' }],
        actions: [action('pinned@example.com')],
      } as never);

      // Edit the live row WITHOUT publishing (what a stray write would do): the
      // condition now would never match and the action points elsewhere.
      await prisma.workflow.update({
        where: { id: created.id },
        data: {
          conditions: [
            { field: 'channel', operator: 'equals', value: 'LIVE-EDIT' },
          ],
        },
      });
      await prisma.workflowAction.updateMany({
        where: { workflowId: created.id },
        data: { configuration: action('live-edit@example.com') },
      });

      await runtime.handleEvent({
        tenantId,
        eventCode,
        variables: { channel: 'pinned' },
      });

      const version = await prisma.workflowVersion.findFirstOrThrow({
        where: { workflowId: created.id },
      });
      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId: created.id },
        orderBy: { startedAt: 'desc' },
      });
      // The pinned condition matched (it was not skipped by the live edit), and the
      // run names the version that executed.
      expect(run.workflowVersionId).toBe(version.id);
      expect(run.error ?? '').not.toContain('Conditions were not met');
    });

    it('refuses to run an ACTIVE workflow that has no published version', async () => {
      const created = await workflows.create(asUser(), {
        name: 'Never published',
        eventCode,
        status: 'ACTIVE',
        actions: [action('x@example.com')],
      } as never);
      await prisma.workflowVersion.deleteMany({
        where: { workflowId: created.id },
      });
      await runtime.handleEvent({ tenantId, eventCode, variables: {} });
      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId: created.id },
        orderBy: { startedAt: 'desc' },
      });
      expect(run.status).toBe('FAILED');
      expect(run.error).toContain('No published version');
    });
  },
);
