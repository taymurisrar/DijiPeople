import { CustomizationSolutionComponentType } from '@prisma/client';

export type CustomizationDependencyIssue = {
  severity: 'error' | 'warning' | 'info';
  componentId?: string | null;
  componentType?: string | null;
  message: string;
  blocking: boolean;
};

export type CustomizationDependencyComponent = {
  id: string;
  componentType: CustomizationSolutionComponentType;
  objectId: string;
  objectKey: string;
  tableId?: string | null;
  isSystem: boolean;
  isCustom: boolean;
  metadataJson?: unknown;
};

export function validatePackageComponentDependencies(input: {
  components: readonly CustomizationDependencyComponent[];
  duplicateKeys?: readonly string[];
  missingBaseComponentKeys?: readonly string[];
  defaultComponentKeys?: readonly string[];
  referencedFieldKeys?: readonly string[];
  availableComponentKeys?: readonly string[];
}) {
  const issues: CustomizationDependencyIssue[] = [];

  for (const key of input.duplicateKeys ?? []) {
    issues.push({
      severity: 'error',
      componentId: null,
      componentType: null,
      message: `Duplicate package component membership detected for ${key}.`,
      blocking: true,
    });
  }
  for (const key of input.missingBaseComponentKeys ?? []) {
    issues.push({
      severity: 'error',
      componentId: null,
      componentType: null,
      message: `Missing base component for ${key}.`,
      blocking: true,
    });
  }
  for (const key of input.defaultComponentKeys ?? []) {
    issues.push({
      severity: 'warning',
      componentId: null,
      componentType: null,
      message: `${key} is a default component. Deactivation or deletion requires replacement metadata.`,
      blocking: false,
    });
  }
  for (const key of input.referencedFieldKeys ?? []) {
    issues.push({
      severity: 'info',
      componentId: null,
      componentType: 'field',
      message: `Field ${key} may be referenced by Forms, Views, Rules, or Automations.`,
      blocking: false,
    });
  }

  const availableKeys = new Set([
    ...input.components.flatMap((component) => [
      component.id,
      component.objectId,
      component.objectKey,
      localKey(component.objectKey),
    ]),
    ...(input.availableComponentKeys ?? []).flatMap((key) => [
      key,
      localKey(key),
    ]),
  ]);
  for (const component of input.components) {
    for (const dependency of readMetadataDependencies(component.metadataJson)) {
      if (availableKeys.has(dependency)) continue;
      issues.push({
        severity: 'error',
        componentId: component.id,
        componentType: component.componentType,
        message: `${component.objectKey} references missing metadata component ${dependency}.`,
        blocking: true,
      });
    }
  }

  if (input.components.length === 0) {
    issues.push({
      severity: 'info',
      componentId: null,
      componentType: null,
      message: 'No draft package components are pending publish.',
      blocking: false,
    });
  }

  return issues;
}

function localKey(value: string) {
  const parts = value.split('.');
  return parts[parts.length - 1] ?? value;
}

export function readMetadataDependencies(value: unknown): string[] {
  const dependencies = new Set<string>();
  visitMetadata(value, '', dependencies);
  return [...dependencies];
}

const REFERENCE_KEYS = new Set([
  'baseComponentId',
  'componentId',
  'componentKey',
  'dependsOnFieldId',
  'fieldId',
  'fieldLogicalName',
  'relationshipId',
  'relationshipName',
  'relatedListId',
  'ruleId',
  'ruleKey',
  'widgetId',
  'widgetKey',
]);

function visitMetadata(
  value: unknown,
  parentKey: string,
  dependencies: Set<string>,
) {
  if (typeof value === 'string') {
    if (REFERENCE_KEYS.has(parentKey) && value.trim()) {
      dependencies.add(value.trim());
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) visitMetadata(item, parentKey, dependencies);
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if (key === 'dependencies' && Array.isArray(child)) {
      for (const dependency of child) {
        if (typeof dependency === 'string' && dependency.trim()) {
          dependencies.add(dependency.trim());
        } else {
          visitMetadata(dependency, key, dependencies);
        }
      }
      continue;
    }
    visitMetadata(child, key, dependencies);
  }
}
