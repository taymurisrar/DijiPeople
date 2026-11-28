/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- in-memory ledger mock over untyped rows */
import { WorkflowActionType, WorkflowRunStatus } from '@prisma/client';
import { WorkflowRuntimeService } from './workflow-runtime.service';

/*
 * DP-MASTER/WP-03.S1 (A03, A07, A09). A run's recorded status must tell the
 * truth: an unreadable rule fails closed, and a half-delivered rule is not
 * reported as a clean success.
 */

const TENANT = 'tenant-1';

/** What the e-mail service returns for a message that really left. */
const DELIVERED = {
  sent: true,
  delivered: true,
  dryRun: false,
  skipped: false,
  status: 'SENT',
};

/**
 * An in-memory run and step ledger with the same lookups the runtime performs, so
 * these specs exercise the real bookkeeping rather than a stub of it. The real
 * database is covered by workflow-durable-execution.e2e-spec.ts.
 */
function ledger() {
  type Row = Record<string, any>;
  const runs: Row[] = [];
  const steps: Row[] = [];
  const stepAt = (where: { tenantId_stepKey: Row }) =>
    steps.find(
      (r) =>
        r.tenantId === where.tenantId_stepKey.tenantId &&
        r.stepKey === where.tenantId_stepKey.stepKey,
    );
  return {
    runs,
    steps,
    workflowRun: {
      findUnique: jest.fn(({ where }: { where: { workflowId_eventId: Row } }) =>
        Promise.resolve(
          runs.find(
            (r) =>
              r.workflowId === where.workflowId_eventId.workflowId &&
              r.eventId === where.workflowId_eventId.eventId,
          ) ?? null,
        ),
      ),
      create: jest.fn(({ data }: { data: Row }) => {
        const row = { id: `run-${runs.length + 1}`, ...data };
        runs.push(row);
        return Promise.resolve(row);
      }),
      findMany: jest.fn(({ where }: { where: Row }) =>
        Promise.resolve(runs.filter((r) => r.eventId === where.eventId)),
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: Row }) => {
          const row = runs.find((r) => r.id === where.id) as Row;
          Object.assign(row, data);
          return Promise.resolve(row);
        },
      ),
    },
    workflowRunStep: {
      findUnique: jest.fn(({ where }: { where: { tenantId_stepKey: Row } }) =>
        Promise.resolve(stepAt(where) ?? null),
      ),
      // No template has been pinned by an earlier send in these in-memory runs.
      findFirst: jest.fn(() => Promise.resolve(null)),
      createMany: jest.fn(({ data }: { data: Row[] }) => {
        let count = 0;
        for (const item of data) {
          if (
            steps.some(
              (r) => r.tenantId === item.tenantId && r.stepKey === item.stepKey,
            )
          ) {
            continue;
          }
          steps.push({ id: `step-${steps.length + 1}`, ...item });
          count += 1;
        }
        return Promise.resolve({ count });
      }),
      // The compare-and-set the runtime uses to take a retryable step over.
      updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
        // The fenced settle: only the delivery holding the claim may write.
        if (where.attempts !== undefined) {
          const held = steps.find(
            (r) =>
              r.tenantId === where.tenantId &&
              r.stepKey === where.stepKey &&
              r.attempts === where.attempts &&
              r.status === where.status,
          );
          if (!held) return Promise.resolve({ count: 0 });
          Object.assign(held, data);
          return Promise.resolve({ count: 1 });
        }
        const row = steps.find(
          (r) =>
            r.tenantId === where.tenantId &&
            r.stepKey === where.stepKey &&
            ((r.status === 'FAILED' && r.permanent === false) ||
              (r.status === 'IN_PROGRESS' &&
                r.startedAt &&
                r.startedAt < where.OR[1].startedAt.lt)),
        );
        if (!row) return Promise.resolve({ count: 0 });
        row.status = data.status;
        row.attempts += data.attempts.increment;
        row.startedAt = data.startedAt;
        row.finishedAt = null;
        return Promise.resolve({ count: 1 });
      }),
      upsert: jest.fn(
        ({
          where,
          create,
          update,
        }: {
          where: { tenantId_stepKey: Row };
          create: Row;
          update: Row;
        }) => {
          const existing = stepAt(where);
          if (existing) {
            existing.status = update.status;
            existing.attempts += 1;
            return Promise.resolve(existing);
          }
          const row = { id: `step-${steps.length + 1}`, ...create };
          steps.push(row);
          return Promise.resolve(row);
        },
      ),
      update: jest.fn(
        ({ where, data }: { where: { tenantId_stepKey: Row }; data: Row }) => {
          const row = stepAt(where) as Row;
          Object.assign(row, data);
          return Promise.resolve(row);
        },
      ),
    },
  };
}

