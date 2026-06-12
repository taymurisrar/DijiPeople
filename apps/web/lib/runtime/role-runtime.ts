import type { RuntimeRoleValue } from "./security-runtime.types";

const ROLE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "global-admin": ["global-administrator", "global-administrator-role"],
  "global-administrator": ["global-admin"],
  "system-admin": ["system-administrator", "system-administrator-role"],
  "system-administrator": ["system-admin"],
  hr: [],
  "hr-manager": [],
};

export function normalizeRuntimeRole(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

export function hasAnyRuntimeRole(
  userRoles: readonly RuntimeRoleValue[] | undefined | null,
  allowedRoles: readonly string[],
) {
  const allowed = new Set(
    allowedRoles.flatMap((role) => runtimeRoleVariants(role)),
  );
  const userRoleValues = flattenRuntimeRoles(userRoles);

  return userRoleValues.some((role) =>
    runtimeRoleVariants(role).some((variant) => allowed.has(variant)),
  );
}

export const hasAnyRole = hasAnyRuntimeRole;

function runtimeRoleVariants(value: string) {
  const normalized = normalizeRuntimeRole(value);
  return [normalized, ...(ROLE_ALIASES[normalized] ?? [])];
}

export function flattenRuntimeRoles(
  roles: readonly RuntimeRoleValue[] | undefined | null,
) {
  const values: string[] = [];

  for (const role of roles ?? []) {
    collectRuntimeRoleValues(role, values);
  }

  return [...new Set(values.filter(Boolean))];
}

function collectRuntimeRoleValues(role: RuntimeRoleValue, values: string[]) {
  if (Array.isArray(role)) {
    for (const nestedRole of role) {
      collectRuntimeRoleValues(nestedRole, values);
    }
    return;
  }

  if (typeof role === "string") {
    values.push(role);
    return;
  }

  const roleRecord = role as Exclude<
    RuntimeRoleValue,
    string | readonly RuntimeRoleValue[]
  >;

  for (const key of ["name", "displayName", "slug", "key", "id"] as const) {
    const value = roleRecord[key];
    if (typeof value === "string") values.push(value);
  }

  if (Array.isArray(roleRecord.roles)) {
    for (const nestedRole of roleRecord.roles) {
      collectRuntimeRoleValues(nestedRole, values);
    }
  }
}
