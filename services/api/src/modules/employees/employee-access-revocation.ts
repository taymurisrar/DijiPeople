import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/*
 * DP-MASTER/WP-08.S0 + S0b (BUG-4774, OD-TERMINATE-ACCESS).
 *
 * The one place that ends a terminated employee's access, shared by the
 * immediate path (EmployeesService.terminate) and the scheduled one
 * (AccessRevocationSweeperWorker) so they cannot drift apart.
 *
 * What ends access, and why this is enough:
 *  - `User.status = DISABLED`: JwtAuthGuard re-loads the access context on every
 *    request and refuses a non-ACTIVE user, so web, admin and agent tokens stop
 *    working at once, including access tokens that have not expired yet.
 *  - every live web refresh token and every live agent refresh token is revoked,
 *    so nothing can mint a new access token and the agent session row is dead.
 *
 * Idempotent and level-triggered: it decides from current state, so running it
 * twice, or after a crash between ticks, converges to the same result.
 */
export type AccessRevocationResult = {
  revoked: boolean;
  note:
    | 'USER_DISABLED_SESSIONS_REVOKED'
    | 'ALREADY_REVOKED'
    | 'TENANT_OWNER_NOT_DISABLED'
    | 'NO_LINKED_USER';
};

export async function revokeLinkedUserAccess(
  prisma: PrismaService,
  input: { tenantId: string; userId: string | null },
): Promise<AccessRevocationResult> {
  const { tenantId, userId } = input;
  if (!userId) return { revoked: false, note: 'NO_LINKED_USER' };

  // The owner is never disabled (same rule as UsersService.update); ownership
  // has to be transferred first, otherwise the tenant locks itself out.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { ownerUserId: true },
  });
  if (tenant?.ownerUserId === userId) {
    return { revoked: false, note: 'TENANT_OWNER_NOT_DISABLED' };
  }

  const now = new Date();
  const [disabled, web, agent] = await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: userId, tenantId, status: { not: UserStatus.DISABLED } },
      data: { status: UserStatus.DISABLED },
    }),
    prisma.refreshToken.updateMany({
      where: { tenantId, userId, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.agentRefreshToken.updateMany({
      where: { tenantId, userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  const changed = disabled.count + web.count + agent.count > 0;
  return {
    revoked: changed,
    note: changed ? 'USER_DISABLED_SESSIONS_REVOKED' : 'ALREADY_REVOKED',
  };
}
