/*
 * Options for lookups that name their target only by table key — BUG-3787,
 * TASK-0035.
 *
 * A custom lookup field (on a system module or a custom module) names its
 * target by customization table key. Nothing resolved that key to records, so
 * every such dropdown was empty: custom modules' adapters had no
 * getLookupOptions at all, and system modules only knew their own fields.
 *
 * Each source is an existing list endpoint that already enforces tenant and
 * permission for the target; this only reads it. A custom module is served by
 * the generic data API, a system table by its own route. A system target with
 * no entry here gets no options rather than a guessed endpoint.
 */
import type {
  FieldMetadata,
  LookupTargetMetadata,
} from "./metadata-runtime.types";

export type CustomLookupOption = {
  readonly id: string;
  readonly name: string;
};

/* System tables a lookup may target, by customization table key. */
const SYSTEM_LOOKUP_PATHS: Readonly<Record<string, string>> = {
  employees: "/api/employees?pageSize=100",
  departments: "/api/departments",
  designations: "/api/designations",
  locations: "/api/locations",
  businessUnits: "/api/business-units",
  organizations: "/api/organizations",
  teams: "/api/teams",
  employeeLevels: "/api/employee-levels",
  projects: "/api/projects?pageSize=100",
  jobOpenings: "/api/job-openings?pageSize=100",
  candidates: "/api/candidates?pageSize=100",
  leaveTypes: "/api/leave-types",
  holidayCalendars: "/api/holiday-calendars",
  payComponents: "/api/pay-components",
  policies: "/api/policies",
};

export function isSystemLookupTarget(tableKey: string) {
  return Object.prototype.hasOwnProperty.call(SYSTEM_LOOKUP_PATHS, tableKey);
}

/**
 * Where a target's records are listed. Table keys are unique per tenant across
 * system tables and custom modules, so a key the system map knows is a system
 * table; one the API flagged as system but the map lacks has no source here.
 */
export function lookupSourcePath(target: LookupTargetMetadata): string | null {
  const key = target.entityLogicalName;
  if (isSystemLookupTarget(key)) return SYSTEM_LOOKUP_PATHS[key];
  if (target.isSystemTable) return null;
  return `/api/data/${encodeURIComponent(key)}?pageSize=200`;
}

/**
 * The lookup target this module resolves for a field: always for a custom
 * field, and for any lookup when the page's own adapter has no resolver (a
 * custom module's fields). Other fields keep their module's behaviour.
 */
export function resolvableLookupTarget(
  field: FieldMetadata,
  adapterResolvesLookups: boolean,
): LookupTargetMetadata | null {
  if (field.dataType !== "lookup") return null;
  if (!field.isCustomField && adapterResolvesLookups) return null;
  const target = field.lookupTargets?.[0];
  return target && lookupSourcePath(target) ? target : null;
}

function rowsOf(data: unknown): Record<string, unknown>[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? ((data as Record<string, unknown>).items ??
        (data as Record<string, unknown>).data ??
        (data as Record<string, unknown>).records)
      : null;
  return Array.isArray(list)
    ? list.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
    : [];
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

const NOT_A_LABEL = new Set(["id", "createdAt", "updatedAt", "tenantId"]);

/** A row's label: the target's own name field first, then the common ones. */
export function lookupLabel(
  row: Readonly<Record<string, unknown>>,
  nameField?: string,
) {
  return (
    (nameField ? text(row[nameField]) : "") ||
    text(row.name) ||
    text(row.title) ||
    text(row.fullName) ||
    [text(row.firstName), text(row.lastName)].filter(Boolean).join(" ") ||
    /* A custom module's row is flat columns; its first text value names it. */
    Object.entries(row)
      .filter(([key]) => !NOT_A_LABEL.has(key))
      .map(([, value]) => text(value))
      .find(Boolean) ||
    text(row.id)
  );
}

export function toLookupOptions(
  data: unknown,
  options: { readonly nameField?: string; readonly search?: string } = {},
): CustomLookupOption[] {
  const search = options.search?.trim().toLowerCase();
  return rowsOf(data)
    .map((row) => ({
      id: text(row.id),
      name: lookupLabel(row, options.nameField),
    }))
    .filter((option) => option.id && option.name)
    .filter((option) => !search || option.name.toLowerCase().includes(search));
}

/** Loads a lookup's options from its target's list endpoint. */
export async function loadLookupOptions(
  target: LookupTargetMetadata,
  search?: string,
): Promise<CustomLookupOption[]> {
  const path = lookupSourcePath(target);
  if (!path) return [];
  const response = await fetch(path, {
    cache: "no-store",
    headers: { "x-dijipeople-error-handling": "inline" },
  });
  /* A target the user may not read is no options, not a broken form. */
  if (response.status === 403 || response.status === 404) return [];
  if (!response.ok) {
    throw new Error("Could not load the options for this field.");
  }
  return toLookupOptions(await response.json(), {
    nameField: target.primaryNameField,
    search,
  });
}
