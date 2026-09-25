type VisibilityCondition = {
  field: string;
  equals?: unknown;
  in?: unknown[];
  hasValue?: boolean;
};

type FormField = {
  key: string;
  tab?: string;
  type?: string;
  hidden?: boolean;
  readOnly?: boolean;
  readOnlyWhen?: { field: string; equals: unknown };
  visibleWhen?: VisibilityCondition;
  visibleWhenAny?: VisibilityCondition[];
};

type FormTab = { key: string };

/*
 * Which tab clicking Edit should land the operator on (BUG-3546).
 *
 * The runtime record page enables Edit/Save whenever the module has *any*
 * writable field, with no regard for which tab holds it or which tab is
 * currently selected. On `tenants`, the three writable fields
 * (`name`/`displayName`/`legalName`) live on the Configuration tab, while
 * Overview — the default landing tab — has none: Edit lit up Save with
 * nothing on screen to change.
 *
 * This mirrors, deliberately as a second small copy rather than an import,
 * the field-shape and visibility rules `runtime-form.tsx`'s (unexported)
 * `isVisible`/`isConditionallyReadOnly` already enforce when it decides what
 * to render — that file is a "use client" component module pulling in
 * `ProDataTable` and friends, and this needs to run as plain pure logic
 * (`apps/admin`'s jest config has no jsdom) *before* any of that renders, so
 * it cannot import the component module. A field only counts as "editable"
 * here under the same conditions it would actually render as an input there:
 * not one of the non-input types (`timeline`/`relatedRecords`/`process`),
 * not `hidden`, its `visibleWhen`/`visibleWhenAny` condition (if any) met
 * against the current values, and not `readOnly` or blocked by
 * `readOnlyWhen`.
 */
const NON_INPUT_TYPES = new Set(["timeline", "relatedRecords", "process"]);

function matchesVisibility(
  condition: VisibilityCondition,
  values: Record<string, unknown>,
): boolean {
  const value = values[condition.field];
  if (condition.hasValue !== undefined)
    return condition.hasValue
      ? value != null && value !== ""
      : value == null || value === "";
  if (condition.in) return condition.in.includes(value);
  return value === condition.equals;
}

function isFieldVisible(
  field: FormField,
  values: Record<string, unknown>,
): boolean {
  if (field.hidden) return false;
  if (field.visibleWhenAny?.length)
    return field.visibleWhenAny.some((condition) =>
      matchesVisibility(condition, values),
    );
  if (!field.visibleWhen) return true;
  return matchesVisibility(field.visibleWhen, values);
}

function isFieldEditable(
  field: FormField,
  values: Record<string, unknown>,
): boolean {
  if (field.type && NON_INPUT_TYPES.has(field.type)) return false;
  if (!isFieldVisible(field, values)) return false;
  if (field.readOnly) return false;
  if (
    field.readOnlyWhen &&
    values[field.readOnlyWhen.field] === field.readOnlyWhen.equals
  )
    return false;
  return true;
}

/** Whether the named tab currently has at least one field the operator could edit. */
export function tabHasEditableField(
  fields: readonly FormField[],
  values: Record<string, unknown>,
  tab: string,
): boolean {
  return fields.some((field) => field.tab === tab && isFieldEditable(field, values));
}

/**
 * The tab Edit should switch to, or `null` when the current tab already has
 * something editable and no switch is needed.
 *
 * Returns the first tab (in the record's own tab order) that has an editable
 * field, or `null` if none does — a fully read-only record leaves the
 * current tab alone rather than jumping somewhere arbitrary.
 */
export function editEntryTab(
  tabs: readonly FormTab[],
  fields: readonly FormField[],
  values: Record<string, unknown>,
  currentTab: string,
): string | null {
  if (tabHasEditableField(fields, values, currentTab)) return null;
  const target = tabs.find((tab) => tabHasEditableField(fields, values, tab.key));
  return target ? target.key : null;
}
