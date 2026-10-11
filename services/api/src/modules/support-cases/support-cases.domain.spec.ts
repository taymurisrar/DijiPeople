/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- recorded Prisma mock arguments are asserted structurally. */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  EscalateSupportCaseDto,
  MergeSupportCaseDto,
  UpdateSupportCaseDto,
} from './dto/support-cases.dto';
import {
  SupportCasesService,
  recomputeSlaDue,
  sameCustomerScope,
  slaTargets,
} from './support-cases.service';

describe('support case SLA policy', () => {
  it('uses enterprise defaults by severity', () => {
    expect(slaTargets('S1_CRITICAL')).toEqual({
      responseHours: 1,
      resolutionHours: 4,
    });
    expect(slaTargets('S4_LOW')).toEqual({
      responseHours: 24,
      resolutionHours: 120,
    });
  });

  it('uses valid platform support settings and rejects invalid values', () => {
    expect(
      slaTargets('S2_HIGH', { s2ResponseHours: 2, s2ResolutionHours: 8 }),
    ).toEqual({ responseHours: 2, resolutionHours: 8 });
    expect(
      slaTargets('S3_MEDIUM', {
        s3ResponseHours: -1,
        s3ResolutionHours: 'bad',
      }),
    ).toEqual({ responseHours: 8, resolutionHours: 48 });
  });

  it('recomputes unmet due dates from when the case was opened', () => {
    const createdAt = new Date('2026-10-01T00:00:00.000Z');
    expect(
      recomputeSlaDue(
        { createdAt, firstRespondedAt: null, resolvedAt: null },
        'S1_CRITICAL',
      ),
    ).toEqual({
      firstResponseDueAt: new Date('2026-10-01T01:00:00.000Z'),
      resolutionDueAt: new Date('2026-10-01T04:00:00.000Z'),
    });
    // A met target is history and is not moved.
    expect(
      recomputeSlaDue(
        { createdAt, firstRespondedAt: createdAt, resolvedAt: null },
        'S1_CRITICAL',
      ),
    ).toEqual({ resolutionDueAt: new Date('2026-10-01T04:00:00.000Z') });
  });
});

/* ------------------------------------------------------------------------ */

const manager = {
  userId: 'pu-1',
  permissionKeys: [],
  platform: { id: 'pu-1', role: 'SUPER_ADMIN', status: 'ACTIVE' },
} as unknown as AuthenticatedUser;

type Row = Record<string, unknown>;

type Call = Record<string, any>;
/** The first argument of a mock call, typed loosely for structural asserts. */
const arg = (fn: jest.Mock, index = 0) => fn.mock.calls[index][0] as Call;

function caseRow(overrides: Row = {}): Row {
  return {
    id: 'case-a',
    caseNumber: 'CASE-A',
    title: 'Payroll export fails',
    status: 'INVESTIGATING',
    severity: 'S3_MEDIUM',
    customerAccountId: 'cust-1',
    tenantId: 'tenant-1',
    mergedIntoCaseId: null,
    parentCaseId: null,
    assignedTeamId: null,
    assignedToUserId: null,
    escalationLevel: 0,
    firstRespondedAt: null,
    resolvedAt: null,
    closureConfirmedAt: null,
    customerUpdate: null,
    resolutionSummary: null,
    resolutionCategory: null,
    requesterEmail: null,
    requesterName: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

function harness(cases: Row[]) {
  const byId = new Map(cases.map((row) => [row.id as string, row]));
  const find = jest.fn(({ where }: { where: { id: string } }) =>
    Promise.resolve(byId.get(where.id) ?? null),
  );
  const tx = {
    supportCase: {
      findUnique: find,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'new-case', caseNumber: 'CASE-N' }),
    },
    supportCaseTimeline: { create: jest.fn().mockResolvedValue({}) },
    supportCaseCommunication: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      create: jest.fn().mockResolvedValue({ id: 'comm-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    supportCaseAttachment: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    supportCaseIncident: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
    },
    supportCaseRelation: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'rel-new' }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    customerAccount: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, companyName: 'Acme' }),
      ),
    },
    tenant: { findUnique: jest.fn() },
    platformUser: { findFirst: jest.fn().mockResolvedValue({ id: 'pu-2' }) },
    platformTeam: { findUnique: jest.fn() },
  };
  /*
   * Reads outside the transaction (the final `get`) go to separate mocks, so
   * an assertion on `tx` proves the write happened inside `$transaction`.
   */
  const prisma = {
    ...tx,
    supportCase: { ...tx.supportCase, findUnique: jest.fn(find) },
    supportCaseRelation: {
      ...tx.supportCaseRelation,
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const audit = { log: jest.fn().mockResolvedValue({}) };
  const events = { record: jest.fn().mockResolvedValue({}) };
  const teams = {
    findActiveTeamOrThrow: jest
      .fn()
      .mockResolvedValue({ id: 'team-1', name: 'Customer Support' }),
  };
  const assignment = {
    assignOnCreate: jest.fn().mockResolvedValue(null),
    recordAssigned: jest.fn().mockResolvedValue(undefined),
  };
  const email = {
    sendTemplateEmail: jest
      .fn()
      .mockResolvedValue({ status: 'SENT', sent: true }),
  };
  const service = new SupportCasesService(
    prisma as never,
    email as never,
    {} as never,
    audit as never,
    events as never,
    teams as never,
    assignment as never,
  );
  return { service, prisma, tx, audit, events, teams, assignment, email };
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    return {
      type: (error as Error).constructor.name,
      code:
        response && typeof response === 'object'
          ? (response as { code?: string }).code
          : undefined,
    };
  }
  return null;
}

