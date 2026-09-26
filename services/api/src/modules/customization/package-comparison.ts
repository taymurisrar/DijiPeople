/*
 * Compares an artifact against the workspace it is about to land in.
 *
 * TASK-0033 / EXECPLAN-0052. Pure: the caller reads the target's state once
 * (batched) and hands it in, so every classification rule is testable without
 * a database and the same engine can later power package diff and environment
 * diff.
 *
 * The one rule that governs everything else: an import never overwrites what
 * it does not own. A component created by DijiPeople Core, or by a different
 * package, is a CONFLICT for a package that tries to create it — the package
 * may only extend it through a layer. And a definition change that would
 * destroy stored data (a field's type, a lookup's target, a component's parent)
 * is a CONFLICT even inside the package's own upgrade.
 */
import {
  componentChecksum,
  type PortableComponent,
  type PortableComponentInput,
} from './package-artifact';

export type ComparisonStatus =
  | 'NEW'
  | 'MATCHING'
  | 'UPDATE'
  | 'TARGET_MODIFIED'
  | 'CONFLICT'
  | 'MISSING_DEPENDENCY'
  | 'INCOMPATIBLE'
  | 'SKIPPED';

export type TargetEntry = {
  /* Who created the component in the target, if anyone. */
  ownerKind: 'core' | 'package' | 'unowned';
  ownerPackageKey: string | null;
  ownerPackageName: string | null;
  /* The importing package created the base here (re-install or upgrade). */
  ownedByImportingPackage: boolean;
  /*
   * The importing package's own layer on this key as it stands here, or
   * null. Distinct from ownership: a package layers on Core fields it will
   * never own.
   */
  current: PortableComponentInput | null;
  /* The checksum this package's last install wrote, to detect local edits. */
  installedChecksum: string | null;
  /* The base object's normalized definition, whoever owns it. */
  definition: Record<string, unknown> | null;
};

export type ComparisonItem = {
  key: string;
  type: string;
  objectKey: string;
  layerAction: string;
  status: ComparisonStatus;
  /* What execution will do with it. */
  apply: 'create' | 'update' | 'none';
  blocking: boolean;
  messages: string[];
  changedFields: string[];
};

export type ComparisonResult = {
  items: ComparisonItem[];
  removedFromSource: { key: string; type: string; objectKey: string }[];
  summary: Record<ComparisonStatus | 'REMOVED_FROM_SOURCE', number>;
  blocking: boolean;
};

/**
 * @param target  state for every key the artifact mentions (components and
 *                their dependencies), keyed by `<type>:<objectKey>`. A key
 *                with no entry does not exist in the target.
 * @param ownedByPackageInTarget  keys the importing package owns in the target
 *                today — anything there but not in the artifact was removed
 *                from the source.
 */
export function comparePackageToTarget(input: {
  components: readonly PortableComponent[];
  target: ReadonlyMap<string, TargetEntry>;
  ownedByPackageInTarget?: readonly string[];
}): ComparisonResult {
  const artifactKeys = new Set(
    input.components.map((component) => component.key),
  );
  const items = input.components.map((component) =>
    classify(
      component,
      input.target.get(component.key) ?? null,
      artifactKeys,
      input.target,
    ),
  );

  const removedFromSource = (input.ownedByPackageInTarget ?? [])
    .filter((key) => !artifactKeys.has(key))
    .sort()
    .map((key) => {
      const [type, ...rest] = key.split(':');
      return { key, type, objectKey: rest.join(':') };
    });

  const summary = {
    NEW: 0,
    MATCHING: 0,
    UPDATE: 0,
    TARGET_MODIFIED: 0,
    CONFLICT: 0,
    MISSING_DEPENDENCY: 0,
    INCOMPATIBLE: 0,
    SKIPPED: 0,
    REMOVED_FROM_SOURCE: removedFromSource.length,
  };
  for (const item of items) summary[item.status] += 1;

  return {
    items,
    removedFromSource,
    summary,
    blocking: items.some((item) => item.blocking),
  };
}

