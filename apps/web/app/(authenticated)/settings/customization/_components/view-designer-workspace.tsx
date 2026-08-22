"use client";

import { ArrowLeft, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import type {
  CustomizationColumn,
  CustomizationTable,
  CustomizationView,
} from "../types";

type ViewColumn = {
  columnKey: string;
  label?: string;
  width?: number;
  sequence?: number;
};

type ViewFilter = {
  id: string;
  columnKey: string;
  operator: string;
  value: string;
};

type ViewSort = {
  columnKey: string;
  direction: "asc" | "desc";
};

type Props = {
  columns: CustomizationColumn[];
  table: CustomizationTable;
  view: CustomizationView;
};

export function ViewDesignerWorkspace({ columns, table, view }: Props) {
  const router = useRouter();
  const designerColumns = useMemo(
    () =>
      columns.filter(
        (column) =>
          column.isVisible &&
          column.isVisibleInCustomization !== false &&
          column.isValidForViewDesigner !== false,
      ),
    [columns],
  );
  const columnByKey = useMemo(
    () => new Map(designerColumns.map((column) => [column.columnKey, column])),
    [designerColumns],
  );
  const [metadata, setMetadata] = useState({
    name: view.name,
    description: view.description ?? "",
    isDefault: view.isDefault,
    isHidden: view.isHidden,
    type: view.type,
  });
  const [selectedColumns, setSelectedColumns] = useState<ViewColumn[]>(() =>
    normalizeViewColumns(view.columnsJson, designerColumns),
  );
  const [filters, setFilters] = useState<ViewFilter[]>(() =>
    normalizeFilters(view.filtersJson),
  );
  const [sort, setSort] = useState<ViewSort>(() =>
    normalizeSort(view.sortingJson, selectedColumns[0]?.columnKey),
  );
  const [dragColumnKey, setDragColumnKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const availableColumns = designerColumns.filter(
    (column) =>
      !selectedColumns.some(
        (selected) => selected.columnKey === column.columnKey,
      ),
  );

  async function save() {
    if (selectedColumns.length === 0) {
      setError("Select at least one view field.");
      return;
    }
    setIsSaving(true);
    setError(null);
    const response = await fetch(
      `/api/customization/tables/${table.tableKey}/views/${view.viewKey}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: metadata.name,
          description: metadata.description,
          type: metadata.type,
          isDefault: metadata.isDefault,
          isHidden: metadata.isHidden,
          columnsJson: {
            columns: selectedColumns.map((column, index) => ({
              ...column,
              sequence: index * 10,
            })),
          },
          filtersJson: filters.map((filter) => ({
            columnKey: filter.columnKey,
            operator: filter.operator,
            value: filter.value,
          })),
          sortingJson: sort.columnKey ? [sort] : [],
          visibilityScope: view.visibilityScope,
        }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    setIsSaving(false);
    if (!response.ok) {
      setError(data.message ?? "Unable to save view designer changes.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-white px-4 py-2 shadow-sm">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
          <Button
            href={`/settings/customization/tables/${table.tableKey}/views`}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
            variant="ghost"
          >
            Back
          </Button>
          <Button
            leftIcon={<Save className="h-4 w-4" />}
            loading={isSaving}
            loadingText="Saving..."
            onClick={save}
            type="button"
          >
            Save
          </Button>
          <Button
            onClick={() =>
              setMetadata((current) => ({
                ...current,
                isHidden: !current.isHidden,
              }))
            }
            type="button"
            variant="secondary"
          >
            {metadata.isHidden ? "Activate" : "Deactivate"}
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill tone={view.type === "system" ? "neutral" : "good"}>
            {view.type === "system" ? "System" : "Custom"}
          </StatusPill>
          <StatusPill tone={metadata.isHidden ? "muted" : "good"}>
            {metadata.isHidden ? "Inactive" : "Active"}
          </StatusPill>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid min-h-[640px] gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="rounded-[20px] border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Fields</p>
          <p className="mt-1 text-xs text-muted">
            Only view-designer-valid fields are listed.
          </p>
          <div className="mt-4 grid gap-2">
            {availableColumns.map((column) => (
              <button
                className="rounded-2xl border border-border bg-white px-3 py-3 text-left text-sm transition hover:border-accent/40 hover:bg-accent-soft"
                key={column.columnKey}
                onClick={() =>
                  setSelectedColumns((current) => [
                    ...current,
                    {
                      columnKey: column.columnKey,
                      label: column.displayName,
                      width: column.fieldType === "textarea" ? 320 : 180,
                    },
                  ])
                }
                type="button"
              >
                <span className="block font-medium text-foreground">
                  {column.displayName}
                </span>
                <span className="mt-1 block text-xs text-muted">
                  {column.columnKey} · {column.fieldType}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="rounded-[20px] border border-border bg-slate-50 p-4 shadow-sm">
          <div className="mb-4">
            <p className="text-sm font-semibold text-foreground">View fields</p>
            <p className="mt-1 text-xs text-muted">
              Drag fields to reorder the runtime grid.
            </p>
          </div>
          <div className="grid gap-2">
            {selectedColumns.map((selected) => {
              const column = columnByKey.get(selected.columnKey);
              return (
                <div
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white px-4 py-3"
                  draggable
                  key={selected.columnKey}
                  /*
                   * A selected column in a reorderable list. `draggable` is a
                   * pointer affordance; the row activates nothing and its own
                   * controls are separately reachable. Keyboard reordering is
                   * ITEM-0080. BUG-0043.
                   */
                  role="listitem"
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={() => setDragColumnKey(selected.columnKey)}
                  onDrop={() => {
                    if (!dragColumnKey) return;
                    setSelectedColumns((current) =>
                      moveColumn(current, dragColumnKey, selected.columnKey),
                    );
                    setDragColumnKey(null);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 text-muted" />
                    <div>
                      <p className="font-medium text-foreground">
                        {selected.label ||
                          column?.displayName ||
                          selected.columnKey}
                      </p>
                      <p className="text-xs text-muted">{selected.columnKey}</p>
                    </div>
                  </div>
                  <Button
                    leftIcon={<Trash2 className="h-4 w-4" />}
                    onClick={() =>
                      setSelectedColumns((current) =>
                        current.filter(
                          (column) => column.columnKey !== selected.columnKey,
                        ),
                      )
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>
        </main>

        <aside className="rounded-[20px] border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">Properties</p>
          <div className="mt-4 grid gap-4">
            <TextField
              label="View name"
              onChange={(name) =>
                setMetadata((current) => ({ ...current, name }))
              }
              value={metadata.name}
            />
            <TextField
              label="Logical name"
              onChange={() => undefined}
              value={view.viewKey}
              disabled
            />
            <CheckboxField
              checked={metadata.isDefault}
              label="Default view"
              onChange={(isDefault) =>
                setMetadata((current) => ({ ...current, isDefault }))
              }
            />
            <CheckboxField
              checked={!metadata.isHidden}
              label="Active"
              onChange={(active) =>
                setMetadata((current) => ({ ...current, isHidden: !active }))
              }
            />
            <TextAreaField
              label="Description"
              onChange={(description) =>
                setMetadata((current) => ({ ...current, description }))
              }
              value={metadata.description}
            />

            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground">Sorting</p>
              <div className="mt-3 grid gap-3">
                <SelectField
                  label="Sort field"
                  onChange={(columnKey) =>
                    setSort((current) => ({ ...current, columnKey }))
                  }
                  options={selectedColumns.map((column) => ({
                    value: column.columnKey,
                    label:
                      column.label ??
                      columnByKey.get(column.columnKey)?.displayName ??
                      column.columnKey,
                  }))}
                  value={sort.columnKey}
                />
                <SelectField
                  label="Direction"
                  onChange={(direction) =>
                    setSort((current) => ({
                      ...current,
                      direction: direction === "desc" ? "desc" : "asc",
                    }))
                  }
                  options={[
                    { value: "asc", label: "Ascending" },
                    { value: "desc", label: "Descending" },
                  ]}
                  value={sort.direction}
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Filters</p>
                <Button
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() =>
                    setFilters((current) => [
                      ...current,
                      {
                        id: `filter${current.length + 1}`,
                        columnKey: selectedColumns[0]?.columnKey ?? "",
                        operator: "contains",
                        value: "",
                      },
                    ])
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Add
                </Button>
              </div>
              <div className="mt-3 grid gap-3">
                {filters.map((filter) => (
                  <div
                    className="rounded-2xl border border-border p-3"
                    key={filter.id}
                  >
                    <SelectField
                      label="Field"
                      onChange={(columnKey) =>
                        setFilters((current) =>
                          current.map((item) =>
                            item.id === filter.id
                              ? { ...item, columnKey }
                              : item,
                          ),
                        )
                      }
                      options={selectedColumns.map((column) => ({
                        value: column.columnKey,
                        label:
                          column.label ??
                          columnByKey.get(column.columnKey)?.displayName ??
                          column.columnKey,
                      }))}
                      value={filter.columnKey}
                    />
                    <SelectField
                      label="Operator"
                      onChange={(operator) =>
                        setFilters((current) =>
                          current.map((item) =>
                            item.id === filter.id
                              ? { ...item, operator }
                              : item,
                          ),
                        )
                      }
                      options={[
                        { value: "contains", label: "Contains" },
                        { value: "equals", label: "Equals" },
                        { value: "startsWith", label: "Starts with" },
                      ]}
                      value={filter.operator}
                    />
                    <TextField
                      label="Value"
                      onChange={(value) =>
                        setFilters((current) =>
                          current.map((item) =>
                            item.id === filter.id ? { ...item, value } : item,
                          ),
                        )
                      }
                      value={filter.value}
                    />
                    <Button
                      onClick={() =>
                        setFilters((current) =>
                          current.filter((item) => item.id !== filter.id),
                        )
                      }
                      size="sm"
                      type="button"
                      variant="danger"
                    >
                      Remove filter
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function normalizeViewColumns(
  value: unknown,
  fallbackColumns: CustomizationColumn[],
): ViewColumn[] {
  const raw = extractColumnItems(value);
  const allowed = new Set(fallbackColumns.map((column) => column.columnKey));
  const columns = raw
    .filter((column) => allowed.has(column.columnKey))
    .map((column, index) => ({ ...column, sequence: index * 10 }));
  if (columns.length > 0) return columns;
  return fallbackColumns.slice(0, 8).map((column, index) => ({
    columnKey: column.columnKey,
    label: column.displayName,
    width: column.fieldType === "textarea" ? 320 : 180,
    sequence: index * 10,
  }));
}

function extractColumnItems(value: unknown): ViewColumn[] {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as { columns?: unknown }).columns
      : value;
  if (!Array.isArray(source)) return [];
  return source.flatMap((item) => {
    if (typeof item === "string") return [{ columnKey: item }];
    if (!item || typeof item !== "object") return [];
    const columnKey = (item as { columnKey?: unknown }).columnKey;
    if (typeof columnKey !== "string") return [];
    return [
      {
        columnKey,
        label:
          typeof (item as { label?: unknown }).label === "string"
            ? (item as { label: string }).label
            : undefined,
        width:
          typeof (item as { width?: unknown }).width === "number"
            ? (item as { width: number }).width
            : undefined,
      },
    ];
  });
}

function normalizeFilters(value: unknown): ViewFilter[] {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as { filters?: unknown }).filters
      : value;
  if (!Array.isArray(source)) return [];
  return source.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const columnKey = (item as { columnKey?: unknown }).columnKey;
    if (typeof columnKey !== "string") return [];
    return [
      {
        id: `filter${index + 1}`,
        columnKey,
        operator:
          typeof (item as { operator?: unknown }).operator === "string"
            ? (item as { operator: string }).operator
            : "contains",
        value:
          typeof (item as { value?: unknown }).value === "string"
            ? (item as { value: string }).value
            : "",
      },
    ];
  });
}

function normalizeSort(value: unknown, fallbackColumnKey = ""): ViewSort {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as { sorting?: unknown }).sorting
      : value;
  const first = Array.isArray(source) ? source[0] : null;
  if (first && typeof first === "object") {
    const columnKey = (first as { columnKey?: unknown }).columnKey;
    const direction = (first as { direction?: unknown }).direction;
    return {
      columnKey: typeof columnKey === "string" ? columnKey : fallbackColumnKey,
      direction: direction === "desc" ? "desc" : "asc",
    };
  }
  return { columnKey: fallbackColumnKey, direction: "asc" };
}

function moveColumn(items: ViewColumn[], sourceKey: string, targetKey: string) {
  const next = [...items];
  const from = next.findIndex((item) => item.columnKey === sourceKey);
  const to = next.findIndex((item) => item.columnKey === targetKey);
  if (from < 0 || to < 0 || from === to) return items;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