describe('escalation (regression: Escalate always answered 400)', () => {
  it('the integer escalation level never accepted the "ESCALATED" the console sent', async () => {
    const legacy = plainToInstance(UpdateSupportCaseDto, {
      escalationLevel: 'ESCALATED',
    });
    expect(await validate(legacy)).not.toHaveLength(0);
    const escalate = plainToInstance(EscalateSupportCaseDto, {
      reason: 'Customer is blocked from running payroll.',
    });
    expect(await validate(escalate)).toHaveLength(0);
  });

  it('raises the level by one and starts the investigation', async () => {
    const h = harness([caseRow({ status: 'TRIAGED', escalationLevel: 2 })]);
    await h.service.escalate(manager, 'case-a', { reason: 'Customer blocked' });
    const call = arg(h.tx.supportCase.updateMany);
    expect(call.where).toMatchObject({
      id: 'case-a',
      status: 'TRIAGED',
      escalationLevel: { lt: 10 },
    });
    expect(call.data).toMatchObject({
      escalationLevel: { increment: 1 },
      status: 'INVESTIGATING',
    });
    expect(h.events.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: 'SUPPORT_CASE_ESCALATED' }),
    );
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SUPPORT_CASE_ESCALATED' }),
      h.tx,
    );
  });

  it('keeps a case already being worked in its status', async () => {
    const h = harness([caseRow({ status: 'FIX_IN_PROGRESS' })]);
    await h.service.escalate(manager, 'case-a', { reason: 'Customer blocked' });
    expect(arg(h.tx.supportCase.updateMany).data.status).toBeUndefined();
  });

  it('refuses past level 10 and on resolved cases', async () => {
    expect(
      await codeOf(
        harness([caseRow({ escalationLevel: 10 })]).service.escalate(
          manager,
          'case-a',
          { reason: 'again' },
        ),
      ),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_ESCALATION_LIMIT',
    });
    expect(
      await codeOf(
        harness([caseRow({ status: 'RESOLVED' })]).service.escalate(
          manager,
          'case-a',
          { reason: 'again' },
        ),
      ),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_TRANSITION_NOT_ALLOWED',
    });
  });
});

