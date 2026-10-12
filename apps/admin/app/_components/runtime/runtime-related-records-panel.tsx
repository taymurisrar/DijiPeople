"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2 } from "lucide-react";
import {
  ProDataTable,
  type ProDataTableColumn,
} from "@/app/_components/crm/data-table";
import { reportedRequestInit } from "@/lib/background-request";
import { createHttpModuleRuntimeAdapter } from "@/lib/runtime/http-module-runtime-adapter";
import { describeDestructiveConfirm } from "@/lib/runtime/destructive-confirm";
import { readDeleteOutcome } from "@/lib/runtime/runtime-action-outcome";
import {
  canDeleteFromSubgrid,
  EMPTY_SELECTION,
  keepRefused,
  SELECT_ALL_LIMIT,
  SELECT_ALL_PAGE,
  selectionSummary,
  selectRows,
  subgridRowLabel,
  toggleRow,
  togglePage,
  type SubgridSelection,
} from "@/lib/runtime/subgrid-selection";
import { getPlatformModuleDefinition } from "@/lib/runtime/platform-module-registry";
import type {
  PlatformModuleDefinition,
  RuntimeColumnDefinition,
  RuntimeRecord,
  RuntimeRelatedRecordDefinition,
  RuntimeRelatedRowAction,
} from "@/lib/runtime/platform-runtime.types";
import { quickCreateAvailability } from "@/lib/runtime/quick-create-model";
import {
  copyText,
  isRowActionVisible,
  RELATED_PANEL_CLASS,
  relatedCellValue,
  resolveRowActionPath,
  ROW_ACTIONS_COLUMN_LAYOUT,
  rowActionRequest,
  shareableUrl,
} from "@/lib/runtime/related-records-model";
import { hasRuntimePermission } from "@/lib/runtime/runtime-permissions";
import {
  PanelButton,
  PanelDialog,
} from "@/app/_components/tenants/tenant-panel-ui";
import { RuntimeQuickCreatePanel } from "./runtime-quick-create-panel";
import { DependencyAwareDeleteDialog } from "./dependency-aware-delete-dialog";

const PAGE_SIZE = 10;

/**
 * A subgrid on a record page.
 *
 * EXECPLAN-0055 WP-08: cells are formatted by the column's declared `format`
 * and `link` (they used to print raw numbers and ignore links); a subgrid that
 * declares `quickCreate` gets an Add button in its header and in its empty
 * state, which opens the side panel and reloads this grid on success; rows can
 * carry commands (copy a referral link, disable it); and the grid pages
 * instead of silently showing the first ten. `refreshKey` reloads it after a
 * record-level action changed what it lists.
 *
 * Every subgrid whose target module permits deletion also gets per-row Delete,
 * row and page selection, "Select all", and Delete selected — one
 * implementation for all of them (`subgrid-selection.ts`). The confirmation
 * asks the API what the delete would do first where the module answers that,
 * and the API decides; refused rows stay selected with the reason shown.
 */
