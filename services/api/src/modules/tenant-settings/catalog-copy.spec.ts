import {
  TENANT_FEATURE_DEFINITIONS,
  TENANT_SETTING_CATEGORIES,
} from './tenant-settings.catalog';

/**
 * BUG-1307 — this catalog is customer-facing copy, not internal metadata.
 *
 * `TENANT_FEATURE_DEFINITIONS` feeds the module list on the **public**
 * `/features` and `/plans` pages as well as the tenant settings screens, so a
 * string written here is read by prospects deciding whether to buy. The
 * Timesheets entry began `MONTHLY timesheets, ...` — a raw `SCREAMING_SNAKE`
 * enum value pasted into prose and never recased. It shipped, and sat on two
 * marketing pages.
 *
 * Nothing validated catalog copy, which is why a defect this visible survived:
 * every reviewer reads the *shape* of a catalog entry and skims its strings.
 *
 * These assert the property rather than the one string, so the whole catalog is
 * covered and the next paste is caught rather than this one being pinned.
 */

/** `MONTHLY`, `PER_SEAT`, `SCREAMING_SNAKE` — an identifier wearing prose. */
const SCREAMING_SNAKE = /\b[A-Z]{2,}(?:_[A-Z]+)*\b/;

/**
 * Acronyms that are legitimately upper-case in ordinary English. A rule that
 * banned every capitalised run would fail on real copy and get deleted, which
 * is worse than not having it.
 */
const ALLOWED = new Set([
  'HR',
  'API',
  'SLA',
  'PDF',
  'CSV',
  'ID',
  'IDS',
  'URL',
  'VAT',
  'OK',
  'AM',
  'PM',
  'UI',
  'UX',
  'IT',
  'DLP',
]);

function offendingTokens(text: string): string[] {
  return (text.match(new RegExp(SCREAMING_SNAKE, 'g')) ?? []).filter(
    (token) => !ALLOWED.has(token),
  );
}

describe('tenant settings catalog copy', () => {
  it('has feature definitions to check, so this is not vacuously passing', () => {
    expect(TENANT_FEATURE_DEFINITIONS.length).toBeGreaterThan(5);
  });

  it('carries no raw enum value in any feature description', () => {
    const offenders = TENANT_FEATURE_DEFINITIONS.flatMap((feature) => {
      const tokens = offendingTokens(feature.description ?? '');
      return tokens.length ? [`${feature.key}: ${tokens.join(', ')}`] : [];
    });

    expect(offenders).toEqual([]);
  });

  it('carries no raw enum value in any feature label', () => {
    const offenders = TENANT_FEATURE_DEFINITIONS.flatMap((feature) => {
      const tokens = offendingTokens(feature.label ?? '');
      return tokens.length ? [`${feature.key}: ${tokens.join(', ')}`] : [];
    });

    expect(offenders).toEqual([]);
  });

  it('carries no raw enum value in any category label', () => {
    const offenders = TENANT_SETTING_CATEGORIES.flatMap((category) => {
      const tokens = offendingTokens(category.label ?? '');
      return tokens.length ? [`${category.key}: ${tokens.join(', ')}`] : [];
    });

    expect(offenders).toEqual([]);
  });

  // The specific string this was written for, so the record has a named case.
  it('describes timesheets in sentence case', () => {
    const timesheets = TENANT_FEATURE_DEFINITIONS.find(
      (feature) => feature.key === 'timesheets',
    );

    expect(timesheets).toBeDefined();
    expect(timesheets?.description).not.toContain('MONTHLY');
    expect(timesheets?.description).toContain('Monthly');
  });

  // A description that is customer-facing should read as a sentence.
  it('gives every feature a non-empty description', () => {
    for (const feature of TENANT_FEATURE_DEFINITIONS) {
      expect(feature.description?.trim().length ?? 0).toBeGreaterThan(10);
    }
  });
});