describe('customer / tenant consistency (WS09)', () => {
  const create = {
    title: 'Cannot log in',
    description: 'Every user sees a 500.',
  };

  it('refuses a tenant that belongs to a different customer', async () => {
    const h = harness([]);
    h.tx.tenant.findUnique.mockResolvedValue({
      id: 'tenant-9',
      customerAccountId: 'cust-other',
    });
    expect(
      await codeOf(
        h.service.create(manager, {
          ...create,
          customerAccountId: 'cust-1',
          tenantId: 'tenant-9',
        }),
      ),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_TENANT_CUSTOMER_MISMATCH',
    });
    expect(h.tx.supportCase.create).not.toHaveBeenCalled();
  });

  it('derives the customer from a tenant given on its own', async () => {
    const h = harness([caseRow({ id: 'new-case' })]);
    h.tx.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      customerAccountId: 'cust-1',
    });
    await h.service.create(manager, { ...create, tenantId: 'tenant-1' });
    expect(arg(h.tx.supportCase.create).data).toMatchObject({
      customerAccountId: 'cust-1',
      tenantId: 'tenant-1',
    });
  });

  it('refuses ids that do not exist', async () => {
    const h = harness([]);
    h.tx.tenant.findUnique.mockResolvedValue(null);
    expect(
      await codeOf(h.service.create(manager, { ...create, tenantId: 'nope' })),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_TENANT_NOT_FOUND',
    });
    h.tx.customerAccount.findUnique.mockResolvedValueOnce(null as never);
    expect(
      await codeOf(
        h.service.create(manager, { ...create, customerAccountId: 'nope' }),
      ),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_CUSTOMER_NOT_FOUND',
    });
  });

  it('merges an update with the stored scope: a new customer must not keep the old tenant', async () => {
    const h = harness([caseRow()]);
    h.tx.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      customerAccountId: 'cust-1',
    });
    expect(
      await codeOf(
        h.service.update(manager, 'case-a', { customerAccountId: 'cust-2' }),
      ),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_TENANT_CUSTOMER_MISMATCH',
    });
  });

  it('writes only the fields it picks, never the raw DTO', async () => {
    const h = harness([caseRow()]);
    await h.service.update(manager, 'case-a', {
      title: '  New title ',
      requesterEmail: 'OPS@Example.com',
      // Not columns of the update path; must never reach Prisma.
      ...({ caseNumber: 'HIJACK', mergedIntoCaseId: 'x' } as object),
    } as UpdateSupportCaseDto);
    const data = arg(h.tx.supportCase.updateMany).data;
    expect(data).toEqual({
      title: 'New title',
      requesterEmail: 'ops@example.com',
    });
  });

  it('assigns by rule on create only when no owner was given', async () => {
    const h = harness([caseRow({ id: 'new-case' })]);
    h.assignment.assignOnCreate.mockResolvedValue({
      userId: 'pu-9',
      teamId: 'team-7',
      ruleId: 'rule-1',
    });
    h.tx.platformTeam.findUnique.mockResolvedValue({
      id: 'team-7',
      name: 'Billing',
    });
    await h.service.create(manager, create);
    expect(arg(h.tx.supportCase.create).data).toMatchObject({
      assignedToUserId: 'pu-9',
      assignedTeamId: 'team-7',
      assignedTeam: 'Billing',
    });
    expect(h.assignment.recordAssigned).toHaveBeenCalledWith(
      'support-cases',
      'new-case',
      expect.objectContaining({ ruleId: 'rule-1' }),
      h.tx,
    );

    const explicit = harness([caseRow({ id: 'new-case' })]);
    await explicit.service.create(manager, {
      ...create,
      assignedToUserId: 'pu-2',
    });
    expect(explicit.assignment.assignOnCreate).not.toHaveBeenCalled();
  });
});

