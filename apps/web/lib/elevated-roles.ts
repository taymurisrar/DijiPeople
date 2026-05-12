import { ROLE_KEYS } from "@/lib/security-keys";

const ELEVATED_TENANT_ROLE_KEYS = new Set<string>([
  ROLE_KEYS.GLOBAL_ADMIN,
  ROLE_KEYS.SYSTEM_ADMIN,
  ROLE_KEYS.SYSTEM_CUSTOMIZER,
]);

export function hasElevatedTenantRole(roleKeys: string[] | undefined | null) {
  return (roleKeys ?? []).some((roleKey) =>
    ELEVATED_TENANT_ROLE_KEYS.has(roleKey),
  );
}
