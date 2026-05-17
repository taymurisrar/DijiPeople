export const terminalLeadStatuses = new Set(["CONVERTED", "ARCHIVED"]);
export const terminalOnboardingStatuses = new Set(["COMPLETED", "CANCELED"]);
export const restrictedCustomerStatuses = new Set([
  "ACTIVE",
  "SUSPENDED",
  "CHURNED",
  "ARCHIVED",
]);

export function isLeadReadOnly(status: string, convertedCustomerId?: string | null) {
  return Boolean(convertedCustomerId) || terminalLeadStatuses.has(status);
}

export function isOnboardingReadOnly(
  status: string,
  tenantId?: string | null,
  tenantCreated?: boolean,
) {
  return Boolean(tenantId) || Boolean(tenantCreated) || terminalOnboardingStatuses.has(status);
}

export function isCustomerReadOnly(status: string, tenantCount = 0) {
  return tenantCount > 0 || restrictedCustomerStatuses.has(status);
}

export function getLifecycleLabel(status: string) {
  return status.replaceAll("_", " ");
}