describe('PATCH status goes through the lifecycle', () => {
  it('keeps a valid move working for older clients', async () => {
    const h = harness([caseRow({ status: 'NEW' })]);
    await h.service.update(manager, 'case-a', { status: 'TRIAGED' });
    expect(arg(h.tx.supportCase.updateMany)).toMatchObject({
      where: { id: 'case-a', status: 'NEW', mergedIntoCaseId: null },
      data: { status: 'TRIAGED' },
    });
  });

  it('refuses a move the table does not allow', async () => {
    const h = harness([caseRow({ status: 'NEW' })]);
    expect(
      await codeOf(h.service.update(manager, 'case-a', { status: 'CLOSED' })),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_TRANSITION_NOT_ALLOWED',
    });
    expect(h.tx.supportCase.updateMany).not.toHaveBeenCalled();
  });

  it('refuses edits to a closed case and to a merged one', async () => {
    expect(
      await codeOf(
        harness([caseRow({ status: 'CLOSED' })]).service.update(
          manager,
          'case-a',
          { title: 'x' },
        ),
      ),
    ).toEqual({ type: 'BadRequestException', code: 'SUPPORT_CASE_LOCKED' });
    expect(
      await codeOf(
        harness([caseRow({ mergedIntoCaseId: 'case-b' })]).service.update(
          manager,
          'case-a',
          { title: 'x' },
        ),
      ),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_MERGED_READ_ONLY',
    });
  });

  it('recomputes unmet SLA dues when severity changes', async () => {
    const h = harness([caseRow()]);
    await h.service.update(manager, 'case-a', { severity: 'S1_CRITICAL' });
    expect(arg(h.tx.supportCase.updateMany).data).toMatchObject({
      severity: 'S1_CRITICAL',
      firstResponseDueAt: new Date('2026-10-01T01:00:00.000Z'),
      resolutionDueAt: new Date('2026-10-01T04:00:00.000Z'),
    });
  });

  it('a lost race is a conflict, not a silent overwrite', async () => {
    const h = harness([caseRow({ status: 'NEW' })]);
    h.tx.supportCase.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      h.service.update(manager, 'case-a', { status: 'TRIAGED' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('transitions', () => {
  it('honours the closure confirmation setting', async () => {
    const h = harness([caseRow({ status: 'RESOLVED' })]);
    h.tx.platformSetting.findUnique.mockResolvedValue({
      value: { closureConfirmationRequired: true },
    });
    expect(
      await codeOf(
        h.service.transition(manager, 'case-a', { toStatus: 'CLOSED' }),
      ),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_CLOSURE_CONFIRMATION_REQUIRED',
    });
    await h.service.transition(manager, 'case-a', {
      toStatus: 'CLOSED',
      confirmClosure: true,
    });
    expect(arg(h.tx.supportCase.updateMany).data).toMatchObject({
      status: 'CLOSED',
      closureConfirmedAt: expect.any(Date),
      closedAt: expect.any(Date),
    });
  });

  it('reopen clears both dates, counts, and emits an event the formatter can render', async () => {
    const h = harness([caseRow({ status: 'CLOSED', resolvedAt: new Date() })]);
    await h.service.reopen(manager, 'case-a', {
      reason: 'Still broken for payroll',
    });
    expect(arg(h.tx.supportCase.updateMany).data).toMatchObject({
      status: 'REOPENED',
      resolvedAt: null,
      closedAt: null,
      reopenedCount: { increment: 1 },
    });
    expect(h.events.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: 'SUPPORT_CASE_REOPENED',
        entityType: 'SupportCase',
        entityId: 'case-a',
        customerAccountId: 'cust-1',
        tenantId: 'tenant-1',
        metadata: expect.objectContaining({
          caseNumber: 'CASE-A',
          title: 'Payroll export fails',
          fromStatus: 'CLOSED',
          toStatus: 'REOPENED',
        }),
      }),
    );
  });

  it('request-info records the message but keeps its body out of the event', async () => {
    const body = 'Please send the failing export file. '.repeat(10);
    const h = harness([caseRow({ requesterEmail: 'ops@acme.test' })]);
    await h.service.requestInfo(manager, 'case-a', { customerMessage: body });
    expect(h.tx.supportCaseCommunication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        body: body.trim(),
        deliveryStatus: 'QUEUED',
      }),
    });
    const event = arg(h.events.record);
    expect(event.eventCode).toBe('SUPPORT_CASE_INFO_REQUESTED');
    expect(JSON.stringify(event.metadata)).not.toContain(body.trim());
    expect(String(event.metadata.message).length).toBeLessThanOrEqual(140);
    expect(h.email.sendTemplateEmail).toHaveBeenCalled();
  });
});