/** What the pinned, published snapshot holds for an action. */
function pinnedAction(recipientAddress?: string) {
  return {
    type: WorkflowActionType.SEND_EMAIL,
    sortOrder: 0,
    isActive: true,
    configuration: {
      recipientMode: 'FIXED',
      recipientAddress,
      templateKey: 't',
    },
  };
}

function email(recipientAddress?: string) {
  return {
    id: `a-${Math.random()}`,
    type: WorkflowActionType.SEND_EMAIL,
    configuration: {
      recipientMode: 'FIXED',
      recipientAddress,
      templateKey: 't',
    },
  };
}

function build(
  workflow: { conditions: unknown; actions: unknown[] },
  options: { published?: boolean } = {},
) {
  const book = ledger();
  const runs = book.runs;
  const prisma = {
    // Nobody in these specs is a tenant person, so every address is eligible.
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    employee: { findFirst: jest.fn().mockResolvedValue(null) },
    workflowRun: book.workflowRun,
    workflowRunStep: book.workflowRunStep,
    workflow: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'wf-1',
          // Mutable live rows: deliberately different from the snapshot.
          conditions: [{ field: 'live', operator: 'equals', value: 'never' }],
          actions: [email('live-row@example.com')],
          versions:
            options.published === false
              ? []
              : [
                  {
                    id: 'ver-1',
                    definition: {
                      conditions: workflow.conditions,
                      actions: (
                        workflow.actions as {
                          configuration: { recipientAddress?: string };
                        }[]
                      ).map((a) =>
                        pinnedAction(a.configuration.recipientAddress),
                      ),
                    },
                  },
                ],
        },
      ]),
    },
  };
  const emailService = {
    sendTemplateEmail: jest.fn().mockResolvedValue(DELIVERED),
    // Pinning resolves nothing here: these tests drive explicit send paths.
    pinTemplate: jest.fn().mockResolvedValue(null),
  };
  const service = new WorkflowRuntimeService(
    prisma as never,
    emailService as never,
  );
  return { service, runs, emailService, book };
}

const EVENT = { tenantId: TENANT, eventCode: 'leave.request.approved' };

describe('WorkflowRuntimeService run status', () => {
  it('fails closed on malformed conditions, sends nothing and records why', async () => {
    const { service, runs, emailService } = build({
      conditions: [{ field: 'x', operator: 'bogus' }],
      actions: [email('a@example.com')],
    });
    await service.handleEvent(EVENT);
    expect(emailService.sendTemplateEmail).not.toHaveBeenCalled();
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe(WorkflowRunStatus.FAILED);
    expect(String(runs[0].error)).toContain('Malformed conditions');
  });

  it('records PARTIALLY_FAILED when some actions run and others fail', async () => {
    const { service, runs, emailService } = build({
      conditions: [],
      actions: [email('a@example.com'), email(undefined)],
    });
    const result = await service.handleEvent(EVENT);
    expect(emailService.sendTemplateEmail).toHaveBeenCalledTimes(1);
    expect(runs[0].status).toBe(WorkflowRunStatus.PARTIALLY_FAILED);
    expect(runs[0].actionsRun).toBe(1);
    // A partial run is not counted as a clean run.
    expect(result).toEqual({ matched: 1, ran: 0 });
  });

  it('records FAILED when every action fails', async () => {
    const { service, runs } = build({
      conditions: [],
      actions: [email(undefined)],
    });
    await service.handleEvent(EVENT);
    expect(runs[0].status).toBe(WorkflowRunStatus.FAILED);
  });

  it('executes the pinned published snapshot, never the mutable live rows', async () => {
    const { service, emailService } = build({
      conditions: [],
      actions: [email('pinned@example.com')],
    });
    await service.handleEvent(EVENT);
    expect(emailService.sendTemplateEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 'pinned@example.com' }),
    );
  });

  it('refuses to run an ACTIVE workflow that has no published version', async () => {
    const { service, runs, emailService } = build(
      { conditions: [], actions: [email('a@example.com')] },
      { published: false },
    );
    await service.handleEvent(EVENT);
    expect(emailService.sendTemplateEmail).not.toHaveBeenCalled();
    expect(runs[0].status).toBe(WorkflowRunStatus.FAILED);
    expect(String(runs[0].error)).toContain('No published version');
  });

  it('records the published version that executed', async () => {
    const { service, runs } = build({
      conditions: [],
      actions: [email('a@example.com')],
    });
    await service.handleEvent(EVENT);
    expect(runs[0].workflowVersionId).toBe('ver-1');
  });

  it('records SUCCEEDED only when every action ran', async () => {
    const { service, runs } = build({
      conditions: [],
      actions: [email('a@example.com'), email('b@example.com')],
    });
    const result = await service.handleEvent(EVENT);
    expect(runs[0].status).toBe(WorkflowRunStatus.SUCCEEDED);
    expect(result).toEqual({ matched: 1, ran: 1 });
  });
});

