import { DATA_MODULE_FEATURE } from './data-management.controller';
import { DataModuleRegistryService } from './module-registry.service';

/*
 * Basic import/export is open to every plan, but each module it reaches must
 * stay tied to the feature that sells that module's data. A module added to the
 * registry without an entry here would be importable/exportable on a plan that
 * does not include it - so this fails until someone chooses.
 */
describe('data-management module entitlements', () => {
  it('maps every registered module to the feature that sells its data', () => {
    const registry = new DataModuleRegistryService();
    const keys = registry.listModules().map((module) => module.moduleKey);

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(DATA_MODULE_FEATURE[key]).toBeDefined();
    }
  });

  it('does not map a module that is not registered', () => {
    const registry = new DataModuleRegistryService();
    const keys = new Set(registry.listModules().map((m) => m.moduleKey));
    for (const key of Object.keys(DATA_MODULE_FEATURE)) {
      expect(keys.has(key)).toBe(true);
    }
  });
});
