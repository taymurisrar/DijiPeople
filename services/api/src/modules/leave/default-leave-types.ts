import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * The leave types every tenant starts with. Shared by `seed-config` (which
 * reconciles existing tenants on each deploy) and by tenant provisioning, so a
 * tenant created between two deploys is not left without any leave type and
 * unable to take its first leave request (DP-QA-011 / OBS-008).
 */
export const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual Leave', code: 'ANNUAL', category: 'PAID', isPaid: true },
  { name: 'Sick Leave', code: 'SICK', category: 'PAID', isPaid: true },
  { name: 'Casual Leave', code: 'CASUAL', category: 'PAID', isPaid: true },
  { name: 'Unpaid Leave', code: 'UNPAID', category: 'UNPAID', isPaid: false },
] as const;

/**
 * Insert-only: a type the tenant already has (by code or name) is left exactly
 * as it is, so an admin's rename or deactivation survives a re-run. Returns the
 * number of rows created.
 */
export async function ensureDefaultLeaveTypes(
  db: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
  actorUserId?: string,
): Promise<number> {
  const result = await db.leaveType.createMany({
    data: DEFAULT_LEAVE_TYPES.map((leaveType) => ({
      tenantId,
      ...leaveType,
      requiresApproval: true,
      isActive: true,
      createdById: actorUserId,
      updatedById: actorUserId,
    })),
    skipDuplicates: true,
  });

  return result.count;
}
