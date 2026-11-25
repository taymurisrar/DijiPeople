import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EmailService } from '../src/modules/notifications/email/email.service';
import { OutboxDispatcherService } from '../src/modules/outbox/outbox-dispatcher.service';
import { OutboxService } from '../src/modules/outbox/outbox.service';
import { WorkflowActionHandler } from '../src/modules/workflows/workflow-action.handler';
import { WorkflowDeliveryReconciler } from '../src/modules/workflows/workflow-delivery-reconciler';
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
    // What the e-mail service reports back (it reports, it does not throw, for a
    // skip, a sink and a refused send): address -> kind, default is delivered.
    const verdicts = new Map<string, 'sink' | 'skipped' | 'refused'>();
    // Holds a send open so a second delivery can race it.
    let gate: Promise<void> | null = null;
    // address -> an EmailDeliveryLog id the stub reports back, so steps can pin
    // the template and be reconciled against the log later.
    const logs = new Map<string, string>();
    const result = (over: Record<string, unknown>) => ({
      sent: true,
      delivered: true,
      dryRun: false,
      skipped: false,
      status: 'SENT',
      ...over,
    });
    const emailStub = {
      sendTemplateEmail: jest.fn(async (input: { recipient: string }) => {
        const left = failing.get(input.recipient) ?? 0;
        if (left !== 0) {
          if (left > 0) failing.set(input.recipient, left - 1);
          throw new Error(`smtp down for ${input.recipient}`);
        }
        if (gate) await gate;
        const verdict = verdicts.get(input.recipient);
        if (verdict === 'sink') return result({ delivered: false });
        if (verdict === 'skipped') {
          return result({ sent: false, delivered: false, skipped: true });
        }
        if (verdict === 'refused') {
          return result({
            sent: false,
            delivered: false,
            status: 'FAILED',
          });
        }
        sent.push(input.recipient);
        return result({ deliveryLogId: logs.get(input.recipient) });
      }),
    };

    let transition = 0;
    /** One business transition; pass the same id to emit it twice. */
    const emit = (id?: string) =>
      dispatch.dispatch({
        tenantId,
        eventCode,
        variables: {},
        transitionId: id ?? `t-${suffix}-${++transition}`,
      });

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
      verdicts.clear();
      logs.clear();
      gate = null;
      process.env.WORKFLOW_EXECUTION_MODE = 'durable';
    });

    afterEach(async () => {
      delete process.env.WORKFLOW_EXECUTION_MODE;
      jest.restoreAllMocks();
      // An event a test queued and never drained must not be delivered to the
      // next test's workflow.
      await prisma.outboxEvent.deleteMany({ where: { tenantId } });
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

      await emit();
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
      await emit();
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

      await emit();
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

      await emit();
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

      await emit();
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

    it('if the outbox write fails the event is NOT silently run inline: the outcome says it was not queued, and a retry with the same transition id is safe', async () => {
      await startWorkflow('No fallback', ['nofallback@example.com']);
      const failure = jest
        .spyOn(outbox, 'emitStandalone')
        .mockRejectedValueOnce(new Error('outbox unavailable'));

      const first = await emit('stable-1');
      expect(first).toMatchObject({
        mode: 'durable',
        status: 'ENQUEUE_FAILED',
        error: 'outbox unavailable',
      });
      expect(sent).toEqual([]);
      expect(failure).toHaveBeenCalledTimes(1);

      const retry = await emit('stable-1');
      expect(retry).toMatchObject({ mode: 'durable', status: 'QUEUED' });
      await privateDispatcher().drain(50);
      expect(sent).toEqual(['nofallback@example.com']);
    });

    it('the same transition emitted twice is ONE outbox event and one send', async () => {
      await startWorkflow('Dedup', ['dedup@example.com']);
      const first = await emit('decision-42');
      const second = await emit('decision-42');
      expect(first).toMatchObject({ status: 'QUEUED', deduplicated: false });
      expect(second).toMatchObject({ status: 'QUEUED', deduplicated: true });
      if (first.status !== 'QUEUED' || second.status !== 'QUEUED') return;
      expect(second.outboxEventId).toBe(first.outboxEventId);

      await privateDispatcher().drain(50);
      expect(sent).toEqual(['dedup@example.com']);

      // A different transition about the same record is a different event.
      const third = await emit('decision-43');
      expect(third).toMatchObject({ deduplicated: false });
    });

    it('a caller with no stable transition id is run inline and told so, never given an invented identity', async () => {
      await startWorkflow('No identity', ['noid@example.com']);
      const outcome = await dispatch.dispatch({
        tenantId,
        eventCode,
        variables: {},
      });
      expect(outcome).toMatchObject({
        mode: 'inline',
        status: 'EXECUTED',
        reason: 'NO_TRANSITION_ID',
      });
      expect(sent).toEqual(['noid@example.com']);
    });

    it('enqueue joins the caller transaction: a rollback leaves no event, a commit leaves exactly one', async () => {
      await startWorkflow('Transactional', ['tx@example.com']);
      const before = await prisma.outboxEvent.count({ where: { tenantId } });

      await expect(
        prisma.$transaction(async (tx) => {
          await dispatch.enqueue(tx, {
            tenantId,
            eventCode,
            variables: {},
            transitionId: 'tx-rollback',
          });
          throw new Error('the business change failed');
        }),
      ).rejects.toThrow('the business change failed');
      expect(await prisma.outboxEvent.count({ where: { tenantId } })).toBe(
        before,
      );

      await prisma.$transaction((tx) =>
        dispatch.enqueue(tx, {
          tenantId,
          eventCode,
          variables: {},
          transitionId: 'tx-commit',
        }),
      );
      // Re-announcing the committed transition (a retried request) is a no-op.
      await prisma.$transaction((tx) =>
        dispatch.enqueue(tx, {
          tenantId,
          eventCode,
          variables: {},
          transitionId: 'tx-commit',
        }),
      );
      expect(await prisma.outboxEvent.count({ where: { tenantId } })).toBe(
        before + 1,
      );
      await privateDispatcher().drain(50);
      expect(sent).toEqual(['tx@example.com']);
    });

    it('transactional enqueue refuses to pretend when durable delivery is unavailable', async () => {
      delete process.env.WORKFLOW_EXECUTION_MODE;
      await expect(
        prisma.$transaction((tx) =>
          dispatch.enqueue(tx, {
            tenantId,
            eventCode,
            variables: {},
            transitionId: 'x',
          }),
        ),
      ).rejects.toThrow('WORKFLOW_EXECUTION_MODE=durable');
    });

    it('a retry runs the version it STARTED with, even after a newer one is published', async () => {
      const created = await workflows.create(asUser(), {
        name: 'Edited mid-flight',
        eventCode,
        status: 'ACTIVE',
        conditions: [],
        actions: [fixed('v1@example.com')],
      } as never);
      failing.set('v1@example.com', 1);
      await emit();
      const event = await outboxEventFor();
      await privateDispatcher().drain(50);
      expect(sent).toEqual([]);

      // The author republishes with a different recipient between attempts.
      await workflows.update(asUser(), created.id, {
        actions: [fixed('v2@example.com')],
      } as never);
      expect(
        await prisma.workflowVersion.count({
          where: { workflowId: created.id },
        }),
      ).toBe(2);

      await makeDue(event.id);
      await privateDispatcher().drain(50);

      expect(sent).toEqual(['v1@example.com']);
      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId: created.id, eventId: event.id },
        include: { steps: true },
      });
      expect(run.status).toBe('SUCCEEDED');
      expect(run.steps).toHaveLength(1);
    });

    it('a workflow paused after its event was queued still finishes the run it started', async () => {
      const workflowId = await startWorkflow('Paused mid-flight', [
        'paused@example.com',
      ]);
      failing.set('paused@example.com', 1);
      await emit();
      const event = await outboxEventFor();
      await privateDispatcher().drain(50);

      await prisma.workflow.update({
        where: { id: workflowId },
        data: { status: 'INACTIVE' },
      });
      await makeDue(event.id);
      await privateDispatcher().drain(50);

      expect(sent).toEqual(['paused@example.com']);
    });

    it('two deliveries of one event racing each other send once: the loser reports the step busy', async () => {
      await startWorkflow('Race', ['race@example.com']);
      let release: () => void = () => undefined;
      gate = new Promise<void>((resolve) => {
        release = resolve;
        // A safety valve so a broken claim fails the assertions below instead of hanging.
        setTimeout(resolve, 3000);
      });
      const context = { tenantId, eventCode, variables: {} };
      const eventId = `race-${suffix}`;

      const first = runtime.execute(context, { eventId, finalAttempt: false });
      await new Promise((resolve) => setTimeout(resolve, 300));
      let second: Awaited<ReturnType<typeof runtime.execute>>;
      try {
        second = await runtime.execute(context, {
          eventId,
          finalAttempt: false,
        });
      } finally {
        // Never leave the first delivery parked: a regression must fail, not hang.
        release();
      }
      expect(second.retryable).toBe(1);

      const firstResult = await first;
      expect(firstResult.retryable).toBe(0);
      expect(sent).toEqual(['race@example.com']);

      // Once the first finished, a late delivery repeats nothing.
      const third = await runtime.execute(context, {
        eventId,
        finalAttempt: false,
      });
      expect(third).toMatchObject({ retryable: 0 });
      expect(sent).toEqual(['race@example.com']);
    });

    it('restart recovery: a step left IN_PROGRESS by a crashed worker is taken over once its claim expires, and not before', async () => {
      const workflowId = await startWorkflow('Crash recovery', [
        'crash@example.com',
      ]);
      const context = { tenantId, eventCode, variables: {} };
      const eventId = `crash-${suffix}`;
      failing.set('crash@example.com', 1);
      await runtime.execute(context, { eventId, finalAttempt: false });
      const step = await prisma.workflowRunStep.findFirstOrThrow({
        where: { stepKey: { startsWith: `${eventId}:` } },
      });
      // The crash: claimed, never settled.
      await prisma.workflowRunStep.update({
        where: { id: step.id },
        data: {
          status: 'IN_PROGRESS',
          finishedAt: null,
          startedAt: new Date(),
        },
      });

      const fresh = await runtime.execute(context, {
        eventId,
        finalAttempt: false,
      });
      expect(fresh.retryable).toBe(1);
      expect(sent).toEqual([]);

      await prisma.workflowRunStep.update({
        where: { id: step.id },
        data: { startedAt: new Date(Date.now() - 10 * 60 * 1000) },
      });
      const recovered = await runtime.execute(context, {
        eventId,
        finalAttempt: false,
      });
      expect(recovered.retryable).toBe(0);
      expect(sent).toEqual(['crash@example.com']);
      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId, eventId },
      });
      expect(run.status).toBe('SUCCEEDED');
    });

    it('records what actually happened: a sink is SKIPPED, a refused send is retried, nothing is called delivered that was not', async () => {
      const workflowId = await startWorkflow('Truthful', [
        'sink@example.com',
        'refused@example.com',
        'optout@example.com',
      ]);
      verdicts.set('sink@example.com', 'sink');
      verdicts.set('refused@example.com', 'refused');
      verdicts.set('optout@example.com', 'skipped');

      await emit();
      const event = await outboxEventFor();
      await privateDispatcher().drain(50);

      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId, eventId: event.id },
        include: { steps: { orderBy: { actionIndex: 'asc' } } },
      });
      expect(run.steps.map((step) => step.status)).toEqual([
        'SKIPPED',
        'FAILED',
        'SKIPPED',
      ]);
      expect(run.steps[1].permanent).toBe(false);
      expect(run.actionsRun).toBe(0);
      expect(run.status).toBe('RUNNING');
      expect(sent).toEqual([]);

      // The provider recovers: only the refused step runs again.
      verdicts.delete('refused@example.com');
      await makeDue(event.id);
      await privateDispatcher().drain(50);
      expect(sent).toEqual(['refused@example.com']);
    });

    const startWith = async (name: string, action: object) => {
      const created = await workflows.create(asUser(), {
        name,
        eventCode,
        status: 'ACTIVE',
        conditions: [],
        actions: [{ templateKey: 'x', ...action }],
      } as never);
      return created.id;
    };
    const stepsOf = (workflowId: string, eventId: string) =>
      prisma.workflowRunStep.findMany({
        where: { run: { workflowId, eventId } },
        orderBy: [{ actionIndex: 'asc' }, { recipientIndex: 'asc' }],
      });

    it('one action with several recipients is one step each; the same person named twice is one message', async () => {
      const workflowId = await startWith('Many', {
        recipients: [
          { mode: 'FIXED', address: 'one@example.com' },
          { mode: 'FIXED', address: 'two@example.com' },
          { mode: 'FIXED', address: 'ONE@example.com' },
        ],
      });
      await emit();
      const event = await outboxEventFor();
      await privateDispatcher().drain(50);

      expect(sent.sort()).toEqual(['one@example.com', 'two@example.com']);
      const steps = await stepsOf(workflowId, event.id);
      expect(steps.map((step) => step.recipientIndex)).toEqual([0, 1]);
      expect(steps[1].stepKey).toBe(
        `${event.id}:${steps[1].stepKey.split(':')[1]}:0:r1`,
      );
      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId, eventId: event.id },
      });
      expect(run).toMatchObject({ status: 'SUCCEEDED', actionsRun: 2 });
    });

    it('a retry mails only the recipient that failed', async () => {
      const workflowId = await startWith('Many retry', {
        recipients: [
          { mode: 'FIXED', address: 'ok@example.com' },
          { mode: 'FIXED', address: 'flaky2@example.com' },
        ],
      });
      failing.set('flaky2@example.com', 1);
      await emit();
      const event = await outboxEventFor();
      await privateDispatcher().drain(50);
      expect(sent).toEqual(['ok@example.com']);

      await makeDue(event.id);
      await privateDispatcher().drain(50);
      expect(sent).toEqual(['ok@example.com', 'flaky2@example.com']);
      expect(
        (await stepsOf(workflowId, event.id)).map((step) => step.attempts),
      ).toEqual([1, 2]);
    });

    it('a role recipient is expanded once and pinned: members added before the retry are not mailed', async () => {
      const roleKey = `wfrole-${suffix}`;
      const role = await prisma.role.create({
        data: { tenantId, key: roleKey, name: `WF role ${suffix}` },
        select: { id: true },
      });
      const unit = (
        await prisma.businessUnit.findFirstOrThrow({
          where: { tenantId },
          select: { id: true },
        })
      ).id;
      const makeUser = async (label: string) => {
        const u = await actors.tenantUser(tenantId, unit, label);
        await prisma.userRole.create({
          data: { tenantId, userId: u.id, roleId: role.id },
        });
        return u.email;
      };
      const first = await makeUser('wfr-a');
      const second = await makeUser('wfr-b');
      const workflowId = await startWith('Role', {
        recipients: [{ mode: 'ROLE', roleKey }],
      });
      failing.set(second, 1);
      await emit();
      const event = await outboxEventFor();
      await privateDispatcher().drain(50);
      expect(sent).toEqual([first]);

      const third = await makeUser('wfr-c'); // joins the role after the event
      await makeDue(event.id);
      await privateDispatcher().drain(50);
      expect(sent.sort()).toEqual([first, second].sort());
      expect(sent).not.toContain(third);
      expect((await stepsOf(workflowId, event.id)).length).toBe(2);
    });

    it('a recipient that cannot be resolved is a recorded permanent failure beside the ones that worked', async () => {
      const workflowId = await startWith('Partial resolve', {
        recipients: [
          { mode: 'FIXED', address: 'there@example.com' },
          { mode: 'SUBJECT' },
        ],
      });
      await emit();
      const event = await outboxEventFor();
      await privateDispatcher().drain(50);
      const steps = await stepsOf(workflowId, event.id);
      expect(steps.map((step) => [step.status, step.permanent])).toEqual([
        ['SUCCEEDED', false],
        ['FAILED', true],
      ]);
      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId, eventId: event.id },
      });
      expect(run.status).toBe('PARTIALLY_FAILED');
    });

    it('authoring refuses a fixed recipient with no address and a role recipient with no role', async () => {
      await expect(
        workflows.create(asUser(), {
          name: 'Bad fixed',
          eventCode,
          status: 'ACTIVE',
          conditions: [],
          actions: [{ templateKey: 'x', recipients: [{ mode: 'FIXED' }] }],
        } as never),
      ).rejects.toThrow('fixed recipient');
      await expect(
        workflows.create(asUser(), {
          name: 'Bad role',
          eventCode,
          status: 'ACTIVE',
          conditions: [],
          actions: [{ templateKey: 'x', recipients: [{ mode: 'ROLE' }] }],
        } as never),
      ).rejects.toThrow('role');
    });

    it('the first send pins the template and a later edit is flagged, not silently followed; the delivery log is recorded', async () => {
      const event0 = await prisma.notificationEvent.findFirstOrThrow({
        where: { code: eventCode },
        select: { code: true },
      });
      const template = await prisma.emailTemplate.create({
        data: {
          tenantId,
          scopeKey: `TENANT:${tenantId}`,
          eventCode: event0.code,
          templateKey: `pin-${suffix}`,
          name: 'Pin test',
          subjectTemplate: 's',
          htmlTemplate: 'h',
          availableVariables: [],
          status: 'ACTIVE',
        },
        select: { id: true, version: true },
      });
      const mkLog = async (recipient: string) =>
        (
          await prisma.emailDeliveryLog.create({
            data: {
              tenantId,
              eventCode,
              templateId: template.id,
              recipient,
              subject: 's',
              status: 'SENT',
            },
            select: { id: true },
          })
        ).id;
      logs.set('p1@example.com', await mkLog('p1@example.com'));
      logs.set('p2@example.com', await mkLog('p2@example.com'));
      const workflowId = await startWith('Pinned', {
        templateKey: undefined,
        templateId: template.id,
        recipients: [
          { mode: 'FIXED', address: 'p1@example.com' },
          { mode: 'FIXED', address: 'p2@example.com' },
        ],
      });
      failing.set('p2@example.com', 1);
      await emit();
      const event = await outboxEventFor();
      await privateDispatcher().drain(50);

      // The template is edited between the first recipient and the retry.
      await prisma.emailTemplate.update({
        where: { id: template.id },
        data: { version: template.version + 1 },
      });
      await makeDue(event.id);
      await privateDispatcher().drain(50);

      const steps = await stepsOf(workflowId, event.id);
      expect(steps[0]).toMatchObject({
        templateId: template.id,
        templateVersion: template.version,
        templateDrift: false,
        deliveryStatus: 'SENT',
      });
      expect(steps[0].deliveryLogId).toBe(logs.get('p1@example.com'));
      expect(steps[1]).toMatchObject({
        templateId: template.id,
        templateVersion: template.version,
        templateDrift: true,
      });
      await prisma.emailDeliveryLog.deleteMany({
        where: { tenantId, templateId: template.id },
      });
      await prisma.workflowRunStep.updateMany({
        where: { tenantId },
        data: { deliveryLogId: null },
      });
      await prisma.emailTemplate.delete({ where: { id: template.id } });
    });

    it('reconciliation reads the provider result back: a message that failed after hand-off turns its step and its run into failures', async () => {
      const event0 = await prisma.notificationEvent.findFirstOrThrow({
        where: { code: eventCode },
        select: { code: true },
      });
      void event0;
      const mkLog = async (recipient: string) =>
        (
          await prisma.emailDeliveryLog.create({
            data: {
              tenantId,
              eventCode,
              recipient,
              subject: 's',
              status: 'SENT',
            },
            select: { id: true },
          })
        ).id;
      const goodLog = await mkLog('rec-good@example.com');
      const badLog = await mkLog('rec-bad@example.com');
      logs.set('rec-good@example.com', goodLog);
      logs.set('rec-bad@example.com', badLog);
      const workflowId = await startWith('Reconcile', {
        recipients: [
          { mode: 'FIXED', address: 'rec-good@example.com' },
          { mode: 'FIXED', address: 'rec-bad@example.com' },
        ],
      });
      await emit();
      const event = await outboxEventFor();
      await privateDispatcher().drain(50);
      expect(
        (
          await prisma.workflowRun.findFirstOrThrow({
            where: { workflowId, eventId: event.id },
          })
        ).status,
      ).toBe('SUCCEEDED');

      await prisma.emailDeliveryLog.update({
        where: { id: goodLog },
        data: { status: 'DELIVERED' },
      });
      await prisma.emailDeliveryLog.update({
        where: { id: badLog },
        data: { status: 'FAILED' },
      });
      const reconciler = app.get(WorkflowDeliveryReconciler);
      const first = await reconciler.reconcile(tenantId);
      expect(first).toMatchObject({ failed: 1 });

      const steps = await stepsOf(workflowId, event.id);
      expect(steps.map((step) => [step.status, step.deliveryStatus])).toEqual([
        ['SUCCEEDED', 'DELIVERED'],
        ['FAILED', 'FAILED'],
      ]);
      const run = await prisma.workflowRun.findFirstOrThrow({
        where: { workflowId, eventId: event.id },
      });
      expect(run).toMatchObject({ status: 'PARTIALLY_FAILED', actionsRun: 1 });
      // Nothing left to read: a second pass changes nothing.
      expect(await reconciler.reconcile(tenantId)).toMatchObject({
        changed: 0,
      });
      await prisma.workflowRunStep.updateMany({
        where: { tenantId },
        data: { deliveryLogId: null },
      });
      await prisma.emailDeliveryLog.deleteMany({
        where: { id: { in: [goodLog, badLog] } },
      });
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