describe('CANDIDATE recipient (WP-04.S1)', () => {
  function candidateHarness(application: unknown) {
    const book = ledger();
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      employee: { findFirst: jest.fn().mockResolvedValue(null) },
      workflow: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wf-1',
            versions: [
              {
                id: 'ver-1',
                definition: {
                  conditions: [],
                  actions: [
                    {
                      type: WorkflowActionType.SEND_EMAIL,
                      sortOrder: 0,
                      isActive: true,
                      configuration: {
                        recipientMode: 'CANDIDATE',
                        templateKey: 't',
                      },
                    },
                  ],
                },
              },
            ],
            conditions: [],
            actions: [
              {
                id: 'a1',
                type: WorkflowActionType.SEND_EMAIL,
                configuration: { recipientMode: 'CANDIDATE', templateKey: 't' },
              },
            ],
          },
        ]),
      },
      application: { findFirst: jest.fn().mockResolvedValue(application) },
      ...book,
    };
    const emailService = {
      sendTemplateEmail: jest.fn().mockResolvedValue(DELIVERED),
      pinTemplate: jest.fn().mockResolvedValue(null),
    };
    const service = new WorkflowRuntimeService(
      prisma as never,
      emailService as never,
    );
    return { service, prisma, emailService, book };
  }

  it('sends to the candidate of the application, looked up inside the tenant', async () => {
    const { service, prisma, emailService } = candidateHarness({
      candidate: { email: 'cand@example.com' },
    });
    await service.handleEvent({
      tenantId: TENANT,
      eventCode: 'recruitment.application.stage.changed',
      relatedEntityType: 'application',
      relatedEntityId: 'app-1',
    });
    expect(prisma.application.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'app-1', tenantId: TENANT } }),
    );
    expect(emailService.sendTemplateEmail).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 'cand@example.com' }),
    );
  });

  it('resolves no recipient for a non-application event, and reports it', async () => {
    const { service, emailService, book } = candidateHarness({
      candidate: { email: 'cand@example.com' },
    });
    await service.handleEvent({
      tenantId: TENANT,
      eventCode: 'leave.request.approved',
      relatedEntityType: 'document',
      relatedEntityId: 'doc-1',
    });
    expect(emailService.sendTemplateEmail).not.toHaveBeenCalled();
    expect(book.runs[0].status).toBe(WorkflowRunStatus.FAILED);
    expect(book.steps[0]).toMatchObject({ status: 'FAILED', permanent: true });
  });
});

describe('step ledger (WP-03.S3)', () => {
  it('records one step per action, keyed by event, pinned version and action index', async () => {
    const { service, book } = build({
      conditions: [],
      actions: [email('a@example.com'), email('b@example.com')],
    });
    await service.execute(EVENT, { eventId: 'evt-1', finalAttempt: true });
    expect(book.steps.map((x) => x.stepKey)).toEqual([
      'evt-1:ver-1:0',
      'evt-1:ver-1:1',
    ]);
    expect(book.steps.every((x) => x.status === 'SUCCEEDED')).toBe(true);
  });

  it('a redelivery of a settled event finds its run and sends nothing', async () => {
    const { service, emailService } = build({
      conditions: [],
      actions: [email('a@example.com')],
    });
    await service.execute(EVENT, { eventId: 'evt-1', finalAttempt: true });
    await service.execute(EVENT, { eventId: 'evt-1', finalAttempt: true });
    expect(emailService.sendTemplateEmail).toHaveBeenCalledTimes(1);
  });

  it('a retryable failure keeps the run RUNNING until the attempts are exhausted', async () => {
    const { service, emailService, runs } = build({
      conditions: [],
      actions: [email('a@example.com')],
    });
    emailService.sendTemplateEmail.mockRejectedValueOnce(new Error('smtp'));
    const first = await service.execute(EVENT, {
      eventId: 'evt-2',
      finalAttempt: false,
    });
    expect(first.retryable).toBe(1);
    expect(runs[0].status).toBe(WorkflowRunStatus.RUNNING);

    const second = await service.execute(EVENT, {
      eventId: 'evt-2',
      finalAttempt: false,
    });
    expect(second.retryable).toBe(0);
    expect(runs[0].status).toBe(WorkflowRunStatus.SUCCEEDED);
    expect(emailService.sendTemplateEmail).toHaveBeenCalledTimes(2);
  });

  it('on the final attempt the same failure settles the run instead of waiting', async () => {
    const { service, emailService, runs } = build({
      conditions: [],
      actions: [email('a@example.com')],
    });
    emailService.sendTemplateEmail.mockRejectedValue(new Error('smtp'));
    const result = await service.execute(EVENT, {
      eventId: 'evt-3',
      finalAttempt: true,
    });
    expect(result.retryable).toBe(0);
    expect(runs[0].status).toBe(WorkflowRunStatus.FAILED);
  });
});
