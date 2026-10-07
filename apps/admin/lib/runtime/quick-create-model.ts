import type {
  RuntimeFieldDefinition,
  RuntimeFormDefinition,
  RuntimeQuickCreateDefinition,
} from "./platform-runtime.types";

/**
 * The quick-create side panel's rules, without the panel (EXECPLAN-0055 D8).
 *
 * A subgrid declares what its Add button creates (`relatedRecords[].quickCreate`)
 * and this module turns that declaration into the fields to render, the values
 * they start with, the request that is sent and how its failure is reported.
 * Tested here because the rules are where the defects would be: a parent id
 * the operator could change, a stray field that `forbidNonWhitelisted` refuses
 * the whole create for, or a double click that records two commissions.
 */

export const QUICK_CREATE_SECTION = "quick-create";

/**
 * The fields the panel renders.
 *
 * A key reuses the child module's own create-form field — label, control,
 * lookup and validation — so the panel and the full create form cannot drift.
 * The parent field is never rendered: the record the operator is standing on
 * is the parent, and offering it as a choice is how a commission ends up on
 * the wrong partner. An unknown key throws, so a registry typo fails a test
 * rather than silently dropping a field.
 */
export function resolveQuickCreateFields(
  config: RuntimeQuickCreateDefinition,
  childFields: RuntimeFieldDefinition[] = [],
): RuntimeFieldDefinition[] {
  const byKey = new Map(childFields.map((field) => [field.key, field]));
  return config.fields
    .map((entry) => {
      const field = typeof entry === "string" ? byKey.get(entry) : entry;
      if (!field)
        throw new Error(
          `Quick create "${config.title}" names "${String(entry)}", which the child form does not declare.`,
        );
      return field;
    })
    .filter((field) => field.key !== config.parentField)
    .map((field) => ({
      ...field,
      section: QUICK_CREATE_SECTION,
      tab: undefined,
      hidden: false,
      hideOnCreate: false,
      readOnly: false,
      columnSpan: 1 as const,
    }));
}

/** A one-section create form over the resolved fields, for `RuntimeForm`. */
export function quickCreateFormDefinition(
  fields: RuntimeFieldDefinition[],
): RuntimeFormDefinition {
  return {
    key: "create",
    sections: [{ key: QUICK_CREATE_SECTION, label: "", columns: 1 }],
    fields,
  };
}

/** Where the panel starts: fixed defaults, then values taken from the parent. */
export function quickCreateInitialValues(
  config: RuntimeQuickCreateDefinition,
  parent: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = { ...(config.defaults ?? {}) };
  for (const [childField, source] of Object.entries(
    config.defaultsFromParent ?? {},
  )) {
    const value = parent[source];
    if (value === null || value === undefined || value === "") continue;
    values[childField] = value;
  }
  return values;
}

/**
 * The request body. Only the panel's own fields are sent — never whatever else
 * the values object happens to hold — plus the parent id under `parentField`,
 * which overrides anything typed. Blank optional fields are omitted: `""` is
 * not "absent" to `@IsOptional()`, and would fail an `@IsUUID()` or
 * `@IsDateString()` and the whole create with it.
 */
export function buildQuickCreatePayload(
  config: RuntimeQuickCreateDefinition,
  fields: RuntimeFieldDefinition[],
  values: Record<string, unknown>,
  parentId: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    body[field.key] = typeof value === "string" ? value.trim() : value;
  }
  if (config.parentField) body[config.parentField] = parentId;
  return config.submit.envelope === "values" ? { values: body } : body;
}

export function resolveQuickCreatePath(
  config: RuntimeQuickCreateDefinition,
  parentId: string,
) {
  const path = config.submit.path.replaceAll(
    "{parentId}",
    encodeURIComponent(parentId),
  );
  return `/api${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Whether the Add button is offered for this parent, and if not, why — shown
 * on the disabled button, so it never reads as broken.
 */
export function quickCreateAvailability(
  config: RuntimeQuickCreateDefinition,
  parent: Record<string, unknown>,
): { available: true } | { available: false; reason: string } {
  const rule = config.availableWhen;
  if (!rule) return { available: true };
  return rule.in.includes(String(parent[rule.field] ?? ""))
    ? { available: true }
    : { available: false, reason: rule.reason };
}

/**
 * Splits an API failure between the fields it names and a panel-level
 * message. A field error for a field the panel does not show (the parent id,
 * say) cannot be put next to anything, so it joins the message instead of
 * vanishing.
 */
export function mapQuickCreateErrors(
  fields: RuntimeFieldDefinition[],
  message: string,
  fieldErrors: Array<{ field?: string; message: string }> = [],
): { fieldErrors: Record<string, string>; message: string | null } {
  const shown = new Set(fields.map((field) => field.key));
  const mapped: Record<string, string> = {};
  const unplaced: string[] = [];
  for (const item of fieldErrors) {
    if (item.field && shown.has(item.field) && !mapped[item.field])
      mapped[item.field] = item.message;
    else if (!item.field || !shown.has(item.field)) unplaced.push(item.message);
  }
  const placedSomething = Object.keys(mapped).length > 0;
  return {
    fieldErrors: mapped,
    message: unplaced.length
      ? unplaced.join(" ")
      : placedSomething
        ? null
        : message || "The record could not be created.",
  };
}

/**
 * One submission at a time. A second Save while the first request is in
 * flight is refused here rather than by a disabled button alone — a double
 * click lands both events before React re-renders the button disabled.
 */
export function createSubmitGuard() {
  let busy = false;
  return {
    tryAcquire() {
      if (busy) return false;
      busy = true;
      return true;
    },
    release() {
      busy = false;
    },
    get busy() {
      return busy;
    },
  };
}
