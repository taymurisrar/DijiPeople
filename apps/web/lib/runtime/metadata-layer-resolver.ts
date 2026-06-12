import type { MetadataLayerComponent } from "./metadata-layer.types";

export type ResolveMetadataLayersOptions = {
  readonly includeDrafts?: boolean;
};

export function resolveMetadataLayers<
  TMetadata extends Record<string, unknown>,
>(
  layers: readonly MetadataLayerComponent<TMetadata>[],
  options: ResolveMetadataLayersOptions = {},
) {
  const applicable = layers
    .filter((layer) =>
      options.includeDrafts ? true : layer.lifecycleState === "published",
    )
    .slice()
    .sort((left, right) => left.layerOrder - right.layerOrder);
  const aliases = new Map<string, MetadataLayerComponent<TMetadata>>();
  for (const layer of applicable) {
    aliases.set(layer.layerId, layer);
    aliases.set(layer.componentId, layer);
    aliases.set(layer.componentKey, layer);
  }
  const resolved = new Map<string, MetadataLayerComponent<TMetadata>>();

  for (const layer of applicable) {
    const key = resolveRootKey(layer, aliases);
    if (layer.layerAction === "reference") {
      if (!resolved.has(key)) resolved.set(key, layer);
      continue;
    }
    if (layer.layerAction === "remove") {
      resolved.delete(key);
      continue;
    }

    const current = resolved.get(key);
    resolved.set(key, current ? mergeLayer(current, layer) : layer);
  }

  return Array.from(resolved.values());
}

function resolveRootKey<TMetadata extends Record<string, unknown>>(
  layer: MetadataLayerComponent<TMetadata>,
  aliases: ReadonlyMap<string, MetadataLayerComponent<TMetadata>>,
) {
  let current = layer;
  const visited = new Set<string>();

  while (current.baseComponentId && !visited.has(current.layerId)) {
    visited.add(current.layerId);
    const base = aliases.get(current.baseComponentId);
    if (!base) return `${current.componentType}:${current.baseComponentId}`;
    current = base;
  }

  return `${current.componentType}:${current.componentKey}`;
}

function mergeLayer<TMetadata extends Record<string, unknown>>(
  base: MetadataLayerComponent<TMetadata>,
  override: MetadataLayerComponent<TMetadata>,
): MetadataLayerComponent<TMetadata> {
  return {
    ...base,
    ...override,
    metadata: {
      ...base.metadata,
      ...override.metadata,
    },
  };
}
