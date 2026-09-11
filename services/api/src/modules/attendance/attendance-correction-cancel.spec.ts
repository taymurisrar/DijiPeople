import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AttendanceService } from './attendance.service';

/**
 * BUG-2573 — a correction request had no withdraw path. `CANCELLED` existed
 * on the enum and the generic approval sync already mapped it on all three of
 * its status enums; nothing routed to it.
 *
 * Scope, per the record's own open decisions: the REQUESTER ONLY may cancel,
 * and ONLY while `PENDING_APPROVAL` — there is no partial-decision state in
 * this single-step approval.
 */

const TENANT = 'tenant-1';

function buildUser(userId: string): AuthenticatedUser {
  return {
    userId,
    tenantId: TENANT,
    email: `${userId}@example.com`,
    roleIds: [],
    roleKeys: [],
    permissionKeys: ['attendance.correction.read'],
  };
}

function buildCorrection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'correction-1',
    tenantId: TENANT,
    status: 'PENDING_APPROVAL',
    requestedByUserId: 'employee-user-1',
    employeeId: 'employee-1',
    requestNumber: 'ACR-000001',
    employee: {
      id: 'employee-1',
      userId: 'employee-user-1',
      manager: { id: 'employee-9', userId: 'manager-1' },
    },
    ...overrides,
  };
}

function buildService(correction: ReturnType<typeof buildCorrection>) {
  const updateCalls: Array<Record<string, unknown>> = [];
  const prisma = {
    attendanceCorrectionRequest: {
      findFirst: jest.fn().mockResolvedValue(correction),
      update: jest.fn((args: { data: Record<string, unknown> }) => {
        updateCalls.push(args.data);
        return Promise.resolve({});
      }),
      findFirstOrThrow: jest.fn().mockResolvedValue({
        ...correction,
        status: 'CANCELLED',
      }),
      count: jest.fn().mockResolvedValue(0),
    },
    // The generic approval sync's own writes. Only the shape needed to reach
    // completion without throwing — its behaviour for CANCELLED is not new
    // code from this bug and is exercised by its own mapping functions.
    approvalRequest: {
      upsert: jest.fn().mockResolvedValue({ id: 'approval-1' }),
      update: jest.fn().mockResolvedValue({}),
      // mapCorrectionRequest's `includeApproval` read.
      findFirst: jest.fn().mockResolvedValue(null),
    },
    approvalStep: {
      upsert: jest.fn().mockResolvedValue({ id: 'step-1' }),
    },
    approvalAssignment: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    approvalAction: {
      create: jest.fn().mockResolvedValue({}),
    },
    slaRule: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  };

  const service = new AttendanceService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { log: jest.fn() } as never,
    { emit: jest.fn().mockResolvedValue(undefined) } as never,
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, prisma, updateCalls };
}

describe('AttendanceService.cancelCorrectionRequest (BUG-2573)', () => {
  it('lets the requester withdraw their own pending request', async () => {
    const correction = buildCorrection();
    const { service, updateCalls } = buildService(correction);

    const result = await service.cancelCorrectionRequest(
      buildUser('employee-user-1'),
      'correction-1',
      {},
    );

    expect(updateCalls[0].status).toBe('CANCELLED');
    expect(result.item.status).toBe('CANCELLED');
  });

  it('refuses anyone other than the requester', async () => {
    const correction = buildCorrection({
      requestedByUserId: 'employee-user-1',
    });
    const { service } = buildService(correction);

    await expect(
      service.cancelCorrectionRequest(
        buildUser('manager-1'),
        'correction-1',
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses the assigned approver too — cancel is not a way around separation of duties', async () => {
    const correction = buildCorrection({
      requestedByUserId: 'employee-user-1',
    });
    const { service } = buildService(correction);

    await expect(
      service.cancelCorrectionRequest(
        buildUser('manager-1'), // the approver, per buildCorrection's manager
        'correction-1',
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to cancel a request that has already been decided', async () => {
    const correction = buildCorrection({ status: 'APPROVED' });
    const { service } = buildService(correction);

    await expect(
      service.cancelCorrectionRequest(
        buildUser('employee-user-1'),
        'correction-1',
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to re-cancel an already-cancelled request', async () => {
    const correction = buildCorrection({ status: 'CANCELLED' });
    const { service } = buildService(correction);

    await expect(
      service.cancelCorrectionRequest(
        buildUser('employee-user-1'),
        'correction-1',
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
