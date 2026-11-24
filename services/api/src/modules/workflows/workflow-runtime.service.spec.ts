import { WorkflowActionType, WorkflowRunStatus } from '@prisma/client';
import { WorkflowRuntimeService } from './workflow-runtime.service';

/*
 * DP-MASTER/WP-03.S1 (A03, A07, A09). A run's recorded status must tell the
 * truth: an unreadable rule fails closed, and a half-delivered rule is not
 * reported as a clean success.
 */

const TENANT = 'tenant-1';

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

function build(workflow: { conditions: unknown; actions: unknown[] }) {
  const runs: Array<Record<string, unknown>> = [];
  const prisma = {
    workflow: {
      findMany: jest.fn().mockResolvedValue([{ id: 'wf-1', ...workflow }]),
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
