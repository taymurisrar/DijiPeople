import {
  GENERIC_CONFIGURATION_KEYS,
  isGenericConfigurationKey,
} from './settings-runtime.catalog';

/*
 * The generic configuration store is key-agnostic, so this allowlist is the
 * only thing deciding whether a settings page works. It had fallen seven keys
 * behind the web's settings registry, and the symptom was quiet: a 400 per
 * request and a page that rendered empty rather than erroring visibly.
 *
 * These pin the keys the web currently links to. A settings page added without
 * its key fails here instead of in a log nobody reads.
 */

/* Mirrors the settings-runtime keys in apps/web settings-adapter-registry.ts. */
const KEYS_USED_BY_SETTINGS_PAGES = [
  'assignment-rules',
  'candidate-sources',
  'delegation-rules',
  'document-checklists',
  'document-templates',
  'escalation-rules',
  'field-security',
  'interview-panel-rules',
  'number-generation-rules',
  'onboarding-plans',
  'password-login-policies',
  'retention-policies',
  'retention-rules',
  'salary-package-rules',
  'workflow-templates',
];

describe('generic configuration catalog', () => {
  it.each(KEYS_USED_BY_SETTINGS_PAGES)('accepts %s', (key) => {
    expect(isGenericConfigurationKey(key)).toBe(true);
  });

  it('rejects a key no settings page declares', () => {
    expect(isGenericConfigurationKey('not-a-real-setting')).toBe(false);
  });

  it('rejects an empty key rather than listing every record', () => {
    expect(isGenericConfigurationKey('')).toBe(false);
  });

  it('is exact about keys, since a near-miss silently returns nothing', () => {
    /* `retention-policies` and `retention-rules` are different groups. */
    expect(isGenericConfigurationKey('retention-policy')).toBe(false);
    expect(isGenericConfigurationKey('Retention-Rules')).toBe(false);
  });

  it('holds no duplicates or blanks', () => {
    for (const key of GENERIC_CONFIGURATION_KEYS) {
      expect(key.trim()).toBe(key);
      expect(key).not.toBe('');
    }
  });
});
