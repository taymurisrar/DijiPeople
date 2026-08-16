import { DEFAULT_PLAN_DEFINITIONS } from '../super-admin/plans.catalog';
import { TENANT_FEATURE_DEFINITIONS } from '../tenant-settings/tenant-settings.catalog';

/**
 * Contract between what the product gates and what the public site advertises.
 *
 * The public Features and Plans pages render from the feature catalogue the
 * commercial config API returns, which is derived from
 * `TENANT_FEATURE_DEFINITIONS` — the same list the product gates modules on.
 * These assertions are what stop that arrangement decaying back into a
 * marketing matrix maintained by hand.
 *
 * The failure being prevented is specific: the public page previously listed
 * twelve hardcoded cards that had drifted from the catalogue in both
 * directions. It advertised "Multi-tenant architecture" and "Reporting" — which
 * are not entitlement features — while omitting Organization, Projects and
 * Notifications, which are.
 */
describe('public feature catalogue contract', () => {
  const catalogKeys = new Set(TENANT_FEATURE_DEFINITIONS.map((f) => f.key));

  it('every plan only grants features that exist in the catalogue', () => {
    // A plan granting an unknown key would show a blank row in the public
    // comparison, or silently grant nothing.
    for (const plan of DEFAULT_PLAN_DEFINITIONS) {
      for (const featureKey of plan.enabledFeatureKeys) {
        expect(catalogKeys.has(featureKey)).toBe(true);
      }
    }
  });

  it('every catalogue feature carries the metadata the public page renders', () => {
    for (const feature of TENANT_FEATURE_DEFINITIONS) {
      expect(feature.key).toBeTruthy();
      expect(feature.label).toBeTruthy();
      // The description is shown verbatim to prospects, so an empty one is a
      // blank card rather than a missing nicety.
      expect(feature.description?.length ?? 0).toBeGreaterThan(10);
      expect(feature.categoryKey).toBeTruthy();
      expect(feature.categoryLabel).toBeTruthy();
      expect(typeof feature.categoryOrder).toBe('number');
      expect(typeof feature.sortOrder).toBe('number');
    }
  });

  it('feature keys are unique', () => {
    expect(catalogKeys.size).toBe(TENANT_FEATURE_DEFINITIONS.length);
  });

  it('seeded plans nest, so "everything in X, plus" is accurate', () => {
    // The plan cards claim a hierarchy. If the seeded entitlements ever stop
    // nesting, the landing page falls back to listing each plan outright — but
    // this asserts the claim holds for the plans actually shipped.
    const ordered = [...DEFAULT_PLAN_DEFINITIONS].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = new Set<string>(ordered[index - 1].enabledFeatureKeys);
      const current = new Set<string>(ordered[index].enabledFeatureKeys);

      for (const key of previous) {
        expect(current.has(key)).toBe(true);
      }
    }
  });

  it('the top plan grants every visible catalogue feature', () => {
    // Otherwise the comparison table has a row nothing can reach, which reads
    // to a buyer as a capability we sell and nobody can buy.
    const ordered = [...DEFAULT_PLAN_DEFINITIONS].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const topPlan = new Set<string>(
      ordered[ordered.length - 1].enabledFeatureKeys,
    );

    for (const feature of TENANT_FEATURE_DEFINITIONS.filter(
      (candidate) => candidate.isVisible,
    )) {
      expect(topPlan.has(feature.key)).toBe(true);
    }
  });

  it('every category the public page orders explicitly still exists', () => {
    // Mirrors CATEGORY_DISPLAY_ORDER in apps/landing/lib/feature-presentation.ts.
    // A category renamed server-side without updating that list would silently
    // drop to the end of the page rather than breaking, so this names it here.
    const knownCategories = new Set(
      TENANT_FEATURE_DEFINITIONS.map((feature) => feature.categoryKey),
    );

    for (const categoryKey of [
      'core-hr',
      'workforce',
      'payroll-finance',
      'talent',
      'work-management',
      'platform',
    ]) {
      expect(knownCategories.has(categoryKey)).toBe(true);
    }
  });
});