describe('merge', () => {
  const source = () => caseRow({ id: 'case-a', caseNumber: 'CASE-A' });
  const target = (overrides: Row = {}) =>
    caseRow({ id: 'case-b', caseNumber: 'CASE-B', ...overrides });
  const run = (cases: Row[], targetCaseId = 'case-b') =>
    codeOf(
      harness(cases).service.merge(manager, 'case-a', {
        targetCaseId,
        reason: 'duplicate',
      }),
    );

  it('requires a reason', async () => {
    const dto = plainToInstance(MergeSupportCaseDto, {
      targetCaseId: '6f2c1f3e-8f1d-4f36-9a8e-0f5b1b4f8e11',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('refuses itself', async () => {
    expect(await run([source()], 'case-a')).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_MERGE_SELF',
    });
  });

  it('refuses a target merged elsewhere, including back into the source (a cycle)', async () => {
    expect(
      await run([source(), target({ mergedIntoCaseId: 'case-a' })]),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_MERGE_REFUSED',
    });
  });

  it('refuses a cancelled source and a closed target', async () => {
    expect(await run([caseRow({ status: 'CANCELLED' }), target()])).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_MERGE_REFUSED',
    });
    expect(await run([source(), target({ status: 'CLOSED' })])).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_MERGE_REFUSED',
    });
  });

  it('refuses another customer, or the same customer on a different tenant', async () => {
    expect(
      await run([source(), target({ customerAccountId: 'cust-2' })]),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_MERGE_REFUSED',
    });
    expect(await run([source(), target({ tenantId: 'tenant-2' })])).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_MERGE_REFUSED',
    });
  });

  it('moves the work onto the target inside one transaction', async () => {
    const h = harness([source(), target()]);
    h.tx.supportCaseIncident.findMany
      .mockResolvedValueOnce([
        { id: 'link-1', errorLogId: 'err-1' },
        { id: 'link-2', errorLogId: 'err-2' },
      ])
      .mockResolvedValueOnce([{ errorLogId: 'err-2' }]);
    h.tx.supportCaseRelation.findMany
      .mockResolvedValueOnce([
        // to a third case: repointed
        {
          id: 'rel-1',
          sourceCaseId: 'case-a',
          targetCaseId: 'case-c',
          relationType: 'RELATED',
        },
        // to the target itself: would become self-referencing, dropped
        {
          id: 'rel-2',
          sourceCaseId: 'case-a',
          targetCaseId: 'case-b',
          relationType: 'RELATED',
        },
        // the target already has this one: dropped
        {
          id: 'rel-3',
          sourceCaseId: 'case-d',
          targetCaseId: 'case-a',
          relationType: 'BLOCKS',
        },
      ])
      .mockResolvedValueOnce([
        {
          sourceCaseId: 'case-d',
          targetCaseId: 'case-b',
          relationType: 'BLOCKS',
        },
      ]);

    await h.service.merge(manager, 'case-a', {
      targetCaseId: 'case-b',
      reason: 'Same incident',
    });

    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1);
    const updates = h.tx.supportCase.updateMany.mock.calls.map(
      (call) => call[0] as Call,
    );
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'case-a',
            mergedIntoCaseId: null,
          }),
          data: expect.objectContaining({
            mergedIntoCaseId: 'case-b',
            status: 'CLOSED',
            resolutionCategory: 'DUPLICATE',
            closedAt: expect.any(Date),
          }),
        }),
        expect.objectContaining({
          where: { parentCaseId: 'case-a', id: { not: 'case-b' } },
          data: { parentCaseId: 'case-b' },
        }),
        expect.objectContaining({
          where: { mergedIntoCaseId: 'case-a', id: { not: 'case-b' } },
          data: { mergedIntoCaseId: 'case-b' },
        }),
      ]),
    );
    expect(h.tx.supportCaseCommunication.updateMany).toHaveBeenCalledWith({
      where: { supportCaseId: 'case-a' },
      data: { supportCaseId: 'case-b' },
    });
    expect(h.tx.supportCaseAttachment.updateMany).toHaveBeenCalledWith({
      where: { supportCaseId: 'case-a' },
      data: { supportCaseId: 'case-b' },
    });
    expect(h.tx.supportCaseIncident.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['link-2'] } },
    });
    expect(h.tx.supportCaseIncident.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['link-1'] } },
      data: { supportCaseId: 'case-b' },
    });
    expect(h.tx.supportCaseRelation.update).toHaveBeenCalledWith({
      where: { id: 'rel-1' },
      data: { sourceCaseId: 'case-b', targetCaseId: 'case-c' },
    });
    expect(
      h.tx.supportCaseRelation.delete.mock.calls.map(
        (c) => (c[0] as Call).where.id,
      ),
    ).toEqual(['rel-2', 'rel-3']);
    // Both cases record the merge; the source keeps its own history.
    const timelineCases = h.tx.supportCaseTimeline.create.mock.calls.map(
      (call) => (call[0] as Call).data.supportCaseId,
    );
    expect(timelineCases).toEqual(expect.arrayContaining(['case-a', 'case-b']));
    expect(h.events.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: 'SUPPORT_CASE_MERGED' }),
    );
  });

  it('moves nothing when either case changed underneath it', async () => {
    const h = harness([source(), target()]);
    h.tx.supportCase.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    await expect(
      h.service.merge(manager, 'case-a', {
        targetCaseId: 'case-b',
        reason: 'dup',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.tx.supportCaseCommunication.updateMany).not.toHaveBeenCalled();
    expect(h.events.record).not.toHaveBeenCalled();
  });

  it('a merged case refuses every lifecycle command', async () => {
    const h = harness([
      caseRow({ status: 'CLOSED', mergedIntoCaseId: 'case-b' }),
    ]);
    expect(
      await codeOf(
        h.service.reopen(manager, 'case-a', { reason: 'try again' }),
      ),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_MERGED_READ_ONLY',
    });
  });
});

