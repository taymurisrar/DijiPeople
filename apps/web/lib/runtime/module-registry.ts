import type { ModuleConfig } from "./module-runtime.types";

const moduleRegistry = new Map<string, ModuleConfig>();

export function registerModule(config: ModuleConfig) {
  moduleRegistry.set(config.key, config);
}

export function getModuleConfig(moduleKey: string) {
  return moduleRegistry.get(moduleKey) ?? null;
}

export function listModuleConfigs() {
  return Array.from(moduleRegistry.values());
}

export function clearModuleRegistryForTests() {
  moduleRegistry.clear();
}

// Future phases can register real modules after existing pages are migrated.
// registerModule({ key: "example", label: "Example", entityLogicalName: "example", routeBase: "/example" });
