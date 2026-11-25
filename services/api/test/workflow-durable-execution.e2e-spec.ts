import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email/email.service';
import { OutboxDispatcherService } from '../src/modules/outbox/outbox-dispatcher.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import { WorkflowActionHandler } from '../src/modules/workflows/workflow-action.handler';
import { WorkflowDispatchService } from '../src/modules/workflows/workflow-dispatch.service';
import { WorkflowRuntimeService } from '../src/modules/workflows/workflow-runtime.service';
import { WorkflowsService } from '../src/modules/workflows/workflows.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors } from './helpers/http-actors';

/**
 * DP-MASTER WP-03.S3 (A02, A07).
 *
 * EVIDENCE CLASS: database-backed integration. Real PostgreSQL, the real outbox
 * dispatcher (claim, retry scheduling, attempt counting), the real runtime and
 * step ledger. Only the e-mail transport is replaced, so the test can make a send
 * fail and count what actually left.
 */
describeWithDatabase()(
  'Durable workflow execution on the outbox (e2e, DB)',
  () => {
    jest.setTimeout(600_000);

    const sent: string[] = [];
    const failing = new Map<string, number>(); // address -> failures left (-1 = forever)
    const emailStub = {
      sendTemplateEmail: jest.fn(async (input: { recipient: string }) => {
        const left = failing.get(input.recipient) ?? 0;
        if (left !== 0) {
          if (left > 0) failing.set(input.recipient, left - 1);
          throw new Error(`smtp down for ${input.recipient}`);
        }
        sent.push(input.recipient);
      }),
    };

    let moduleRef: TestingModule;
    let app: INestApplication;
    let prisma: PrismaService;
    let fixtures: DbFixtures;
    let actors: HttpActors;
    let workflows: WorkflowsService;
    let runtime: WorkflowRuntimeService;
    let dispatch: WorkflowDispatchService;
    let outbox: OutboxService;
    let outboxDispatcher: OutboxDispatcherService;
    let tenantId: string;
    let userId: string;
    let eventCode: string;
    const suffix = randomUUID().slice(0, 6);
    const asUser = () => ({ tenantId, userId }) as never;
    const fixed = (recipientAddress: string) => ({
      recipientMode: 'FIXED',
      recipientAddress,
      templateKey: 'x',
    });

    /** A dispatcher that knows ONLY the workflow handler, as outbox-delivery.e2e does. */
    const privateDispatcher = () => {
      const handler = new WorkflowActionHandler(runtime, {
        register: () => undefined,
      } as never);
      return new OutboxDispatcherService(prisma, [handler]);
    };

    const outboxEventFor = () =>
      prisma.outboxEvent.findFirstOrThrow({
        where: { tenantId, eventType: 'WORKFLOW_EVENT_RECEIVED' },
        orderBy: { createdAt: 'desc' },
      });

    const makeDue = (id: string) =>
      prisma.outboxEvent.update({
        where: { id },
        data: { availableAt: new Date(Date.now() - 1000) },
      });

    const startWorkflow = async (name: string, addresses: string[]) => {
      const created = await workflows.create(asUser(), {
        name,
        eventCode,
        status: 'ACTIVE',
        conditions: [],
        actions: addresses.map(fixed),
      } as never);
      return created.id;
    };

    beforeAll(async () => {
      moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(EmailService)
        .useValue(emailStub)
        .compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await app.init();
      prisma = app.get(PrismaService);
      workflows = app.get(WorkflowsService);
      runtime = app.get(WorkflowRuntimeService);
      dispatch = app.get(WorkflowDispatchService);
      outbox = app.get(OutboxService);
      outboxDispatcher = privateDispatcher();
      fixtures = new DbFixtures(prisma, 'wfdur');
      actors = new HttpActors(app, suffix);
      const tenant = await fixtures.createTenant('wfd');
      tenantId = tenant.id;
      const org = await fixtures.createOrganization(tenantId);
      const unit = await fixtures.createBusinessUnit(tenantId, org);
      userId = (await actors.tenantUser(tenantId, unit, 'wfd-author')).id;
      eventCode = (
        await prisma.notificationEvent.findFirstOrThrow({
          select: { code: true },
        })
      ).code;
    });

    beforeEach(() => {
      sent.length = 0;
      failing.clear();
      process.env.WORKFLOW_EXECUTION_MODE = 'durable';
    });

    afterEach(async () => {
      delete process.env.WORKFLOW_EXECUTION_MODE;
      jest.restoreAllMocks();
      await prisma.workflow.updateMany({
        where: { tenantId },
        data: { status: 'INACTIVE' },
      });
    });

    afterAll(async () => {
      try {
        await prisma.outboxEvent.deleteMany({ where: { tenantId } });
        await prisma.workflow.deleteMany({ where: { tenantId } });
        await actors.cleanup();
        await fixtures.cleanup();
      } finally {
        await app.close();
      }
    });

    it('a failed send is retried by the outbox and then succeeds, sending exactly once', async () => {
      const workflowId = await startWorkflow('Retry me', ['retry@example.com']);
      failing.set('retry@example.com', 1);

      await dispatch.dispatch({ tenantId, eventCode, variables: {} });
      const event = await outboxEventFor();
      expect(event.status).toBe('PENDING');

      await privateDispatcher().drain(50);
      const afterFirst = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(afterFirst.status).toBe('RETRY_SCHEDULED');
      const runWaiting = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId, eventId: event.id },
        include: { steps: true },
      });
      expect(runWaiting.status).toBe('RUNNING');
      expect(runWaiting.finishedAt).toBeNull();
      expect(runWaiting.steps).toHaveLength(1);
      expect(runWaiting.steps[0]).toMatchObject({
        status: 'FAILED',
        permanent: false,
        attempts: 1,
        recipientMode: 'FIXED',
      });
      expect(sent).toEqual([]);

      await makeDue(event.id);
      await privateDispatcher().drain(50);
      const settled = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(settled.status).toBe('PROCESSED');
      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId, eventId: event.id },
        include: { steps: true },
      });
      expect(run).toMatchObject({ status: 'SUCCEEDED', actionsRun: 1 });
      expect(run.steps[0]).toMatchObject({
        status: 'SUCCEEDED',
        attempts: 2,
        lastError: null,
      });
      // The step key names the event, the PINNED version and the action.
      expect(run.steps[0].stepKey).toBe(
        `${event.id}:${run.workflowVersionId}:0`,
      );
      expect(sent).toEqual(['retry@example.com']);
    });

    it('a redelivered event repeats nothing that already succeeded', async () => {
      await startWorkflow('Once only', ['once@example.com']);
      await dispatch.dispatch({ tenantId, eventCode, variables: {} });
      const event = await outboxEventFor();
      await privateDispatcher().drain(50);
      expect(sent).toEqual(['once@example.com']);

      // What an at-least-once mechanism does after a crash between work and settle.
      await prisma.outboxEventConsumption.deleteMany({
        where: { outboxEventId: event.id },
      });
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PENDING', availableAt: new Date(Date.now() - 1000) },
      });
      await privateDispatcher().drain(50);

      expect(sent).toEqual(['once@example.com']);
      expect(
        await prisma.workflowRun.count({ where: { eventId: event.id } }),
      ).toBe(1);
      expect(
        await prisma.workflowRunStep.count({
          where: { stepKey: { startsWith: `${event.id}:` } },
        }),
      ).toBe(1);
    });

    it('when attempts run out the run is PARTIALLY_FAILED: the good recipient got the mail, the bad one is recorded', async () => {
      const workflowId = await startWorkflow('Two recipients', [
        'good@example.com',
        'bad@example.com',
      ]);
      failing.set('bad@example.com', -1);

      await dispatch.dispatch({ tenantId, eventCode, variables: {} });
      const event = await outboxEventFor();
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { maxAttempts: 1 },
      });
      await privateDispatcher().drain(50);

      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId, eventId: event.id },
        include: { steps: { orderBy: { actionIndex: 'asc' } } },
      });
      expect(run.status).toBe('PARTIALLY_FAILED');
      expect(run.actionsRun).toBe(1);
      expect(run.error).toContain('smtp down for bad@example.com');
      expect(run.steps.map((s) => s.status)).toEqual(['SUCCEEDED', 'FAILED']);
      expect(sent).toEqual(['good@example.com']);
    });

    it('a retry re-runs only the failed step: the recipient who already got the mail is not mailed again', async () => {
      const workflowId = await startWorkflow('Retry one of two', [
        'first@example.com',
        'flaky@example.com',
      ]);
      failing.set('flaky@example.com', 1);

      await dispatch.dispatch({ tenantId, eventCode, variables: {} });
      const event = await outboxEventFor();
      await privateDispatcher().drain(50);
      expect(sent).toEqual(['first@example.com']);

      await makeDue(event.id);
      await privateDispatcher().drain(50);

      expect(sent).toEqual(['first@example.com', 'flaky@example.com']);
      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId, eventId: event.id },
        include: { steps: { orderBy: { actionIndex: 'asc' } } },
      });
      expect(run.status).toBe('SUCCEEDED');
      expect(run.steps.map((s) => [s.status, s.attempts])).toEqual([
        ['SUCCEEDED', 1],
        ['SUCCEEDED', 2],
      ]);
    });

    it('an unresolvable recipient is a permanent failure: recorded once, never retried', async () => {
      const created = await workflows.create(asUser(), {
        name: 'Nobody to tell',
        eventCode,
        status: 'ACTIVE',
        conditions: [],
        actions: [{ recipientMode: 'SUBJECT', templateKey: 'x' }],
      } as never);

      await dispatch.dispatch({ tenantId, eventCode, variables: {} });
      const event = await outboxEventFor();
      await privateDispatcher().drain(50);

      const settled = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: event.id },
      });
      expect(settled.status).toBe('PROCESSED');
      expect(settled.attemptCount).toBe(1);
      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId: created.id, eventId: event.id },
        include: { steps: true },
      });
      expect(run.status).toBe('FAILED');
      expect(run.steps[0]).toMatchObject({ status: 'FAILED', permanent: true });
      expect(sent).toEqual([]);
    });

    it('inline mode (the default) runs now through the same ledger and writes no outbox event', async () => {
      delete process.env.WORKFLOW_EXECUTION_MODE;
      const workflowId = await startWorkflow('Inline', ['inline@example.com']);
      const before = await prisma.outboxEvent.count({ where: { tenantId } });

      const result = await dispatch.dispatch({
        tenantId,
        eventCode,
        variables: {},
      });

      expect(result.mode).toBe('inline');
      expect(sent).toEqual(['inline@example.com']);
      expect(await prisma.outboxEvent.count({ where: { tenantId } })).toBe(
        before,
      );
      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId },
        include: { steps: true },
      });
      expect(run.status).toBe('SUCCEEDED');
      expect(run.eventId).toBeTruthy();
      expect(run.steps).toHaveLength(1);
    });

    it('if the outbox write fails, the event runs inline instead of being lost', async () => {
      await startWorkflow('Fallback', ['fallback@example.com']);
      jest
        .spyOn(outbox, 'emitStandalone')
        .mockRejectedValue(new Error('outbox unavailable'));

      const result = await dispatch.dispatch({
        tenantId,
        eventCode,
        variables: {},
      });

      expect(result.mode).toBe('inline');
      expect(sent).toEqual(['fallback@example.com']);
    });

    it('a malformed outbox payload needs manual action instead of retrying forever', async () => {
      const injected = await outbox.emitStandalone({
        eventType: 'WORKFLOW_EVENT_RECEIVED',
        idempotencyKey: `wfdur-bad-${suffix}-${randomUUID()}`,
        aggregateType: 'event',
        aggregateId: 'bad',
        tenantId,
        payload: { nonsense: true },
      });
      await privateDispatcher().drain(50);
      const settled = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: injected.id },
      });
      expect(settled.status).toBe('MANUAL_ACTION_REQUIRED');
      expect(outboxDispatcher).toBeDefined();
    });
  },
);
