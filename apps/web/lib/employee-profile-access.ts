import type { SessionUser } from "@/lib/auth";

const CORE_EMPLOYEE_PROFILE_EDITOR_ROLE_KEYS = new Set([
  "global-admin",
  "system-admin",
]);

export function canEditEmployeeCoreProfile(
  user: Pick<SessionUser, "roleKeys"> | null | undefined,
) {
  return (user?.roleKeys ?? []).some((roleKey) =>
    CORE_EMPLOYEE_PROFILE_EDITOR_ROLE_KEYS.has(roleKey),
  );
}
