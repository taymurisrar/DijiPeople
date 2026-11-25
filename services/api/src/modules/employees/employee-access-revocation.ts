import { EmployeeEmploymentStatus, Prisma, UserStatus } from '@prisma/client';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from '../../common/constants/audit-actions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/*
 * DP-MASTER/WP-08 (BUG-4774, OD-TERMINATE-ACCESS, H02, S01).
 *
 * The one place that ends a terminated employee's access, used by the terminate
 * command and by the scheduled sweeper so they cannot drift apart.
 *
 * Everything that must be true together happens in ONE transaction, under a row
 * lock on the Employee:
 *   employee status + date  ->  user DISABLED  ->  web and agent tokens revoked
 *   ->  audit row.
 * There is no instant at which the employee reads TERMINATED while the user can
 * still sign in, and a crash cannot leave one half done.
 *
 * The lock is what makes the sweeper safe against a concurrent rehire or
 * reschedule: those writes UPDATE the same Employee row, so they either finish
 * first (the sweeper then re-reads ACTIVE / a later date and does nothing) or wait
 * until revocation has committed. The sweeper never acts on a stale read.
 *
 * Auth enforces the effective date itself (AuthAccessService.loadAccessContext),
 * so a missed or late sweep cannot extend access past the date.
 */
export type AccessRevocationNote =
  | 'USER_DISABLED_SESSIONS_REVOKED'
  | 'ALREADY_REVOKED'
  | 'TENANT_OWNER_NOT_DISABLED'
  | 'NO_LINKED_USER'
  | 'EMPLOYEE_NOT_FOUND'
  | 'NOT_TERMINATED'
  | 'NOT_DUE'
  | 'FUTURE_DATED_REVOCATION_SCHEDULED';

export type AccessRevocationResult = {
  revoked: boolean;
  note: AccessRevocationNote;
};

type LockedEmployee = {
  id: string;
  userId: string | null;
  employmentStatus: EmployeeEmploymentStatus;
  terminationDate: Date | null;
};

/** Row-locks the employee. Returns null when it does not exist in the tenant. */
export async function lockEmployee(
  tx: Prisma.TransactionClient,
  tenantId: string,
  employeeId: string,
): Promise<LockedEmployee | null> {
  const rows = await tx.$queryRaw<LockedEmployee[]>`
    SELECT "id", "userId", "employmentStatus", "terminationDate"
      FROM "Employee"
     WHERE "id" = ${employeeId} AND "tenantId" = ${tenantId}
       AND "isDeleted" = false AND "deletedAt" IS NULL
       FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * Disables the user and revokes every live web and agent refresh token. Must run
 * inside the caller's transaction. Idempotent: it decides from current state, and
 * it also revokes tokens that outlived a user who was already disabled.
 */
export async function applyUserAccessRevocation(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string | null,
): Promise<AccessRevocationResult> {
  if (!userId) return { revoked: false, note: 'NO_LINKED_USER' };

  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { ownerUserId: true },
  });
  // The owner is never disabled (same rule as UsersService.update); ownership has
  // to be transferred first or the tenant locks itself out.
  if (tenant?.ownerUserId === userId) {
    return { revoked: false, note: 'TENANT_OWNER_NOT_DISABLED' };
  }

  const now = new Date();
  const disabled = await tx.user.updateMany({
    where: { id: userId, tenantId, status: { not: UserStatus.DISABLED } },
    data: { status: UserStatus.DISABLED },
  });
  const web = await tx.refreshToken.updateMany({
    where: { tenantId, userId, revokedAt: null },
    data: { revokedAt: now },
  });
  const agent = await tx.agentRefreshToken.updateMany({
    where: { tenantId, userId, revokedAt: null },
    data: { revokedAt: now },
  });

  const changed = disabled.count + web.count + agent.count > 0;
  return {
    revoked: changed,
    note: changed ? 'USER_DISABLED_SESSIONS_REVOKED' : 'ALREADY_REVOKED',
  };
}

/**
 * Sweeper entry point: revokes access for one employee only if, under the lock,
 * they are still TERMINATED and their date has arrived. A rehired or rescheduled
 * employee is left untouched. The audit row commits with the revocation.
 */
export async function revokeAccessIfDue(
  prisma: PrismaService,
  audit: AuditService,
  input: { tenantId: string; employeeId: string; now?: Date },
): Promise<AccessRevocationResult> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const employee = await lockEmployee(tx, input.tenantId, input.employeeId);
    if (!employee)
      return { revoked: false, note: 'EMPLOYEE_NOT_FOUND' as const };
    if (employee.employmentStatus !== EmployeeEmploymentStatus.TERMINATED) {
      return { revoked: false, note: 'NOT_TERMINATED' as const };
    }
    if (
      !employee.terminationDate ||
      employee.terminationDate.getTime() > now.getTime()
    ) {
      return { revoked: false, note: 'NOT_DUE' as const };
    }

    const result = await applyUserAccessRevocation(
      tx,
      input.tenantId,
      employee.userId,
    );
    if (result.revoked) {
      await audit.log(
        {
          tenantId: input.tenantId,
          actorUserId: null,
          action: AUDIT_ACTIONS.EMPLOYEE_ACCESS_REVOKED,
          entityType: AUDIT_ENTITY_TYPES.EMPLOYEE,
          entityId: input.employeeId,
          afterSnapshot: {
            source: 'ACCESS_REVOCATION_SWEEPER',
            note: result.note,
          },
        },
        tx,
      );
    }
    return result;
  });
}
