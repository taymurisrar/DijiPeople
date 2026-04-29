import { PERMISSION_KEYS } from "@/lib/security-keys";

export const MANAGEMENT_PERMISSION_KEYS = [
  PERMISSION_KEYS.USERS_READ,
  PERMISSION_KEYS.USERS_CREATE,
  PERMISSION_KEYS.USERS_UPDATE,
  PERMISSION_KEYS.USERS_ASSIGN_ROLES,
  PERMISSION_KEYS.ROLES_READ,
  PERMISSION_KEYS.ROLES_CREATE,
  PERMISSION_KEYS.ROLES_UPDATE,
  PERMISSION_KEYS.ROLES_ASSIGN_PERMISSIONS,
  PERMISSION_KEYS.SETTINGS_UPDATE,
  "departments.create",
  "departments.update",
  "designations.create",
  "designations.update",
  "locations.create",
  "locations.update",
  PERMISSION_KEYS.EMPLOYEES_CREATE,
  PERMISSION_KEYS.EMPLOYEES_UPDATE,
  PERMISSION_KEYS.EMPLOYEES_TERMINATE,
  "leave-requests.approve",
  "leave-requests.reject",
  PERMISSION_KEYS.ATTENDANCE_MANAGE,
  PERMISSION_KEYS.TIMESHEETS_APPROVE,
  PERMISSION_KEYS.TIMESHEETS_REJECT,
  PERMISSION_KEYS.TIMESHEETS_IMPORT,
  PERMISSION_KEYS.TIMESHEETS_EXPORT,
  PERMISSION_KEYS.TIMESHEETS_TEMPLATE_EXPORT,
  PERMISSION_KEYS.TIMESHEETS_LOCK,
  PERMISSION_KEYS.TIMESHEETS_UNLOCK,
  PERMISSION_KEYS.TIMESHEETS_SETTINGS_UPDATE,
  PERMISSION_KEYS.PROJECTS_CREATE,
  PERMISSION_KEYS.PROJECTS_UPDATE,
  PERMISSION_KEYS.PROJECTS_ASSIGN,
  PERMISSION_KEYS.RECRUITMENT_CREATE,
  PERMISSION_KEYS.RECRUITMENT_UPDATE,
  PERMISSION_KEYS.RECRUITMENT_ADVANCE,
  PERMISSION_KEYS.ONBOARDING_CREATE,
  PERMISSION_KEYS.ONBOARDING_UPDATE,
  PERMISSION_KEYS.PAYROLL_WRITE,
  PERMISSION_KEYS.PAYROLL_RUN,
  PERMISSION_KEYS.PAYROLL_REVIEW,
  PERMISSION_KEYS.PAYROLL_FINALIZE,
  PERMISSION_KEYS.PAYROLL_EXPORT,
  PERMISSION_KEYS.PAYROLL_SETTINGS_UPDATE,
  PERMISSION_KEYS.CUSTOMIZATION_READ,
  PERMISSION_KEYS.CUSTOMIZATION_PUBLISH,
  "customization.tables.update",
  "customization.columns.create",
  "customization.columns.update",
  "customization.columns.delete",
  "customization.views.create",
  "customization.views.update",
  "customization.views.delete",
  "customization.forms.create",
  "customization.forms.update",
  "customization.forms.delete",
] as const;

export function hasPermission(
  permissionKeys: string[] | undefined,
  permissionKey: string,
) {
  return permissionKeys?.includes(permissionKey) ?? false;
}

export function hasAnyPermission(
  permissionKeys: string[] | undefined,
  permissionCandidates: readonly string[],
) {
  if (!permissionKeys || permissionKeys.length === 0) {
    return false;
  }

  return permissionCandidates.some((permissionKey) =>
    permissionKeys.includes(permissionKey),
  );
}

export function hasAllPermissions(
  permissionKeys: string[] | undefined,
  permissionCandidates: readonly string[],
) {
  if (!permissionKeys || permissionKeys.length === 0) {
    return false;
  }

  return permissionCandidates.every((permissionKey) =>
    permissionKeys.includes(permissionKey),
  );
}

export function isSelfServiceUser(permissionKeys: string[] | undefined) {
  return !hasAnyPermission(permissionKeys, MANAGEMENT_PERMISSION_KEYS);
  
}
