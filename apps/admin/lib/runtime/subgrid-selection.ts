import { recordDisplayName } from "./destructive-confirm";
import type { PlatformModuleDefinition } from "./platform-runtime.types";
import { hasRuntimePermission } from "./runtime-permissions";

/**
 * Selection and deletion for a subgrid (a related-records table on a record).
 *
 * Subgrids had no selection and no delete at all, so a draft agreement on a
 * customer could only be removed by leaving the customer — and on contracts not
 * even then. Every subgrid now gets the same commands from one place: per-row
 * Delete, select a row, select the page, select every related record, and
 * delete the selection. What may be deleted is the *target* module's decision
 * (its capability and delete permission); the API re-checks everything.
 *
 * Deleting from a subgrid deletes the related record itself. Relationships in
 * this console are foreign keys owned by the child, so there is no separate
 * "unlink" to offer: removing the row from the parent and deleting the record
 * are the same act, and the confirmation says "permanently deletes" because it
 * does. Nothing outside the selection is touched beyond what the dependency
 * dialog lists as going with it.
 */

/** Selected ids → display labels, kept across pages. */
export type SubgridSelection = ReadonlyMap<string, string>;

export const EMPTY_SELECTION: SubgridSelection = new Map();

/** Largest selection "Select all" will gather, in pages of `SELECT_ALL_PAGE`. */
export const SELECT_ALL_LIMIT = 500;
export const SELECT_ALL_PAGE = 100;

export function canDeleteFromSubgrid(
  target: PlatformModuleDefinition | null,
  context: { roleKeys: string[]; permissionKeys: string[] },
) {
  if (!target?.capabilities.delete) return false;
  return hasRuntimePermission(
    target.permissions.delete ?? target.permissions.update,
    context,
  );
}

/** A label for a related row, never its id. */
export function subgridRowLabel(row: Record<string, unknown>) {
  const candidates = [
    row.contractNumber && row.title
      ? `${String(row.contractNumber)} — ${String(row.title)}`
      : undefined,
    row.requestNumber,
    row.invoiceNumber,
  ];
  const found = candidates.find(
    (item) => typeof item === "string" && item.trim(),
  );
  if (found) return String(found);
  const name = recordDisplayName({ ...row, id: undefined });
  return name ?? "Untitled record";
}

export function toggleRow(
  selection: SubgridSelection,
  row: Record<string, unknown> & { id: string },
): SubgridSelection {
  const next = new Map(selection);
  if (next.has(row.id)) next.delete(row.id);
  else next.set(row.id, subgridRowLabel(row));
  return next;
}

/** Header checkbox: select or clear this page, keeping other pages' picks. */
export function togglePage(
  selection: SubgridSelection,
  rows: Array<Record<string, unknown> & { id: string }>,
  checked: boolean,
): SubgridSelection {
  const next = new Map(selection);
  for (const row of rows) {
    if (checked) next.set(row.id, subgridRowLabel(row));
    else next.delete(row.id);
  }
  return next;
}

export function selectRows(
  rows: Array<Record<string, unknown> & { id: string }>,
): SubgridSelection {
  return togglePage(EMPTY_SELECTION, rows, true);
}

/** The ids a delete refused stay selected, so the operator sees what is left. */
export function keepRefused(
  selection: SubgridSelection,
  refusedIds: string[],
): SubgridSelection {
  const keep = new Set(refusedIds);
  return new Map([...selection].filter(([id]) => keep.has(id)));
}

export function selectionSummary(count: number, total: number) {
  if (!count) return null;
  return count === total && total > 1
    ? `All ${total} selected`
    : `${count} selected`;
}
