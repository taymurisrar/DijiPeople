import { resolveSystemWidgetDefinition } from "@repo/config";
import type {
  FormColumnCount,
  FormComponentMetadata,
} from "./metadata-runtime.types";
import { stableRuntimeMetadataId } from "./metadata-id";

export function createSystemWidgetComponent({
  columnSpan = 1,
  idSeed,
  order,
  widgetKey,
}: {
  readonly widgetKey: string;
  readonly idSeed: string;
  readonly order: number;
  readonly columnSpan?: FormColumnCount;
}): FormComponentMetadata {
  const definition = resolveSystemWidgetDefinition(widgetKey);
  if (!definition) {
    throw new Error(`Unknown System Widget: ${widgetKey}`);
  }

  return {
    id: stableRuntimeMetadataId(`system-widget:${idSeed}:${widgetKey}`),
    type: "widget",
    widgetId: definition.widgetKey,
    widgetType: definition.aliases[0] ?? definition.widgetKey,
    order,
    label: definition.displayName,
    columnSpan,
    lifecycleState: "published",
  };
}
