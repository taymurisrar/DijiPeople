import type {
  SolutionComponent,
  SolutionManifest,
} from "./solution-runtime.types";

const solutionRegistry = new Map<string, SolutionManifest>();

export function registerSolutionManifest(manifest: SolutionManifest) {
  solutionRegistry.set(manifest.name, manifest);
}

export function getSolutionManifest(solutionName: string) {
  return solutionRegistry.get(solutionName) ?? null;
}

export function listSolutionManifests() {
  return Array.from(solutionRegistry.values());
}

export function listSolutionComponents(solutionName: string) {
  return solutionRegistry.get(solutionName)?.components ?? [];
}

export function findSolutionComponent(
  solutionName: string,
  componentLogicalName: string,
): SolutionComponent | null {
  return (
    solutionRegistry
      .get(solutionName)
      ?.components.find(
        (component) => component.logicalName === componentLogicalName,
      ) ?? null
  );
}

export function clearSolutionRegistryForTests() {
  solutionRegistry.clear();
}

// Future phases will validate import/export readiness, managed layering,
// dependency graphs, and uninstall impact before mutating tenant metadata.