export function RuntimeRelatedRecordsPanel({
  adapter,
  recordId,
  record,
  relationship,
  parentDefinition,
  roleKeys,
  permissionKeys,
  refreshKey = 0,
  onChanged,
}: {
  adapter: ReturnType<typeof createHttpModuleRuntimeAdapter>;
  recordId: string;
  record: Record<string, unknown>;
  relationship: RuntimeRelatedRecordDefinition;
  parentDefinition: PlatformModuleDefinition;
  roleKeys: string[];
  permissionKeys: string[];
  refreshKey?: number;
  /** After a create or row command, so the parent record can refresh too. */
  onChanged?: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<RuntimeRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    action: RuntimeRelatedRowAction;
    row: RuntimeRecord;
  } | null>(null);
  const [selection, setSelection] =
    useState<SubgridSelection>(EMPTY_SELECTION);
  const [pendingDelete, setPendingDelete] = useState<SubgridSelection | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

  // A different parent or relationship is a different list.
  useEffect(() => {
    setSelection(EMPTY_SELECTION);
  }, [recordId, relationship.key]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    adapter
      .getRelatedRecords(recordId, relationship.key, {
        page,
        pageSize: PAGE_SIZE,
        signal: controller.signal,
      })
      .then((response) => {
        setItems(response.items);
        setTotal(response.meta?.total ?? response.items.length);
        setError(null);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load related records.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [adapter, recordId, relationship.key, page, refreshKey, reloads]);

  const target = relationship.module
    ? getPlatformModuleDefinition(relationship.module)
    : null;
  const context = { roleKeys, permissionKeys };
  const canDelete = canDeleteFromSubgrid(target, context);
  const targetKey = target?.key;
  const targetAdapter = useMemo(
    () => (targetKey ? createHttpModuleRuntimeAdapter(targetKey) : null),
    [targetKey],
  );
  const quickCreate = relationship.quickCreate;
  const canCreate =
    quickCreate &&
    hasRuntimePermission(
      quickCreate.permission ?? parentDefinition.permissions.update,
      context,
    );
  const availability = quickCreate
    ? quickCreateAvailability(quickCreate, record)
    : null;
  const rowActions = (relationship.rowActions ?? []).filter((action) =>
    hasRuntimePermission(action.permission, context),
  );

  async function reload() {
    setReloads((value) => value + 1);
    await onChanged?.();
  }

  async function runRowAction(
    action: RuntimeRelatedRowAction,
    row: RuntimeRecord,
    confirmed = false,
  ) {
    setNotice(null);
    if (action.kind === "copy") {
      const url = shareableUrl(row[action.field ?? ""]);
      const copied = url ? await copyText(url) : false;
      setNotice(
        copied
          ? { text: action.successMessage ?? "Copied.", failed: false }
          : { text: "Copying is not available in this browser.", failed: true },
      );
      return;
    }
    if (action.confirmTitle && !confirmed) {
      setPendingConfirm({ action, row });
      return;
    }
    setBusyRow(`${row.id}:${action.key}`);
    try {
      const response = await fetch(
        resolveRowActionPath(action, recordId, row),
        reportedRequestInit(rowActionRequest(action)),
      );
      const payload = (await response.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      if (!response.ok) {
        setNotice({
          text:
            typeof payload?.message === "string"
              ? payload.message
              : `${action.label} could not be completed.`,
          failed: true,
        });
        return;
      }
      setNotice({
        text: action.successMessage ?? `${action.label} done.`,
        failed: false,
      });
      await reload();
    } catch {
      setNotice({
        text: `${action.label} could not be completed. Check your connection and try again.`,
        failed: true,
      });
    } finally {
      setBusyRow(null);
    }
  }

  /*
   * "Select all" means every related record, not the ten on screen: the ids are
   * gathered page by page from the same endpoint, up to SELECT_ALL_LIMIT.
   */
  async function selectAllRelated() {
    setSelectingAll(true);
    setNotice(null);
    try {
      const gathered: RuntimeRecord[] = [];
      for (
        let next = 1;
        gathered.length < Math.min(total, SELECT_ALL_LIMIT);
        next += 1
      ) {
        const response = await adapter.getRelatedRecords(
          recordId,
          relationship.key,
          { page: next, pageSize: SELECT_ALL_PAGE },
        );
        gathered.push(...response.items);
        if (response.items.length < SELECT_ALL_PAGE) break;
      }
      setSelection(selectRows(gathered.slice(0, SELECT_ALL_LIMIT)));
      if (total > SELECT_ALL_LIMIT)
        setNotice({
          text: `Selected the first ${SELECT_ALL_LIMIT} of ${total}.`,
          failed: false,
        });
    } catch {
      setNotice({
        text: "Could not select every record. Check your connection and try again.",
        failed: true,
      });
    } finally {
      setSelectingAll(false);
    }
  }

  async function deleteSelected(chosen: SubgridSelection) {
    if (!targetAdapter) return;
    setPendingDelete(null);
    setDeleting(true);
    setNotice(null);
    try {
      const raw = await targetAdapter.bulkDelete([...chosen.keys()]);
      const outcome = readDeleteOutcome(raw);
      const data = (raw?.data ?? {}) as { refused?: Array<{ id?: unknown }> };
      const refusedIds = (Array.isArray(data.refused) ? data.refused : [])
        .map((item) => (typeof item?.id === "string" ? item.id : null))
        .filter((id): id is string => Boolean(id));
      setNotice({
        text:
          outcome.message ??
          (outcome.success ? "Deleted." : "Nothing was deleted."),
        failed: !outcome.success,
      });
      setSelection((current) => keepRefused(current, refusedIds));
      setPage(1);
      await reload();
    } catch (reason) {
      setNotice({
        text:
          reason instanceof Error
            ? reason.message
            : "The delete could not be completed.",
        failed: true,
      });
    } finally {
      setDeleting(false);
    }
  }

  const configuredColumns: RuntimeColumnDefinition[] =
    relationship.columns ??
    target?.columns.slice(0, 4) ??
    relatedFallbackColumns(relationship.key);
  const columns = configuredColumns.map<ProDataTableColumn<RuntimeRecord>>(
    (column) => ({
      key: column.key,
      header: column.label,
      minWidth: column.minWidth ?? 120,
      width: column.width,
      render: (row) => <RelatedCellView row={row} column={column} />,
    }),
  );
  if (rowActions.length || canDelete)
    columns.push({
      key: "__actions",
      header: "",
      align: "right",
      ...ROW_ACTIONS_COLUMN_LAYOUT,
      render: (row) => (
        <span className="inline-flex flex-nowrap justify-end gap-1.5">
          {rowActions
            .filter((action) => isRowActionVisible(action, row))
            .map((action) => (
              <button
                key={action.key}
                type="button"
                disabled={busyRow !== null}
                onClick={(event) => {
                  event.stopPropagation();
                  void runRowAction(action, row);
                }}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold disabled:opacity-40 ${
                  action.destructive
                    ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {action.kind === "copy" ? (
                  <Copy className="h-3 w-3" aria-hidden />
                ) : null}
                {busyRow === `${row.id}:${action.key}`
                  ? "Working…"
                  : action.label}
              </button>
            ))}
          {canDelete ? (
            <button
              type="button"
              disabled={busyRow !== null || deleting}
              aria-label={`Delete ${subgridRowLabel(row)}`}
              onClick={(event) => {
                event.stopPropagation();
                setPendingDelete(new Map([[row.id, subgridRowLabel(row)]]));
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
              Delete
            </button>
          ) : null}
        </span>
      ),
    });

  const addButton =
    quickCreate && canCreate ? (
      <button
        type="button"
        onClick={() => setCreating(true)}
        disabled={!availability?.available}
        title={
          availability && !availability.available
            ? availability.reason
            : undefined
        }
        className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        {quickCreate.actionLabel}
      </button>
    ) : null;
  const rowHrefBase = target?.routeBase;
  const selectedOnPage = items
    .filter((row) => selection.has(row.id))
    .map((row) => row.id);
  const summary = selectionSummary(selection.size, total);
  const deleteCopy = pendingDelete
    ? describeDestructiveConfirm({
        labels: [...pendingDelete.values()],
        count: pendingDelete.size,
        singular: target?.displayName ?? "record",
        plural: target?.pluralDisplayName ?? "records",
      })
    : null;

  return (
    <section className={RELATED_PANEL_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-950">
            {relationship.label}
            {!loading && total ? (
              <span className="ml-2 text-xs font-semibold text-slate-500">
                {total}
              </span>
            ) : null}
          </h2>
          {relationship.description ? (
            <p className="mt-1 text-xs text-slate-500">
              {relationship.description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {relationship.createHref ? (
            <Link
              href={relationship.createHref}
              className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
            >
              Add
            </Link>
          ) : null}
          {addButton}
          {target && relationship.viewAll !== false ? (
            /*
             * "View all" carries the relationship's own foreign key through to
             * the target list, so it opens that module already filtered to this
             * record instead of dropping the operator into every row in the
             * platform.
             */
            <Link
              href={`${target.routeBase}?filters=${encodeURIComponent(
                JSON.stringify([
                  {
                    field: relationship.foreignKey,
                    operator: "eq",
                    value: recordId,
                  },
                ]),
              )}`}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              View all
            </Link>
          ) : null}
        </div>
      </div>
      {canDelete && summary ? (
        <div
          role="region"
          aria-label={`${relationship.label} selection`}
          className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs"
        >
          <span className="font-semibold text-slate-800" aria-live="polite">
            {summary}
          </span>
          {selection.size < total ? (
            <button
              type="button"
              onClick={() => void selectAllRelated()}
              disabled={selectingAll || deleting}
              className="font-semibold text-[var(--admin-primary)] hover:underline disabled:opacity-40"
            >
              {selectingAll ? "Selecting…" : `Select all ${total}`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSelection(EMPTY_SELECTION)}
            disabled={deleting}
            className="font-semibold text-slate-600 hover:underline disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(selection)}
            disabled={deleting || selectingAll}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {deleting ? "Deleting…" : `Delete selected (${selection.size})`}
          </button>
        </div>
      ) : null}
      {availability && !availability.available && canCreate ? (
        <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          {availability.reason}
        </p>
      ) : null}
      {notice ? (
        <p
          role={notice.failed ? "alert" : "status"}
          className={`border-b border-slate-100 px-4 py-2 text-xs font-medium ${notice.failed ? "text-rose-700" : "text-emerald-700"}`}
        >
          {notice.text}
        </p>
      ) : null}
      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-rose-700" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setReloads((value) => value + 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Retry
          </button>
        </div>
      ) : (
        <ProDataTable
          rows={items}
          columns={columns}
          rowKey={(row) => row.id}
          loading={loading || deleting}
          loadingRowCount={3}
          compact
          selectable={canDelete && items.length > 0}
          selectedRowIds={selectedOnPage}
          onToggleRow={(_id, row) =>
            setSelection((current) => toggleRow(current, row))
          }
          onToggleAll={(checked) =>
            setSelection((current) => togglePage(current, items, checked))
          }
          getRowClassName={
            rowActions.length || canDelete ? () => "group" : undefined
          }
          emptyState={
            <div className="mx-auto max-w-md">
              <div className="text-base font-semibold text-slate-900">
                {relationship.emptyTitle ??
                  `No ${relationship.label.toLowerCase()}`}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {relationship.emptyDescription ??
                  "Nothing has been linked to this record yet."}
              </div>
              {addButton && availability?.available ? (
                <div className="mt-4 flex justify-center">{addButton}</div>
              ) : null}
            </div>
          }
          onRowClick={
            rowHrefBase
              ? (row) => router.push(`${rowHrefBase}/${row.id}`)
              : undefined
          }
          pagination={
            total > PAGE_SIZE
              ? {
                  page,
                  pageSize: PAGE_SIZE,
                  totalRecords: total,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      )}
      {creating && quickCreate ? (
        <RuntimeQuickCreatePanel
          config={quickCreate}
          childModule={relationship.module}
          parentId={recordId}
          parent={record}
          roleKeys={roleKeys}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setPage(1);
            await reload();
          }}
        />
      ) : null}
      {pendingDelete && deleteCopy && targetAdapter?.getDependencies ? (
        <DependencyAwareDeleteDialog
          title={deleteCopy.title}
          description={deleteCopy.description}
          names={deleteCopy.names}
          targets={[...pendingDelete].map(([id, label]) => ({ id, label }))}
          getDependencies={targetAdapter.getDependencies}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void deleteSelected(pendingDelete)}
        />
      ) : pendingDelete && deleteCopy ? (
        <PanelDialog
          title={deleteCopy.title}
          description={deleteCopy.description}
          tone="danger"
          onClose={() => setPendingDelete(null)}
          footer={
            <>
              <PanelButton onClick={() => setPendingDelete(null)}>
                Cancel
              </PanelButton>
              <PanelButton
                variant="danger"
                onClick={() => void deleteSelected(pendingDelete)}
              >
                Delete
              </PanelButton>
            </>
          }
        >
          {deleteCopy.names.length ? (
            <ul className="max-h-32 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              {deleteCopy.names.map((name) => (
                <li key={name} className="truncate">
                  {name}
                </li>
              ))}
            </ul>
          ) : null}
        </PanelDialog>
      ) : null}
      {pendingConfirm ? (
        <PanelDialog
          title={pendingConfirm.action.confirmTitle ?? pendingConfirm.action.label}
          tone={pendingConfirm.action.destructive ? "danger" : "default"}
          onClose={() => setPendingConfirm(null)}
          footer={
            <>
              <PanelButton onClick={() => setPendingConfirm(null)}>
                Cancel
              </PanelButton>
              <PanelButton
                variant={pendingConfirm.action.destructive ? "danger" : "primary"}
                onClick={() => {
                  const { action, row } = pendingConfirm;
                  setPendingConfirm(null);
                  void runRowAction(action, row, true);
                }}
              >
                {pendingConfirm.action.label}
              </PanelButton>
            </>
          }
        >
          <p className="text-sm text-slate-700">
            {String(
              pendingConfirm.row.name ??
                pendingConfirm.row.fullName ??
                pendingConfirm.row.code ??
                pendingConfirm.row.displayName ??
                "",
            )}
          </p>
        </PanelDialog>
      ) : null}
    </section>
  );
}

function RelatedCellView({
  row,
  column,
}: {
  row: RuntimeRecord;
  column: RuntimeColumnDefinition;
}) {
  const cell = relatedCellValue(row, column);
  if (cell.kind === "empty") return <span className="text-slate-400">—</span>;
  if (cell.kind === "status")
    return (
      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
        {cell.text}
      </span>
    );
  if (cell.href)
    return (
      <Link
        href={cell.href}
        onClick={(event) => event.stopPropagation()}
        className="font-medium text-[var(--admin-primary)] hover:underline"
      >
        {cell.text}
      </Link>
    );
  return <span className="text-slate-800">{cell.text}</span>;
}

export function relatedFallbackColumns(key: string): RuntimeColumnDefinition[] {
  if (key === "documents" || key === "attachments")
    return [
      { key: "fileName", field: "fileName", label: "File" },
      { key: "mimeType", field: "mimeType", label: "Type" },
      { key: "createdAt", field: "createdAt", label: "Created", format: "dateTime" },
    ];
  if (key === "approvalRequests")
    return [
      { key: "requestNumber", field: "requestNumber", label: "Approval" },
      { key: "status", field: "status", label: "Status", format: "status" },
      { key: "createdAt", field: "createdAt", label: "Created", format: "dateTime" },
    ];
  return [
    { key: "reference", field: "displayName", label: "Record" },
    { key: "status", field: "status", label: "Status", format: "status" },
    { key: "createdAt", field: "createdAt", label: "Created", format: "dateTime" },
  ];
}
