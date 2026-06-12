import type {
  EntityMetadata,
  FormMetadata,
  ViewMetadata,
} from "./metadata-runtime.types";

const entityRegistry = new Map<string, EntityMetadata>();
const formRegistry = new Map<string, FormMetadata>();
const viewRegistry = new Map<string, ViewMetadata>();

export function registerEntityMetadata(entity: EntityMetadata) {
  entityRegistry.set(entity.logicalName, entity);
}

export function getEntityMetadata(entityLogicalName: string) {
  return entityRegistry.get(entityLogicalName) ?? null;
}

export function listEntityMetadata() {
  return Array.from(entityRegistry.values());
}

export function registerFormMetadata(form: FormMetadata) {
  formRegistry.set(form.logicalName, form);
}

export function getFormMetadata(formLogicalName: string) {
  return formRegistry.get(formLogicalName) ?? null;
}

export function listFormMetadata() {
  return Array.from(formRegistry.values());
}

export function registerViewMetadata(view: ViewMetadata) {
  viewRegistry.set(view.logicalName, view);
}

export function getViewMetadata(viewLogicalName: string) {
  return viewRegistry.get(viewLogicalName) ?? null;
}

export function listViewMetadata() {
  return Array.from(viewRegistry.values());
}

export function clearMetadataRegistryForTests() {
  entityRegistry.clear();
  formRegistry.clear();
  viewRegistry.clear();
}

// Future phases will replace this in-memory placeholder with tenant-aware,
// solution-layer-aware metadata loading and cache invalidation.
