"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Columns3,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { resolveRuntimeField } from "@repo/config";
import {
  ProDataTable,
  type ProDataTableColumn,
} from "@/app/_components/crm/data-table";
import { usePlatformDefaults } from "@/app/_components/platform-defaults-provider";
import { PageHeader } from "@/app/_components/ui/page-header";
import {
  formatCurrency,
  formatDate,
  formatEnumLabel,
  formatNumber,
} from "@/lib/formatters";
import { createHttpModuleRuntimeAdapter } from "@/lib/runtime/http-module-runtime-adapter";
import { getPlatformModuleDefinition } from "@/lib/runtime/platform-module-registry";
import type {
  PlatformModuleKey,
  RuntimeActionDefinition,
  RuntimeColumnDefinition,
  RuntimeFilter,
  RuntimeListResponse,
  RuntimeRecord,
  RuntimeSort,
} from "@/lib/runtime/platform-runtime.types";
import { ModuleActionBar } from "./module-action-bar";
import { RuntimeViewSelector } from "./runtime-view-selector";
import { buildTenantLoginUrl } from "@/lib/tenant-url";

type Operator = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
};

type SavedFilter = {
  id: string;
  label: string;
  filters: RuntimeFilter[];
};

type RuntimeTableState = {
  version: number;
  visibleColumns?: string[];
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  savedFilters?: SavedFilter[];
};