function classify(
  component: PortableComponent,
  entry: TargetEntry | null,
  artifactKeys: ReadonlySet<string>,
  target: ReadonlyMap<string, TargetEntry>,
): ComparisonItem {
  const base = {
    key: component.key,
    type: component.type,
    objectKey: component.objectKey,
    layerAction: component.layerAction,
    changedFields: [] as string[],
  };

  /* Every dependency must arrive with the package or already be here. */
  const missing = component.dependsOn.filter(
    (dependency) => !artifactKeys.has(dependency) && !target.has(dependency),
  );
  if (missing.length) {
    return {
      ...base,
      status: 'MISSING_DEPENDENCY',
      apply: 'none',
      blocking: true,
      messages: missing.map(
        (dependency) =>
          `${component.objectKey} requires ${describeKey(dependency)}, which is neither in this package nor in this workspace.`,
      ),
    };
  }

  if (component.layerAction === 'reference') {
    if (!entry) {
      return {
        ...base,
        status: component.baseIsSystem ? 'INCOMPATIBLE' : 'MISSING_DEPENDENCY',
        apply: 'none',
        blocking: true,
        messages: [
          component.baseIsSystem
            ? `${describeKey(component.key)} is part of DijiPeople Core in the source but does not exist here. This workspace may be on an older platform version.`
            : `${describeKey(component.key)} is referenced but does not exist here.`,
        ],
      };
    }
    return {
      ...base,
      status: 'MATCHING',
      apply: 'none',
      blocking: false,
      messages: [],
    };
  }

  if (
    component.layerAction === 'modify' ||
    component.layerAction === 'remove'
  ) {
    if (!entry) {
      if (component.layerAction === 'remove') {
        return {
          ...base,
          status: 'SKIPPED',
          apply: 'none',
          blocking: false,
          messages: [
            `${describeKey(component.key)} does not exist here, so there is nothing to remove.`,
          ],
        };
      }
      return {
        ...base,
        status: component.baseIsSystem ? 'INCOMPATIBLE' : 'MISSING_DEPENDENCY',
        apply: 'none',
        blocking: true,
        messages: [
          `${describeKey(component.key)} is extended by this package but does not exist here.`,
        ],
      };
    }
    return compareOwnLayer(component, entry, base);
  }

  /* layerAction === 'create' */
  if (!entry) {
    return {
      ...base,
      status: 'NEW',
      apply: 'create',
      blocking: false,
      messages: [],
    };
  }
  if (entry.ownerKind === 'core') {
    return {
      ...base,
      status: 'CONFLICT',
      apply: 'none',
      blocking: true,
      messages: [
        `${describeKey(component.key)} already exists as a DijiPeople Core component. A package can extend a system component but never replace it.`,
      ],
    };
  }
  if (!entry.ownedByImportingPackage) {
    return {
      ...base,
      status: 'CONFLICT',
      apply: 'none',
      blocking: true,
      messages: [
        entry.ownerPackageName
          ? `${describeKey(component.key)} already exists here and belongs to ${entry.ownerPackageName}. Remove it there, or rename it in the source package.`
          : `${describeKey(component.key)} already exists here and belongs to no package. Remove it, or rename it in the source package.`,
      ],
    };
  }
  return compareOwnLayer(component, entry, base);
}

/* The package already owns this component here: an upgrade or a re-install. */
function compareOwnLayer(
  component: PortableComponent,
  entry: TargetEntry,
  base: Omit<ComparisonItem, 'status' | 'apply' | 'blocking' | 'messages'>,
): ComparisonItem {
  const destructive = destructiveChanges(component, entry.definition);
  if (destructive.length) {
    return {
      ...base,
      status: 'CONFLICT',
      apply: 'none',
      blocking: true,
      messages: destructive,
    };
  }

  if (!entry.current) {
    /* A layer over a component this package does not yet layer here. */
    return {
      ...base,
      status: 'NEW',
      apply: 'create',
      blocking: false,
      messages: [],
    };
  }

  const currentChecksum = componentChecksum(entry.current);
  if (currentChecksum === component.checksum) {
    return {
      ...base,
      status: 'MATCHING',
      apply: 'none',
      blocking: false,
      messages: [],
    };
  }
  const changedFields = diffFields(entry.current, component);
  if (entry.installedChecksum && entry.installedChecksum !== currentChecksum) {
    return {
      ...base,
      changedFields,
      status: 'TARGET_MODIFIED',
      apply: 'update',
      blocking: false,
      messages: [
        `${describeKey(component.key)} was changed in this workspace after it was installed. Importing replaces that local change with the package version.`,
      ],
    };
  }
  return {
    ...base,
    changedFields,
    status: 'UPDATE',
    apply: 'update',
    blocking: false,
    messages: [],
  };
}

/**
 * Definition changes that would lose or corrupt stored records. Checked
 * against whatever the target holds, including a component the package owns:
 * an upgrade may not do these either.
 */
export function destructiveChanges(
  component: PortableComponent,
  targetDefinition: Record<string, unknown> | null,
): string[] {
  if (!targetDefinition || !component.definition) return [];
  const source = component.definition;
  const problems: string[] = [];
  const label = describeKey(component.key);

  if (component.type === 'column') {
    const sourceType = source.dataType ?? source.fieldType;
    const targetType = targetDefinition.dataType ?? targetDefinition.fieldType;
    if (sourceType && targetType && sourceType !== targetType) {
      problems.push(
        `Cannot update ${label}. Source type is ${String(sourceType)}, target type is ${String(targetType)}. Changing a field's type would be destructive.`,
      );
    }
    const sourceLookup = source.lookupTargetTableKey ?? null;
    const targetLookup = targetDefinition.lookupTargetTableKey ?? null;
    if (sourceLookup !== targetLookup && (sourceLookup || targetLookup)) {
      problems.push(
        `Cannot update ${label}. It looks up ${String(sourceLookup ?? 'nothing')} in the package but ${String(targetLookup ?? 'nothing')} here.`,
      );
    }
  }
  return problems;
}

function diffFields(
  current: PortableComponentInput,
  next: PortableComponentInput,
) {
  const fields = new Set<string>();
  for (const part of ['definition', 'layer'] as const) {
    const left = current[part] ?? {};
    const right = next[part] ?? {};
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) {
        fields.add(key);
      }
    }
  }
  if (current.dependsOn.join('|') !== next.dependsOn.join('|'))
    fields.add('dependencies');
  return [...fields].sort();
}

const TYPE_LABELS: Record<string, string> = {
  table: 'module',
  column: 'field',
  form: 'form',
  view: 'view',
  optionSet: 'choice list',
  lookup: 'relationship',
  actionBar: 'action bar',
  widget: 'widget',
  environmentVariable: 'environment variable',
};

export function describeKey(key: string) {
  const [type, ...rest] = key.split(':');
  return `${TYPE_LABELS[type] ?? type} ${rest.join(':')}`;
}
