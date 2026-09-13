import type {
  FieldMetadata,
  RelatedSubgridMetadata,
} from "./metadata-runtime.types";

/**
 * Pure decisions the related-records subgrid makes per row, kept out of the
 * client component so they can be tested (`apps/web` jest has no DOM).
 */

type RowAction = NonNullable<RelatedSubgridMetadata["rowActions"]>[number];

/**
 * ITEM-0179 — the declared row actions this viewer may run on this row. An
 * action is hidden, not disabled, when the viewer lacks its permission or the
 * row already is what the action would make it (Make primary on the primary
 * site). The API enforces the permission regardless.
 */
export function visibleRowActions(
  actions: RelatedSubgridMetadata["rowActions"],
  row: Readonly<Record<string, unknown>>,
  hasPermission: (permissions: RowAction["permissions"]) => boolean,
): RowAction[] {
  return (actions ?? []).filter(
    (action) =>
      hasPermission(action.permissions) &&
      !(action.hiddenWhenFieldTrue && row[action.hiddenWhenFieldTrue] === true),
  );
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/**
 * ITEM-0184 (C4) — a column with no field metadata printed its raw value, so
 * the Assign Roles tab's "Assigned On" read `2026-09-12T22:36:04.512Z`. A
 * serialised timestamp is recognised by its shape, not by its column name —
 * a name rule would also match `location` or `description` — and formatted
 * as a date-time through the tenant's formatting context.
 */
export function timestampFieldFor(
  fieldLogicalName: string,
  value: unknown,
): FieldMetadata | undefined {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return undefined;
  if (Number.isNaN(Date.parse(value))) return undefined;
  return {
    id: fieldLogicalName,
    logicalName: fieldLogicalName,
    displayName: fieldLogicalName,
    version: "1.0.0",
    lifecycleState: "published",
    layer: "system",
    entityLogicalName: "",
    dataType: "datetime",
    requirementLevel: "none",
    behavior: "readonly",
  };
}