describe('case relations', () => {
  const pair = (b: Row = {}) =>
    harness([caseRow(), caseRow({ id: 'case-b', caseNumber: 'CASE-B', ...b })]);

  it('refuses a self link', async () => {
    expect(
      await codeOf(
        pair().service.createRelation(manager, 'case-a', {
          targetCaseId: 'case-a',
        }),
      ),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_RELATION_SELF',
    });
  });

  it('refuses a duplicate in either direction for symmetric types', async () => {
    const h = pair();
    h.tx.supportCaseRelation.findFirst.mockResolvedValue({ id: 'rel-1' });
    expect(
      await codeOf(
        h.service.createRelation(manager, 'case-a', { targetCaseId: 'case-b' }),
      ),
    ).toEqual({
      type: 'ConflictException',
      code: 'SUPPORT_CASE_RELATION_EXISTS',
    });
    expect(arg(h.tx.supportCaseRelation.findFirst).where.OR).toHaveLength(2);
  });

  it('refuses a BLOCKS cycle', async () => {
    const h = pair();
    // case-b already blocks case-a
    h.tx.supportCaseRelation.findMany.mockResolvedValueOnce([
      { targetCaseId: 'case-a' },
    ]);
    expect(
      await codeOf(
        h.service.createRelation(manager, 'case-a', {
          targetCaseId: 'case-b',
          relationType: 'BLOCKS',
        }),
      ),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_RELATION_CYCLE',
    });
    expect(h.tx.supportCaseRelation.create).not.toHaveBeenCalled();
  });

  it('refuses cases of different customers', async () => {
    expect(
      await codeOf(
        pair({
          customerAccountId: 'cust-2',
          tenantId: 'tenant-2',
        }).service.createRelation(manager, 'case-a', {
          targetCaseId: 'case-b',
        }),
      ),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_RELATION_SCOPE_MISMATCH',
    });
  });

  it('scope rule: same customer, same tenant, or both internal', () => {
    const c = (customerAccountId: string | null, tenantId: string | null) => ({
      customerAccountId,
      tenantId,
    });
    expect(sameCustomerScope(c(null, null), c(null, null))).toBe(true);
    expect(sameCustomerScope(c('a', null), c('a', 't'))).toBe(true);
    expect(sameCustomerScope(c('a', 't'), c(null, 't'))).toBe(true);
    expect(sameCustomerScope(c('a', null), c(null, null))).toBe(false);
    expect(sameCustomerScope(c('a', 't1'), c('b', 't2'))).toBe(false);
  });

  it('records a timeline entry on both cases, an audit row and an event', async () => {
    const h = pair();
    await h.service.createRelation(manager, 'case-a', {
      targetCaseId: 'case-b',
      relationType: 'DUPLICATE',
    });
    expect(h.tx.supportCaseRelation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceCaseId: 'case-a',
        targetCaseId: 'case-b',
        relationType: 'DUPLICATE',
      }),
    });
    expect(h.tx.supportCaseTimeline.create).toHaveBeenCalledTimes(2);
    expect(h.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SUPPORT_CASE_LINKED' }),
      h.tx,
    );
    expect(h.events.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventCode: 'SUPPORT_CASE_LINKED' }),
    );
  });

  it('unlinks only a relation that touches this case', async () => {
    const h = pair();
    await expect(
      h.service.deleteRelation(manager, 'case-a', 'rel-x'),
    ).rejects.toThrow('That link was not found on this case.');
    expect(arg(h.tx.supportCaseRelation.findFirst).where).toEqual({
      id: 'rel-x',
      OR: [{ sourceCaseId: 'case-a' }, { targetCaseId: 'case-a' }],
    });
  });
});

describe('assignment', () => {
  it('moves a waiting case to ASSIGNED and snapshots the team name', async () => {
    const h = harness([caseRow({ status: 'TRIAGED' })]);
    await h.service.assign(manager, 'case-a', { assignedTeamId: 'team-1' });
    expect(arg(h.tx.supportCase.updateMany).data).toMatchObject({
      assignedTeamId: 'team-1',
      assignedTeam: 'Customer Support',
      status: 'ASSIGNED',
    });
  });

  it('requires an active platform user', async () => {
    const h = harness([caseRow()]);
    h.prisma.platformUser.findFirst.mockResolvedValue(null);
    expect(
      await codeOf(
        h.service.assign(manager, 'case-a', { assignedToUserId: 'pu-x' }),
      ),
    ).toEqual({
      type: 'BadRequestException',
      code: 'SUPPORT_CASE_OWNER_INVALID',
    });
  });

  it('refuses an empty request', async () => {
    await expect(
      harness([caseRow()]).service.assign(manager, 'case-a', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
