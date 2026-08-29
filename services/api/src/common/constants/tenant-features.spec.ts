import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { TENANT_FEATURE_DEFINITIONS } from '../../modules/tenant-settings/tenant-settings.catalog';
import {
  ENTITLEMENT_GATED_MODULES,
  ENTITLEMENT_UNGATED_FEATURE_KEYS,
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

/*
 * The structural guard, and the one that matters most over time.
 *
 * A test naming the modules that happen to be gated today goes green while the
 * next capability ships ungated — which is the defect class this record is:
 * something built, and nothing reaching it. So the assertion is over the plan
 * catalog rather than over the gate: every key a plan can withhold must be
 * accounted for by one register or the other, and a new one belongs to neither
 * until somebody decides.
 */
describe('entitlement coverage of the plan catalog', () => {
  it('accounts for every feature key a plan can withhold', () => {
    const gatedKeys = new Set<string>(Object.values(ENTITLEMENT_GATED_MODULES));
    const exemptKeys = new Set<string>(
      Object.keys(ENTITLEMENT_UNGATED_FEATURE_KEYS),
    );

    const unaccounted = TENANT_FEATURE_DEFINITIONS.map(
      (definition) => definition.key,
    ).filter((key) => !gatedKeys.has(key) && !exemptKeys.has(key));

    expect(unaccounted).toEqual([]);
  });

  it('never both gates and exempts the same feature key', () => {
    const gatedKeys = new Set<string>(Object.values(ENTITLEMENT_GATED_MODULES));
    const contradictions = Object.keys(ENTITLEMENT_UNGATED_FEATURE_KEYS).filter(
      (key) => gatedKeys.has(key),
    );

    expect(contradictions).toEqual([]);
  });

  it('exempts only keys the catalog actually defines', () => {
    const catalog = new Set<string>(
      TENANT_FEATURE_DEFINITIONS.map((definition) => definition.key),
    );
    const unknown = Object.keys(ENTITLEMENT_UNGATED_FEATURE_KEYS).filter(
      (key) => !catalog.has(key),
    );

    expect(unknown).toEqual([]);
  });

  it('gives every exemption a stated reason', () => {
    for (const [key, reason] of Object.entries(
      ENTITLEMENT_UNGATED_FEATURE_KEYS,
    )) {
      expect(typeof reason).toBe('string');
      expect((reason ?? '').length).toBeGreaterThan(30);
      expect(key.length).toBeGreaterThan(0);
    }
  });
});
