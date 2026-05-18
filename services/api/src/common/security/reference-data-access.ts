import type { AuthenticatedUser } from '../interfaces/authenticated-request.interface';
import { hasElevatedTenantRole } from './elevated-tenant-roles';

export function canReadManagedReferenceData(
  user: Pick<AuthenticatedUser, 'permissionKeys' | 'roleKeys'>,
  permissionKey: string,
) {
  return (
    hasElevatedTenantRole(user) ||
    (user.permissionKeys ?? []).includes(permissionKey)
  );
}

export function constrainReferenceListQuery<T extends { isActive?: boolean }>(
  user: Pick<AuthenticatedUser, 'permissionKeys' | 'roleKeys'>,
  query: T,
  permissionKey: string,
): T {
  if (canReadManagedReferenceData(user, permissionKey)) {
    return query;
  }

  // Self-service users only need safe active labels for rendering profile UI.
  return { ...query, isActive: true };
}
