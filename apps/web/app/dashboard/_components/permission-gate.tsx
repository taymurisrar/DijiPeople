"use client";

import { ReactNode } from "react";
import { useCurrentUserAccess } from "./authenticated-shell-provider";

type PermissionGateProps = {
  permission?: string;
  anyOf?: readonly string[];
  allOf?: readonly string[];
  fallback?: ReactNode;
  children: ReactNode;
};

export function PermissionGate({
  permission,
  anyOf,
  allOf,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { user, can, canAny } = useCurrentUserAccess();

  const allowed =
    (!permission || can(permission)) &&
    (!anyOf || canAny(anyOf)) &&
    (!allOf || allOf.every((permissionKey) => user.permissionKeys.includes(permissionKey)));

  return allowed ? <>{children}</> : <>{fallback}</>;
}
