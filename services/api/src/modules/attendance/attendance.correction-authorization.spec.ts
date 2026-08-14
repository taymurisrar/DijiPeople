import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AttendanceService } from './attendance.service';

/*
 * Authorization around attendance correction requests.
 *
 * Two defects are covered here. Approving was gated on holding
 * attendance.correction.approve, which the manager role bundle grants, with no
 * check that the actor was not the person who filed the request -- so a manager
 * could file a correction rewriting their own attendance and approve it in the
 * same breath. Separately, attendance.correction.readTeam returned an
 * unrestricted where, so "team" meant the whole tenant.
 */

const TENANT = 'tenant-1';

function buildUser(
  userId: string,
  permissionKeys: string[],
  roleKeys: string[] = [],
): AuthenticatedUser {
  return {
    userId,
    tenantId: TENANT,
    email: `${userId}@example.com`,
    roleIds: [],
    roleKeys,
    permissionKeys,
  };
}

type CorrectionSeed = {
  requestedByUserId: string;
  employeeUserId: string;
  managerUserId?: string | null;
};

function buildCorrection(seed: CorrectionSeed) {
  return {
    id: 'correction-1',
    tenantId: TENANT,
    status: 'PENDING_APPROVAL',
    requestedByUserId: seed.requestedByUserId,
    employeeId: 'employee-1',
    employee: {
      id: 'employee-1',
      employeeCode: 'E-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      preferredName: null,
      userId: seed.employeeUserId,
      manager: seed.managerUserId
        ? { id: 'employee-9', userId: seed.managerUserId }
        : null,
    },
  };
}

/*
 * Only the reads assertCanActionCorrection depends on are stubbed. Anything
 * past the authorization gate is irrelevant to these cases and is allowed to
 * fail loudly rather than be faked into looking successful.
 */
function createService(
  correction: ReturnType<typeof buildCorrection>,
  options: { pendingAssignmentFor?: string } = {},
) {
  const prisma = {
    attendanceCorrectionRequest: {
      findFirst: jest.fn(async () => correction),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    approvalAssignment: {
      findFirst: jest.fn(async (args: { where: { assignedToUserId: string } }) =>
        options.pendingAssignmentFor &&
        args.where.assignedToUserId === options.pendingAssignmentFor
          ? { id: 'assignment-1' }
          : null,
      ),
    },
  };

  const service = new AttendanceService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { log: jest.fn() } as never,
    {} as never,
    prisma as never,
  );

  return { service, prisma };
}

const APPROVER_PERMISSIONS = [
  'attendance.correction.read',
  'attendance.correction.approve',
  'attendance.correction.reject',
];

describe('AttendanceService correction self-approval', () => {
  it('refuses to let the submitter approve their own request', async () => {
    const { service } = createService(
      buildCorrection({
        requestedByUserId: 'manager-1',
        employeeUserId: 'manager-1',
      }),
    );

    await expect(
      service.approveCorrectionRequest(
        buildUser('manager-1', APPROVER_PERMISSIONS, ['manager']),
        'correction-1',
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to let the submitter reject their own request', async () => {
    const { service } = createService(
      buildCorrection({
        requestedByUserId: 'manager-1',
        employeeUserId: 'manager-1',
      }),
    );

    await expect(
      service.rejectCorrectionRequest(
        buildUser('manager-1', APPROVER_PERMISSIONS, ['manager']),
        'correction-1',
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses the subject of the correction even when someone else filed it', async () => {
    // Proxy submission: HR files it, but the employee must not wave it through.
    const { service } = createService(
      buildCorrection({
        requestedByUserId: 'hr-1',
        employeeUserId: 'employee-user-1',
      }),
    );

    await expect(
      service.approveCorrectionRequest(
        buildUser('employee-user-1', APPROVER_PERMISSIONS),
        'correction-1',
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses the submitter of a proxy request they filed for someone else', async () => {
    const { service } = createService(
      buildCorrection({
        requestedByUserId: 'manager-1',
        employeeUserId: 'employee-user-1',
      }),
    );

    await expect(
      service.approveCorrectionRequest(
        buildUser('manager-1', APPROVER_PERMISSIONS, ['manager']),
        'correction-1',
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses an unrelated employee with no approval rights', async () => {
    const { service } = createService(
      buildCorrection({
        requestedByUserId: 'employee-user-1',
        employeeUserId: 'employee-user-1',
      }),
    );

    await expect(
      service.approveCorrectionRequest(
        buildUser('bystander-1', ['attendance.correction.read']),
        'correction-1',
        {} as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still lets a manager past the gate for a subordinate request', async () => {
    const { service, prisma } = createService(
      buildCorrection({
        requestedByUserId: 'employee-user-1',
        employeeUserId: 'employee-user-1',
        managerUserId: 'manager-1',
      }),
    );

    /*
     * The authorization gate is what is under test. Everything downstream is
     * unstubbed, so reaching it at all proves the gate allowed the action --
     * and the failure that follows is never a ForbiddenException.
     */
    const error = await service
      .approveCorrectionRequest(
        buildUser('manager-1', APPROVER_PERMISSIONS, ['manager']),
        'correction-1',
        {} as never,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).not.toBeInstanceOf(ForbiddenException);
    expect(prisma.approvalAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('still lets the assigned approver past the gate without correction permissions', async () => {
    const { service } = createService(
      buildCorrection({
        requestedByUserId: 'employee-user-1',
        employeeUserId: 'employee-user-1',
      }),
      { pendingAssignmentFor: 'delegate-1' },
    );

    const error = await service
      .approveCorrectionRequest(
        buildUser('delegate-1', ['attendance.correction.read']),
        'correction-1',
        {} as never,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).not.toBeInstanceOf(ForbiddenException);
  });
});

describe('AttendanceService correction read scope', () => {
  /*
   * The default view is 'mine', which pins the query to the caller's own
   * requests and never consults the scope helper. 'pending' is the view the
   * approval inbox uses and is the one the readTeam defect actually widened.
   */
  async function capturedWhere(permissionKeys: string[]) {
    const { service, prisma } = createService(
      buildCorrection({
        requestedByUserId: 'employee-user-1',
        employeeUserId: 'employee-user-1',
      }),
    );

    await service.listCorrectionRequests(
      buildUser('manager-1', permissionKeys, ['manager']),
      { page: 1, pageSize: 25, view: 'pending' } as never,
    );

    return (
      prisma.attendanceCorrectionRequest.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
      }
    ).where;
  }

  it('keeps readTeam off the whole tenant', async () => {
    const where = await capturedWhere([
      'attendance.correction.read',
      'attendance.correction.readTeam',
    ]);

    // The defect: readTeam produced a where with no scope predicate at all.
    expect(where.OR).toEqual([
      { requestedByUserId: 'manager-1' },
      { employee: { manager: { userId: 'manager-1' } } },
    ]);
  });

  it('still constrains readTeam to the caller tenant', async () => {
    const where = await capturedWhere([
      'attendance.correction.read',
      'attendance.correction.readTeam',
    ]);

    expect(where.tenantId).toBe(TENANT);
  });

  it('leaves tenant-wide reads to attendance.correction.manage', async () => {
    const where = await capturedWhere([
      'attendance.correction.read',
      'attendance.correction.manage',
    ]);

    expect(where.OR).toBeUndefined();
    expect(where.tenantId).toBe(TENANT);
  });
});
