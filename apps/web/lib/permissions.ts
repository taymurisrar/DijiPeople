export const MANAGEMENT_PERMISSION_KEYS = [
  "users.read",
  "users.create",
  "users.update",
  "users.assign-roles",
  "roles.read",
  "roles.create",
  "roles.update",
  "roles.assign-permissions",
  "settings.update",
  "departments.create",
  "departments.update",
  "designations.create",
  "designations.update",
  "locations.create",
  "locations.update",
  "employees.create",
  "employees.update",
  "employees.terminate",
  "leave-requests.approve",
  "leave-requests.reject",
  "attendance.manage",
  "timesheets.approve",
  "timesheets.reject",
  "timesheets.import",
  "timesheets.export",
  "timesheets.template.export",
  "timesheets.lock",
  "timesheets.unlock",
  "timesheets.settings.update",
  "projects.create",
  "projects.update",
  "projects.assign",
  "recruitment.create",
  "recruitment.update",
  "recruitment.advance",
  "onboarding.create",
  "onboarding.update",
  "payroll.write",
  "payroll.run",
  "payroll.review",
  "payroll.finalize",
  "payroll.export",
  "payroll.settings.update",
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
