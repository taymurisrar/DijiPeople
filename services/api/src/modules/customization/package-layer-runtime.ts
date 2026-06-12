export type PackageLayerComponent<TMetadata = unknown> = {
  id: string;
  componentType: string;
  objectId: string;
  objectKey: string;
  baseComponentId?: string | null;
  layerAction: string;
  lifecycleState: string;
  layerOrder: number;
  metadataJson?: TMetadata | null;
};

export function resolveEffectivePackageComponents<
  TComponent extends PackageLayerComponent,
>(components: readonly TComponent[]): TComponent[] {
  const published = components
    .filter((component) => component.lifecycleState === 'published')
    .slice()
    .sort(compareLayers);
  const aliases = new Map<string, TComponent>();

  for (const component of published) {
    aliases.set(component.id, component);
    aliases.set(component.objectId, component);
    aliases.set(component.objectKey, component);
  }

  const effective = new Map<string, TComponent>();
  for (const component of published) {
    const identity = resolveRootIdentity(component, aliases);

    if (component.layerAction === 'remove') {
      effective.delete(identity);
      continue;
    }
    if (component.layerAction === 'reference') {
      if (!effective.has(identity)) effective.set(identity, component);
      continue;
    }

    const current = effective.get(identity);
    effective.set(
      identity,
      current ? mergePackageLayers(current, component) : component,
    );
  }

  return [...effective.values()].sort(compareLayers);
}

export function buildMetadataInvalidationKeys(input: {
  tenantId: string;
  packageIds: readonly string[];
  componentTypes: readonly string[];
  moduleIds?: readonly string[];
  snapshotVersion: number;
}) {
  return [
    `metadata:${input.tenantId}`,
    `metadata:${input.tenantId}:v${input.snapshotVersion}`,
    ...unique(input.packageIds).map((id) => `package:${id}`),
    ...unique(input.componentTypes).map(
      (type) => `metadata:${input.tenantId}:type:${type}`,
    ),
    ...unique(input.moduleIds ?? []).map(
      (id) => `metadata:${input.tenantId}:module:${id}`,
    ),
  ];
}

export function validatePackageLayerEdit(input: {
  packageIsDefault: boolean;
  packageIsManaged: boolean;
  componentIsSystem: boolean;
  layerAction?: string | null;
  lifecycleState?: string | null;
}) {
  if (input.packageIsDefault) {
    return {
      allowed: false,
      reason: 'Default Package components are read-only.',
    };
  }
  if (input.packageIsManaged) {
    return {
      allowed: false,
      reason: 'Managed Package components are read-only.',
    };
  }
  if (
    input.componentIsSystem &&
    !(input.layerAction === 'modify' && input.lifecycleState === 'draft')
  ) {
    return {
      allowed: false,
      reason:
        'Add Existing must create a draft modify layer in a Custom Package before editing a Default Package component.',
    };
  }
  return { allowed: true, reason: null };
}

function resolveRootIdentity<TComponent extends PackageLayerComponent>(
  component: TComponent,
  aliases: ReadonlyMap<string, TComponent>,
) {
  let current = component;
  const visited = new Set<string>();

  while (current.baseComponentId && !visited.has(current.id)) {
    visited.add(current.id);
    const base = aliases.get(current.baseComponentId);
    if (!base) return `${current.componentType}:${current.baseComponentId}`;
    current = base;
  }

  return `${current.componentType}:${current.objectKey}`;
}

function mergePackageLayers<TComponent extends PackageLayerComponent>(
  base: TComponent,
  override: TComponent,
): TComponent {
  return {
    ...base,
    ...override,
    metadataJson: mergeMetadata(base.metadataJson, override.metadataJson),
  };
}

function mergeMetadata(base: unknown, override: unknown) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override ?? base;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] =
      isPlainObject(merged[key]) && isPlainObject(value)
        ? mergeMetadata(merged[key], value)
        : value;
  }
  return merged;
}

function compareLayers(
  left: PackageLayerComponent,
  right: PackageLayerComponent,
) {
  return (
    left.layerOrder - right.layerOrder ||
    left.componentType.localeCompare(right.componentType) ||
    left.objectKey.localeCompare(right.objectKey) ||
    left.id.localeCompare(right.id)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}
