export const GENERIC_CONFIGURATION_KEYS = new Set([
  'regions',
  'fiscal-years',
  'business-date-rules',
  'field-security',
  'password-login-policies',
  'salary-package-rules',
  'delegation-rules',
  'escalation-rules',
  'workflow-templates',
  'retention-rules',
]);

export function isGenericConfigurationKey(value: string) {
  return GENERIC_CONFIGURATION_KEYS.has(value);
}
