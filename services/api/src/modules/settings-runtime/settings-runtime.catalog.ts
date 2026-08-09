/*
 * Setting groups served by the generic configuration store.
 *
 * The store itself is key-agnostic — one table, one `settingKey` column — so
 * this set is purely an allowlist. It had drifted behind the settings pages:
 * seven groups the web already links to were missing, so every visit to them
 * returned 400 and the page rendered empty. Anything listed in the web's
 * settings adapter registry must appear here.
 */
export const GENERIC_CONFIGURATION_KEYS = new Set([
  'field-security',
  'password-login-policies',
  'salary-package-rules',
  'delegation-rules',
  'escalation-rules',
  'workflow-templates',
  'retention-rules',
  'document-templates',
  'assignment-rules',
  'candidate-sources',
  'document-checklists',
  'interview-panel-rules',
  'number-generation-rules',
  'onboarding-plans',
  'retention-policies',
]);

export function isGenericConfigurationKey(value: string) {
  return GENERIC_CONFIGURATION_KEYS.has(value);
}
