import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TENANT_FEATURE_DEFINITIONS } from '../../modules/tenant-settings/tenant-settings.catalog';
import {
  ENTITLEMENT_GATED_MODULES,
  ENTITLEMENT_UNGATED_MODULES,
  TENANT_FEATURE_KEY_LIST,
  isTenantFeatureKey,
} from './tenant-features';

/*
 * `tenant-features.ts` is a typed mirror of the tenant-settings catalog, kept in
 * `common/` so a guard can be typed without importing a domain module. A mirror
 * that nobody checks is a second source of truth, which is the failure mode root
 * AGENTS.md names as a regression even when it compiles.
 */
describe('tenant feature keys', () => {
  it('mirrors the tenant-settings catalog exactly, in both directions', () => {
    const catalog = TENANT_FEATURE_DEFINITIONS.map(
      (definition) => definition.key,
    ).sort();
    const mirror = [...TENANT_FEATURE_KEY_LIST].sort();

    expect(mirror).toEqual(catalog);
  });

  it('recognises a catalog key and rejects anything else', () => {
    for (const definition of TENANT_FEATURE_DEFINITIONS) {
      expect(isTenantFeatureKey(definition.key)).toBe(true);
    }

    expect(isTenantFeatureKey('payrol')).toBe(false);
    expect(isTenantFeatureKey('')).toBe(false);
  });
});

describe('entitlement module map', () => {
  it('gates only modules that exist', () => {
    const missing = Object.keys(ENTITLEMENT_GATED_MODULES).filter(
      (moduleDir) =>
        !existsSync(resolve(process.cwd(), 'src', 'modules', moduleDir)),
    );

    expect(missing).toEqual([]);
  });

  it('gates every module against a real feature key', () => {
    for (const key of Object.values(ENTITLEMENT_GATED_MODULES)) {
      expect(isTenantFeatureKey(key)).toBe(true);
    }
  });

  /*
   * A module in both maps is a decision recorded twice and contradicted once.
   * The ungated map exists so an omission reads as deliberate; that only works
   * while the two are disjoint.
   */
  it('never lists a module as both gated and deliberately ungated', () => {
    const gated = new Set(Object.keys(ENTITLEMENT_GATED_MODULES));
    const overlap = Object.keys(ENTITLEMENT_UNGATED_MODULES).filter((name) =>
      gated.has(name),
    );

    expect(overlap).toEqual([]);
  });

  it('gives every deliberately ungated module a reason', () => {
    for (const [name, reason] of Object.entries(ENTITLEMENT_UNGATED_MODULES)) {
      expect(`${name}: ${reason}`.length).toBeGreaterThan(name.length + 30);
    }
  });

  /*
   * The five keys the four plans actually differ on. If a plan ever stops
   * differentiating on one of these, or starts differentiating on a new one,
   * this list and the gated map have to be revisited together.
   */
  it('gates every key the shipped plans differentiate on', () => {
    const differentiating = [
      'timesheets',
      'projects',
      'recruitment',
      'onboarding',
      'payroll',
    ];
    const gatedKeys = new Set(Object.values(ENTITLEMENT_GATED_MODULES));

    for (const key of differentiating) {
      expect(gatedKeys.has(key as never)).toBe(true);
    }
  });
});
