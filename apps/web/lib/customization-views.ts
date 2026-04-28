import { apiRequestJson } from "@/lib/server-api";
import type { ModuleViewOption } from "@/app/components/view-selector/types";

export type RuntimeCustomizationView = ModuleViewOption & {
  viewKey: string;
  tableKey: string;
  columnsJson?: unknown;
  filtersJson?: unknown;
  sortingJson?: unknown;
  isHidden?: boolean;
};

type PublishedCustomizationResponse = {
  published: boolean;
  snapshotJson?: {
    tables?: Array<{ id: string; tableKey: string }>;
    views?: Array<{
      id: string;
      tableId: string;
      viewKey: string;
      name: string;
      description?: string | null;
      type: "system" | "custom";
      isDefault?: boolean;
      isHidden?: boolean;
      columnsJson?: unknown;
      filtersJson?: unknown;
      sortingJson?: unknown;
    }>;
  } | null;
};

export async function getTableViews(
  tableKey: string,
): Promise<RuntimeCustomizationView[]> {
  const published = await apiRequestJson<PublishedCustomizationResponse>(
    "/customization/published",
  ).catch(() => null);

  if (!published?.published || !published.snapshotJson) {
    return [];
  }

  const table = published.snapshotJson.tables?.find(
    (item) => item.tableKey === tableKey,
  );
  if (!table) return [];

  return (published.snapshotJson.views ?? [])
    .filter((view) => view.tableId === table.id && !view.isHidden)
    .map((view) => ({
      id: view.viewKey,
      viewKey: view.viewKey,
      tableKey,
      name: view.name,
      description: view.description ?? undefined,
      type: view.type,
      isDefault: view.isDefault,
      isHidden: view.isHidden,
      columnsJson: view.columnsJson,
      filtersJson: view.filtersJson,
      sortingJson: view.sortingJson,
    }));
}

export async function getDefaultView(
  tableKey: string,
  selectedViewKey?: string,
) {
  const views = await getTableViews(tableKey);
  return (
    views.find((view) => view.viewKey === selectedViewKey) ??
    views.find((view) => view.isDefault) ??
    views[0] ??
    null
  );
}

export function resolveVisibleColumns(
  tableKey: string,
  view: RuntimeCustomizationView | null,
  fallbackColumnKeys: string[],
) {
  void tableKey;
  const columnKeys = extractColumnKeys(view?.columnsJson);
  return columnKeys.length > 0 ? columnKeys : fallbackColumnKeys;
}

export function resolveFiltersAndSorting(
  tableKey: string,
  view: RuntimeCustomizationView | null,
) {
  void tableKey;
  return {
    filters: view?.filtersJson ?? null,
    sorting: view?.sortingJson ?? null,
  };
}

export function withFallbackViews(
  tableKey: string,
  publishedViews: RuntimeCustomizationView[],
  fallbackViews: RuntimeCustomizationView[],
) {
  if (publishedViews.length > 0) return publishedViews;
  return fallbackViews.map((view) => ({ ...view, tableKey }));
}

function extractColumnKeys(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(extractColumnKey);
  if (typeof value === "object") {
    const columns = (value as { columns?: unknown }).columns;
    if (Array.isArray(columns)) return columns.flatMap(extractColumnKey);
  }
  return [];
}

function extractColumnKey(value: unknown) {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") {
    const columnKey = (value as { columnKey?: unknown }).columnKey;
    return typeof columnKey === "string" ? [columnKey] : [];
  }
  return [];
}