export function RuntimeModuleList({
  moduleKey,
  roleKeys,
  permissionKeys,
  defaultViewKey,
}: {
  moduleKey: PlatformModuleKey;
  roleKeys: string[];
  permissionKeys: string[];
  defaultViewKey?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { defaults } = usePlatformDefaults();
  const definition = useMemo(
    () => getPlatformModuleDefinition(moduleKey),
    [moduleKey],
  );
  const adapter = useMemo(
    () => createHttpModuleRuntimeAdapter(moduleKey),
    [moduleKey],
  );
  const [data, setData] = useState<RuntimeListResponse>({
    items: [],
    meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [refreshKey, setRefreshKey] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() =>
    definition.columns
      .filter((column) => column.visible !== false)
      .map((column) => column.key),
  );
  const [columnOrder, setColumnOrder] = useState(() =>
    definition.columns.map((column) => column.key),
  );
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [ownerId, setOwnerId] = useState("");

  const page = positive(searchParams.get("page"), 1);
  const pageSize = positive(searchParams.get("pageSize"), 25);
  const viewKey =
    searchParams.get("viewId") ?? defaultViewKey ?? definition.defaultView;
  const status = searchParams.get("status");
  const filters = useMemo(
    () => readFilters(searchParams.get("filters"), moduleKey),
    [moduleKey, searchParams],
  );
  const [draftFilters, setDraftFilters] = useState<RuntimeFilter[]>(filters);
  const sorts = useMemo<RuntimeSort[]>(
    () =>
      readSorts(searchParams.get("sort"), moduleKey) ?? [
        {
          field:
            searchParams.get("sortField") ??
            definition.defaultSort[0]?.field ??
            "createdAt",
          direction:
            searchParams.get("sortDirection") === "asc" ? "asc" : "desc",
        },
      ],
    [definition.defaultSort, moduleKey, searchParams],
  );

  useEffect(() => setDraftFilters(filters), [filters]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/platform-runtime/preferences?moduleKey=${encodeURIComponent(moduleKey)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load table preferences.");
        return response.json();
      })
      .then((payload: { tableStateJson?: RuntimeTableState | null }) => {
        const state =
          payload.tableStateJson?.version === 2 ? payload.tableStateJson : null;
        if (state?.visibleColumns?.length)
          setVisibleColumns(
            state.visibleColumns.filter((key) =>
              definition.columns.some((column) => column.key === key),
            ),
          );
        if (state?.columnOrder?.length)
          setColumnOrder(
            normalizeColumnOrder(
              state.columnOrder,
              definition.columns.map((column) => column.key),
            ),
          );
        if (state?.columnWidths) setColumnWidths(state.columnWidths);
        if (state?.savedFilters)
          setSavedFilters(
            state.savedFilters.map((item) => ({
              ...item,
              filters: item.filters.filter((filter) =>
                Boolean(
                  resolveRuntimeField(moduleKey, filter.field)?.filterable,
                ),
              ),
            })),
          );
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load table preferences.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreferencesLoaded(true);
      });
    return () => controller.abort();
  }, [definition.columns, moduleKey]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    const timeout = window.setTimeout(() => {
      void fetch("/api/platform-runtime/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleKey,
          tableStateJson: {
            version: 2,
            visibleColumns,
            columnOrder,
            columnWidths,
            savedFilters,
          } satisfies RuntimeTableState,
        }),
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [
    columnOrder,
    columnWidths,
    moduleKey,
    preferencesLoaded,
    savedFilters,
    visibleColumns,
  ]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      void refreshKey;
      setLoading(true);
      setError(null);
      try {
        const response = await adapter.getRecords({
          page,
          pageSize,
          search: searchParams.get("search") ?? undefined,
          viewKey,
          filters: [
            ...filters,
            ...(status
              ? [{ field: "status", operator: "eq" as const, value: status }]
              : []),
          ],
          sort: sorts,
          signal,
        });
        setData(response);
        setSelectedIds([]);
      } catch (reason) {
        if (!signal?.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : `Unable to load ${definition.pluralDisplayName.toLowerCase()}.`,
          );
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [
      adapter,
      definition.pluralDisplayName,
      page,
      pageSize,
      refreshKey,
      searchParams,
      filters,
      sorts,
      status,
      viewKey,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function updateQuery(values: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (search === current) return;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search.trim()) params.set("search", search.trim());
      else params.delete("search");
      params.set("page", "1");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [pathname, router, search, searchParams]);

  async function handleAction(action: RuntimeActionDefinition) {
    if (action.key === "new") {
      router.push(`${definition.routeBase}/new`);
      return;
    }
    if (action.key === "refresh") {
      setRefreshKey((value) => value + 1);
      return { success: true, message: "View refreshed." };
    }
    if (action.key === "export") {
      const blob = await adapter.exportRecords({
        search,
        viewKey,
        filters,
        sort: sorts,
        selectedColumns: visibleColumns,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${moduleKey}-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      return { success: true, message: "Export downloaded." };
    }
    if (action.key === "bulk-delete") {
      const result = await adapter.bulkDelete(selectedIds);
      setRefreshKey((value) => value + 1);
      return result;
    }
    /*
     * Opening the selected tenant's own workspace, rather than its record. The
     * slug is already on the loaded row, so this needs no extra request.
     */
    if (action.key === "open-tenant-list") {
      const selected = data.items.find((row) => row.id === selectedIds[0]);
      const slug = String(selected?.slug ?? "");
      if (!slug) {
        return {
          success: false,
          message: "This tenant has no workspace slug yet.",
        };
      }
      window.open(buildTenantLoginUrl(slug), "_blank", "noopener,noreferrer");
      return { success: true, message: "Tenant workspace opened." };
    }
    if (action.key === "bulk-assign") {
      const response = await fetch("/api/platform-runtime/lookups?type=owners");
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.message ?? "Unable to load support owners.");
      setOperators(payload.items ?? payload);
      setAssignOpen(true);
      return;
    }
    if (action.key === "bulk-change-status") {
      const nextStatus = window.prompt("Enter the new status");
      if (!nextStatus?.trim()) return;
      await Promise.all(
        selectedIds.map((id) =>
          adapter.changeStatus(id, nextStatus.trim().toUpperCase()),
        ),
      );
      setRefreshKey((value) => value + 1);
      return {
        success: true,
        message: `${selectedIds.length} lead(s) updated.`,
      };
    }
    return adapter.executeAction(action.key, { ids: selectedIds });
  }

  async function assignSelected() {
    const result = await adapter.bulkAssign(selectedIds, ownerId || null);
    if (!result.success)
      throw new Error(result.message ?? "Assignment failed.");
    setAssignOpen(false);
    setOwnerId("");
    setRefreshKey((value) => value + 1);
  }

  const columns = useMemo<ProDataTableColumn<RuntimeRecord>[]>(
    () =>
      [...definition.columns]
        .sort(
          (left, right) =>
            columnOrder.indexOf(left.key) - columnOrder.indexOf(right.key),
        )
        .filter((column) => visibleColumns.includes(column.key))
        .map((column) => ({
          key: column.key,
          sortField: column.field,
          header: column.label,
          width: columnWidths[column.key] ?? column.width,
          minWidth: column.minWidth,
          maxWidth: column.maxWidth,
          sticky: column.pinned,
          sortable: column.sortable,
          render: (record) =>
            formatCell(
              record,
              column.field,
              column.format,
              column.currencyField,
              defaults.reportingCurrency,
              defaults.locale,
            ),
        })),
    [
      defaults.locale,
      defaults.reportingCurrency,
      columnOrder,
      columnWidths,
      definition.columns,
      visibleColumns,
    ],
  );

  const statusOptions = definition.statuses?.slice(0, 6) ?? [];

  return (
    <main className="space-y-5">
      <PageHeader
        eyebrow={definition.navigationGroup}
        title={definition.pluralDisplayName}
        description={definition.description}
        actions={
          <RuntimeViewSelector
            moduleKey={moduleKey}
            views={definition.views}
            defaultViewKey={defaultViewKey}
            roleKeys={roleKeys}
          />
        }
      />

      <ModuleActionBar
        actions={definition.actions}
        context={{ scope: "list", selectedIds, roleKeys, permissionKeys }}
        onAction={handleAction}
        statusSlot={
          <span className="text-xs font-medium text-slate-500">
            {formatNumber(data.meta.total)} records
          </span>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50/70 p-3">
          <form
            className="relative min-w-[260px] flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              updateQuery({ search: search.trim() || null, page: "1" });
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm outline-none transition focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[var(--admin-primary)]/10"
              placeholder={`Search ${definition.pluralDisplayName.toLowerCase()}`}
              aria-label={`Search ${definition.pluralDisplayName}`}
            />
            {search ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setSearch("");
                  updateQuery({ search: null, page: "1" });
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </form>

          {statusOptions.length ? (
            <select
              aria-label="Status filter"
              value={status ?? ""}
              onChange={(event) =>
                updateQuery({ status: event.target.value || null, page: "1" })
              }
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600"
            >
              <option value="">All statuses</option>
              {statusOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : null}

          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="runtime-filter-builder"
            onClick={() => setFiltersOpen((value) => !value)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters{filters.length ? ` (${filters.length})` : ""}
          </button>
          {savedFilters.length ? (
            <select
              aria-label="Apply saved filter"
              defaultValue=""
              onChange={(event) => {
                const saved = savedFilters.find(
                  (item) => item.id === event.target.value,
                );
                if (saved)
                  updateQuery({
                    filters: JSON.stringify(saved.filters),
                    page: "1",
                  });
                event.currentTarget.value = "";
              }}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600"
            >
              <option value="">Saved filters</option>
              {savedFilters.map((saved) => (
                <option key={saved.id} value={saved.id}>
                  {saved.label}
                </option>
              ))}
            </select>
          ) : null}
          <div className="relative">
            <button
              type="button"
              onClick={() => setColumnsOpen((value) => !value)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Columns3 className="h-4 w-4" />
              Columns
            </button>
            {columnsOpen ? (
              <div className="absolute right-0 top-12 z-40 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Visibility and order
                </p>
                {columnOrder.map((columnKey, index) => {
                  const column = definition.columns.find(
                    (candidate) => candidate.key === columnKey,
                  );
                  if (!column) return null;
                  return (
                    <div
                      key={column.key}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(column.key)}
                          onChange={() =>
                            setVisibleColumns((current) =>
                              current.includes(column.key)
                                ? current.filter((key) => key !== column.key)
                                : [...current, column.key],
                            )
                          }
                        />
                        <span className="truncate">{column.label}</span>
                      </label>
                      <button
                        type="button"
                        aria-label={`Move ${column.label} left`}
                        disabled={index === 0}
                        onClick={() =>
                          setColumnOrder((current) =>
                            moveItem(current, index, index - 1),
                          )
                        }
                        className="rounded p-1 hover:bg-white disabled:opacity-30"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${column.label} right`}
                        disabled={index === columnOrder.length - 1}
                        onClick={() =>
                          setColumnOrder((current) =>
                            moveItem(current, index, index + 1),
                          )
                        }
                        className="rounded p-1 hover:bg-white disabled:opacity-30"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setVisibleColumns(
                      definition.columns
                        .filter((column) => column.visible !== false)
                        .map((column) => column.key),
                    );
                    setColumnOrder(
                      definition.columns.map((column) => column.key),
                    );
                    setColumnWidths({});
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
                >
                  Reset columns
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {filtersOpen ? (
          <AdvancedFilterBuilder
            fields={definition.filterableFields}
            columns={definition.columns}
            filters={draftFilters}
            onChange={setDraftFilters}
            onApply={() => {
              updateQuery({
                filters: draftFilters.length
                  ? JSON.stringify(draftFilters)
                  : null,
                page: "1",
              });
              setFiltersOpen(false);
            }}
            onClear={() => {
              setDraftFilters([]);
              updateQuery({ filters: null, status: null, page: "1" });
            }}
            onSave={() => {
              if (!draftFilters.length) return;
              const label = window.prompt("Name this saved filter");
              if (!label?.trim()) return;
              setSavedFilters((current) => [
                ...current.filter(
                  (item) =>
                    item.label.toLowerCase() !== label.trim().toLowerCase(),
                ),
                {
                  id: crypto.randomUUID(),
                  label: label.trim(),
                  filters: draftFilters,
                },
              ]);
            }}
          />
        ) : null}

        {filters.length || status ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Active filters
            </span>
            {filters.map((filter, index) => (
              <button
                type="button"
                key={filter.id ?? `${filter.field}-${index}`}
                onClick={() =>
                  updateQuery({
                    filters: JSON.stringify(
                      filters.filter((_, candidate) => candidate !== index),
                    ),
                    page: "1",
                  })
                }
                className="inline-flex items-center gap-1 rounded-full border border-[var(--admin-primary)]/20 bg-[var(--admin-primary)]/5 px-2.5 py-1 text-xs font-semibold text-[var(--admin-primary)]"
                title="Remove filter"
              >
                {columnLabel(definition.columns, filter.field)}{" "}
                {filter.operator} {formatFilterValue(filter)}{" "}
                <X className="h-3 w-3" />
              </button>
            ))}
            {status ? (
              <button
                type="button"
                onClick={() => updateQuery({ status: null, page: "1" })}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--admin-primary)]/20 bg-[var(--admin-primary)]/5 px-2.5 py-1 text-xs font-semibold text-[var(--admin-primary)]"
              >
                Status is {formatEnumLabel(status)} <X className="h-3 w-3" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                updateQuery({ filters: null, status: null, page: "1" })
              }
              className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Clear all
            </button>
          </div>
        ) : null}

        {error ? (
          <div
            className="border-b border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700"
            role="alert"
          >
            <p>{error}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setRefreshKey((value) => value + 1)}
                className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() =>
                  updateQuery({
                    viewId: null,
                    filters: null,
                    sort: null,
                    sortField: null,
                    sortDirection: null,
                    status: null,
                    page: "1",
                  })
                }
                className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700"
              >
                Reset view
              </button>
            </div>
          </div>
        ) : null}
        {!error ? (
          <ProDataTable
            rows={data.items}
            columns={columns}
            rowKey={(row) => row.id}
            selectable
            selectedRowIds={selectedIds}
            onToggleRow={(id) =>
              setSelectedIds((current) =>
                current.includes(id)
                  ? current.filter((item) => item !== id)
                  : [...current, id],
              )
            }
            onToggleAll={(checked) =>
              setSelectedIds(checked ? data.items.map((item) => item.id) : [])
            }
            loading={loading}
            stickyHeader
            stickyPagination
            maxHeight="calc(100vh - 330px)"
            onRowClick={(record) =>
              router.push(`${definition.routeBase}/${record.id}`)
            }
            sorts={sorts}
            onSortsChange={(next) =>
              updateQuery({
                sort: JSON.stringify(next),
                sortField: null,
                sortDirection: null,
                page: "1",
              })
            }
            onColumnResize={(columnKey, width) =>
              setColumnWidths((current) => ({ ...current, [columnKey]: width }))
            }
            pagination={{
              page: data.meta.page,
              pageSize: data.meta.pageSize,
              totalRecords: data.meta.total,
              onPageChange: (next) => updateQuery({ page: String(next) }),
              pageSizeOptions: [10, 25, 50, 100],
              onPageSizeChange: (next) =>
                updateQuery({ pageSize: String(next), page: "1" }),
            }}
            emptyTitle={definition.emptyState.title}
            emptyDescription={definition.emptyState.description}
            compact
          />
        ) : null}
      </section>

      {assignOpen ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assign-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2
              id="assign-title"
              className="text-lg font-semibold text-slate-950"
            >
              Assign {selectedIds.length} record
              {selectedIds.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Choose a platform administrator or team member who owns the next
              action.
            </p>
            <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Support owner or team
            </label>
            <select
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            >
              <option value="">Unassigned</option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {[operator.firstName, operator.lastName]
                    .filter(Boolean)
                    .join(" ") || operator.email}
                </option>
              ))}
            </select>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void assignSelected()}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${active ? "bg-[var(--admin-primary)] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
    >
      {label}
    </button>
  );
}

const FILTER_OPERATORS: Array<{
  value: RuntimeFilter["operator"];
  label: string;
}> = [
  { value: "eq", label: "is" },
  { value: "ne", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "at least" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "at most" },
  { value: "isNull", label: "is empty" },
  { value: "isNotNull", label: "is not empty" },
];

function AdvancedFilterBuilder({
  fields,
  columns,
  filters,
  onChange,
  onApply,
  onClear,
  onSave,
}: {
  fields: string[];
  columns: RuntimeColumnDefinition[];
  filters: RuntimeFilter[];
  onChange: (filters: RuntimeFilter[]) => void;
  onApply: () => void;
  onClear: () => void;
  onSave: () => void;
}) {
  function update(index: number, next: Partial<RuntimeFilter>) {
    onChange(
      filters.map((filter, candidate) =>
        candidate === index ? { ...filter, ...next } : filter,
      ),
    );
  }
  return (
    <section
      id="runtime-filter-builder"
      aria-label="Advanced filters"
      className="border-b border-slate-200 bg-slate-50/60 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Advanced filters
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            All conditions are applied together and remain in the page URL.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...filters,
              {
                id: crypto.randomUUID(),
                field: fields[0] ?? columns[0]?.field ?? "status",
                operator: "eq",
                value: "",
              },
            ])
          }
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add condition
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {filters.map((filter, index) => {
          const withoutValue = ["isNull", "isNotNull"].includes(
            filter.operator,
          );
          return (
            <div
              key={filter.id ?? index}
              className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2 md:grid-cols-[minmax(150px,1fr)_160px_minmax(180px,1.4fr)_36px]"
            >
              <select
                aria-label={`Filter ${index + 1} field`}
                value={filter.field}
                onChange={(event) =>
                  update(index, { field: event.target.value, value: "" })
                }
                className="h-10 rounded-lg border border-slate-200 px-2 text-sm"
              >
                {fields.map((field) => (
                  <option key={field} value={field}>
                    {columnLabel(columns, field)}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Filter ${index + 1} operator`}
                value={filter.operator}
                onChange={(event) =>
                  update(index, {
                    operator: event.target.value as RuntimeFilter["operator"],
                  })
                }
                className="h-10 rounded-lg border border-slate-200 px-2 text-sm"
              >
                {FILTER_OPERATORS.map((operator) => (
                  <option key={operator.value} value={operator.value}>
                    {operator.label}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Filter ${index + 1} value`}
                disabled={withoutValue}
                value={String(filter.value ?? "")}
                onChange={(event) =>
                  update(index, { value: event.target.value })
                }
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50"
                placeholder={
                  withoutValue ? "No value required" : "Filter value"
                }
              />
              <button
                type="button"
                aria-label={`Remove filter ${index + 1}`}
                onClick={() =>
                  onChange(
                    filters.filter((_, candidate) => candidate !== index),
                  )
                }
                className="grid h-10 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {!filters.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            Add a condition to filter this view by any configured column.
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={onClear}
          className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-white"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={!filters.length}
          onClick={onSave}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
        >
          <Bookmark className="h-3.5 w-3.5" /> Save filter
        </button>
        <button
          type="button"
          onClick={onApply}
          className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-semibold text-white"
        >
          Apply filters
        </button>
      </div>
    </section>
  );
}

function formatCell(
  record: RuntimeRecord,
  field: string,
  format: string | undefined,
  currencyField: string | undefined,
  reportingCurrency: string,
  locale: string,
) {
  const value = readPath(record, field);
  if (value == null || value === "")
    return <span className="text-slate-400">—</span>;
  if (format === "status")
    return (
      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${typeof value === "boolean" ? (value ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600") : "border-slate-200 bg-slate-50 text-slate-700"}`}>
        {typeof value === "boolean"
          ? value
            ? "Active"
            : "Inactive"
          : formatEnumLabel(String(value))}
      </span>
    );
  if (format === "currency") {
    const currency = String(
      (currencyField ? readPath(record, currencyField) : undefined) ??
        record.currency ??
        record.currencyCode ??
        reportingCurrency,
    );
    return (
      <span className="font-semibold text-slate-900">
        {formatCurrency(Number(value), currency)}
      </span>
    );
  }
  if (format === "percentage")
    return `${formatNumber(Number(value), { maximumFractionDigits: 2 })}%`;
  if (format === "number")
    return formatNumber(Array.isArray(value) ? value.length : Number(value));
  if (format === "date") return formatDate(String(value));
  if (format === "dateTime")
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(String(value)));
  if (typeof value === "object")
    return String(
      (value as Record<string, unknown>).name ??
        (value as Record<string, unknown>).displayName ??
        (value as Record<string, unknown>).fullName ??
        "—",
    );
  return <span className="text-slate-800">{String(value)}</span>;
}

function readPath(record: RuntimeRecord, path: string) {
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      record,
    );
}

function positive(value: string | null, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function readFilters(
  value: string | null,
  moduleKey: PlatformModuleKey,
): RuntimeFilter[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RuntimeFilter =>
        Boolean(
          item &&
          typeof item === "object" &&
          typeof (item as RuntimeFilter).field === "string" &&
          typeof (item as RuntimeFilter).operator === "string",
        ),
      )
      .filter((item) =>
        Boolean(resolveRuntimeField(moduleKey, item.field)?.filterable),
      )
      .slice(0, 25);
  } catch {
    return [];
  }
}

function readSorts(
  value: string | null,
  moduleKey: PlatformModuleKey,
): RuntimeSort[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    const result = parsed
      .filter((item): item is RuntimeSort =>
        Boolean(
          item &&
          typeof item === "object" &&
          typeof (item as RuntimeSort).field === "string" &&
          ["asc", "desc"].includes((item as RuntimeSort).direction),
        ),
      )
      .filter((item) =>
        Boolean(resolveRuntimeField(moduleKey, item.field)?.sortable),
      )
      .slice(0, 3);
    return result.length ? result : null;
  } catch {
    return null;
  }
}

function normalizeColumnOrder(current: string[], available: string[]) {
  return [
    ...current.filter((key) => available.includes(key)),
    ...available.filter((key) => !current.includes(key)),
  ];
}

function moveItem(values: string[], from: number, to: number) {
  if (to < 0 || to >= values.length || from === to) return values;
  const next = [...values];
  const [item] = next.splice(from, 1);
  if (item) next.splice(to, 0, item);
  return next;
}

function columnLabel(columns: RuntimeColumnDefinition[], field: string) {
  return (
    columns.find((column) => column.field === field)?.label ??
    field.replaceAll(".", " ")
  );
}

function formatFilterValue(filter: RuntimeFilter) {
  if (["isNull", "isNotNull"].includes(filter.operator)) return "";
  if (Array.isArray(filter.values)) return filter.values.join(", ");
  return String(filter.value ?? "");
}
