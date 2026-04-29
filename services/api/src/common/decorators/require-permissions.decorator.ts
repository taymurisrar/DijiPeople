import { SetMetadata } from '@nestjs/common';
import { SecurityPrivilege } from '@prisma/client';

export const REQUIRED_PERMISSIONS_KEY = 'required_permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export type RequiredRbacPermission = {
  entityKey: string;
  privilege: SecurityPrivilege;
};

export const REQUIRED_RBAC_PERMISSIONS_KEY = 'required_rbac_permissions';

export function RequirePermission(
  entityKey: string,
  action: Lowercase<keyof typeof SecurityPrivilege> | SecurityPrivilege,
) {
  return SetMetadata(REQUIRED_RBAC_PERMISSIONS_KEY, [
    {
      entityKey,
      privilege: normalizeSecurityPrivilege(action),
    },
  ] satisfies RequiredRbacPermission[]);
}

export function RequireAnyPermission(
  ...permissions: Array<{
    entityKey: string;
    action: Lowercase<keyof typeof SecurityPrivilege> | SecurityPrivilege;
  }>
) {
  return SetMetadata(
    REQUIRED_RBAC_PERMISSIONS_KEY,
    permissions.map((permission) => ({
      entityKey: permission.entityKey,
      privilege: normalizeSecurityPrivilege(permission.action),
    })) satisfies RequiredRbacPermission[],
  );
}

function normalizeSecurityPrivilege(
  action: Lowercase<keyof typeof SecurityPrivilege> | SecurityPrivilege,
) {
  const normalized = String(action).trim().toUpperCase();
  if (!(normalized in SecurityPrivilege)) {
    throw new Error(`Unsupported RBAC action: ${String(action)}`);
  }

  return SecurityPrivilege[normalized as keyof typeof SecurityPrivilege];
}
