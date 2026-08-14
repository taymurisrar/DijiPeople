import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  type PlatformPermission,
  userHasPlatformPermission,
} from '../platform-auth/platform-permissions';

/**
 * Platform Admin legitimately reads across tenants, so the usual "filter by
 * request.user.tenantId" rule cannot apply here. What replaces it is explicit:
 * the caller must carry a platform identity, must hold the platform permission
 * the operation needs, and the tenant must be addressed by an id that is looked
 * up and confirmed before anything is read or written.
 *
 * Every write below therefore goes through `assertTenantPlatformAccess`, and
 * every subsequent query is scoped by the id it returned — never by an id taken
 * from a request body.
 */
export function assertTenantPlatformAccess(
  user: AuthenticatedUser,
  permission: PlatformPermission,
) {
  if (!user.platform?.id) {
    throw new ForbiddenException('Platform access is required.');
  }
  if (!userHasPlatformPermission(user, permission)) {
    throw new ForbiddenException(
      `The ${permission} platform permission is required.`,
    );
  }
}

/**
 * A handful of operations are irreversible enough that permission alone is not
 * the right bar — tenant erasure destroys data no restore path can bring back.
 * Those additionally require an elevated platform role.
 */
export function assertPlatformAdministrator(user: AuthenticatedUser) {
  if (!user.platform?.id) {
    throw new ForbiddenException('Platform access is required.');
  }
  if (
    !['SUPER_ADMIN', 'PLATFORM_OWNER', 'PLATFORM_ADMIN'].includes(
      user.platform.role ?? '',
    )
  ) {
    throw new ForbiddenException('Platform administrator access is required.');
  }
}

export async function loadTenantOrThrow(
  prisma: PrismaService,
  tenantId: string,
) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      displayName: true,
      legalName: true,
      slug: true,
      tenantCode: true,
      status: true,
      subStatus: true,
      customerAccountId: true,
      ownerUserId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!tenant) {
    throw new NotFoundException('Tenant was not found.');
  }
  return tenant;
}

/**
 * The display name of the platform operator behind a request.
 *
 * Audit and receipt rows record who acted, and "a UUID" is not an answer an
 * auditor can use. The platform identity is looked up rather than trusted from
 * the token, which carries only the id and role.
 */
export async function resolvePlatformActor(
  prisma: PrismaService,
  user: AuthenticatedUser,
) {
  if (!user.platform?.id) {
    return { id: null, name: 'System', email: null };
  }
  const actor = await prisma.platformUser.findUnique({
    where: { id: user.platform.id },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!actor) {
    return { id: user.platform.id, name: user.email, email: user.email };
  }
  return {
    id: actor.id,
    name: `${actor.firstName} ${actor.lastName}`.trim() || actor.email,
    email: actor.email,
  };
}
