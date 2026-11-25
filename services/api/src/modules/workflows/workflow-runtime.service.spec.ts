import { WorkflowActionType, WorkflowRunStatus } from '@prisma/client';
import { WorkflowRuntimeService } from './workflow-runtime.service';

/*
 * DP-MASTER/WP-03.S1 (A03, A07, A09). A run's recorded status must tell the
 * truth: an unreadable rule fails closed, and a half-delivered rule is not
 * reported as a clean success.
 */

const TENANT = 'tenant-1';

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
  const runs: Array<Record<string, unknown>> = [];
  const prisma = {
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
    workflowRun: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        runs.push(data);
        return Promise.resolve(data);
      }),
    },
  };
  const emailService = {
    sendTemplateEmail: jest.fn().mockResolvedValue(undefined),
  };
  const service = new WorkflowRuntimeService(
    prisma as never,
    emailService as never,
  );
  return { service, runs, emailService };
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
    const prisma = {
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
      workflowRun: { create: jest.fn().mockResolvedValue({}) },
    };
    const emailService = {
      sendTemplateEmail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WorkflowRuntimeService(
      prisma as never,
      emailService as never,
    );
    return { service, prisma, emailService };
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
    const { service, emailService, prisma } = candidateHarness({
      candidate: { email: 'cand@example.com' },
    });
    await service.handleEvent({
      tenantId: TENANT,
      eventCode: 'leave.request.approved',
      relatedEntityType: 'document',
      relatedEntityId: 'doc-1',
    });
    expect(emailService.sendTemplateEmail).not.toHaveBeenCalled();
    expect(prisma.workflowRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: WorkflowRunStatus.FAILED }),
      }),
    );
  });
});
