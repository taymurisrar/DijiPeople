import { WorkflowStatus } from '@prisma/client';
import { WorkflowsService } from './workflows.service';
import {
  buildWorkflowDefinition,
  checksumWorkflowDefinition,
} from './workflow-versioning';

/*
 * DP-MASTER/WP-03.S2 (A08, A12): a stable key at creation, and an immutable
 * version minted whenever an ACTIVE workflow changes what it does.
 */

const USER = { tenantId: 't1', userId: 'u1' } as never;

function workflowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    tenantId: 't1',
    workflowKey: 'notify-hr',
    scopeKey: 'TENANT:t1',
    moduleKey: null,
    name: 'Notify HR',
    description: null,
    eventCode: 'leave.request.approved',
    status: WorkflowStatus.ACTIVE,
    conditions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    actions: [
      {
        id: 'a1',
        type: 'SEND_EMAIL',
        sortOrder: 0,
        isActive: true,
        configuration: { recipientMode: 'SUBJECT' },
      },
    ],
    _count: { runs: 0 },
    ...overrides,
  };
}

function build(
  options: {
    existingKeys?: string[];
    latestDefinition?: unknown;
    row?: Record<string, unknown>;
  } = {},
) {
  const row = workflowRow(options.row);
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    workflow: {
      create: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue(row),
    },
    workflowAction: { deleteMany: jest.fn() },
    workflowVersion: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.latestDefinition === undefined
            ? null
            : { version: 1, definition: options.latestDefinition },
        ),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    workflow: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest
        .fn()
        .mockResolvedValue(
          (options.existingKeys ?? []).map((workflowKey) => ({ workflowKey })),
        ),
    },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const service = Object.assign(Object.create(WorkflowsService.prototype), {
    prisma,
    assertEventExists: jest.fn(),
    resolveScopeKey: jest.fn().mockResolvedValue('TENANT:t1'),
    buildActions: jest.fn().mockReturnValue([]),
  }) as WorkflowsService;
  return { service, tx, prisma, row };
}

const dto = {
  name: 'Notify HR',
  eventCode: 'leave.request.approved',
  status: WorkflowStatus.ACTIVE,
  actions: [],
} as never;

describe('workflow keys and versions', () => {
  it('creates an ACTIVE workflow with a derived key and version 1', async () => {
    const { service, tx } = build();
    const created = await service.create(USER, dto);
    expect(tx.workflow.create.mock.calls[0][0].data.workflowKey).toBe(
      'notify-hr',
    );
    expect(tx.workflowVersion.create).toHaveBeenCalledTimes(1);
    expect(tx.workflowVersion.create.mock.calls[0][0].data).toMatchObject({
      version: 1,
      tenantId: 't1',
      workflowId: 'w1',
      publishedBy: 'u1',
    });
    expect(created.workflowKey).toBe('notify-hr');
  });

  it('suffixes the key when the tenant already has it', async () => {
    const { service, tx } = build({ existingKeys: ['notify-hr'] });
    await service.create(USER, dto);
    expect(tx.workflow.create.mock.calls[0][0].data.workflowKey).toBe(
      'notify-hr-2',
    );
  });

  it('rejects ill-typed conditions before anything is written', async () => {
    const { service, tx } = build();
    await expect(
      service.create(USER, {
        ...(dto as object),
        conditions: [{ field: 'a b', operator: 'equals', value: 'x' }],
      } as never),
    ).rejects.toMatchObject({
      response: { code: 'WORKFLOW_CONDITIONS_INVALID' },
    });
    expect(tx.workflow.create).not.toHaveBeenCalled();
  });

  it('mints no version for a DRAFT workflow', async () => {
    const { service, tx } = build({ row: { status: WorkflowStatus.DRAFT } });
    await service.create(USER, {
      ...(dto as object),
      status: WorkflowStatus.DRAFT,
    } as never);
    expect(tx.workflowVersion.create).not.toHaveBeenCalled();
  });

  it('mints version 2 when an ACTIVE workflow changes behaviour', async () => {
    const previous = buildWorkflowDefinition(
      workflowRow({
        conditions: [{ field: 'a', operator: 'equals', value: 'x' }],
      }),
    );
    const { service, tx, prisma } = build({ latestDefinition: previous });
    prisma.workflow.findFirst.mockResolvedValue({
      id: 'w1',
      scopeKey: 'TENANT:t1',
    });
    await service.update(USER, 'w1', { name: 'Notify HR' } as never);
    expect(tx.workflowVersion.create.mock.calls[0][0].data.version).toBe(2);
  });

  it('mints nothing when a save changes nothing, including after the SQL backfill', async () => {
    const same = buildWorkflowDefinition(workflowRow());
    const { service, tx, prisma } = build({
      latestDefinition: JSON.parse(JSON.stringify(same)),
    });
    prisma.workflow.findFirst.mockResolvedValue({
      id: 'w1',
      scopeKey: 'TENANT:t1',
    });
    await service.update(USER, 'w1', { description: 'x' } as never);
    expect(tx.workflowVersion.create).not.toHaveBeenCalled();
    expect(checksumWorkflowDefinition(same)).toHaveLength(64);
  });

  it('never rewrites the key on rename', async () => {
    const { service, tx, prisma } = build();
    prisma.workflow.findFirst.mockResolvedValue({
      id: 'w1',
      scopeKey: 'TENANT:t1',
    });
    await service.update(USER, 'w1', { name: 'A brand new name' } as never);
    expect(tx.workflow.update.mock.calls[0][0].data).not.toHaveProperty(
      'workflowKey',
    );
  });
});
