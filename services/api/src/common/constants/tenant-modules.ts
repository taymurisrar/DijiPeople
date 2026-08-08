/*
 * The tenant-facing modules a template or a workflow can be limited to.
 *
 * A template or workflow with no module key applies everywhere; one with a key
 * applies only to that module. This list is what the authoring screens offer,
 * so a key added here becomes selectable without any further wiring.
 *
 * Keys match the ones already stored on NotificationRule and NotificationTemplate
 * (`leave`, `attendance`, `employee`), so existing rows stay valid.
 */
export const TENANT_MODULES = [
  { key: 'employee', label: 'Employees' },
  { key: 'leave', label: 'Leave' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'timesheets', label: 'Timesheets' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'claims', label: 'Claims' },
  { key: 'loans', label: 'Loans' },
  { key: 'benefits', label: 'Benefits' },
  { key: 'recruitment', label: 'Recruitment' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'performance', label: 'Performance' },
  { key: 'documents', label: 'Documents' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'auth', label: 'Access and sign-in' },
] as const;

export type TenantModuleKey = (typeof TENANT_MODULES)[number]['key'];

export const TENANT_MODULE_KEYS = TENANT_MODULES.map(
  (module) => module.key,
) as readonly TenantModuleKey[];

export function isTenantModuleKey(value: string): value is TenantModuleKey {
  return (TENANT_MODULE_KEYS as readonly string[]).includes(value);
}

export function tenantModuleLabel(key: string | null | undefined) {
  if (!key) return 'All modules';
  return TENANT_MODULES.find((module) => module.key === key)?.label ?? key;
}
