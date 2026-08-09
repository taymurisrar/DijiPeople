import { apiRequestJson } from "@/lib/server-api";
import type { AudienceOptions } from "@/app/components/runtime/visibility-rules-editor";

/*
 * Loads the dimensions a visibility rule can be written against.
 *
 * Shared by every designer that offers audience gating, so the sidebar and the
 * form designer always present the same choices. The master-data endpoints are
 * not uniform — some return a bare array, others wrap it in `items` — and a
 * caller may lack permission on one of them, so each source is normalized and
 * degrades to an empty picker rather than failing the page it is on.
 */

type UnknownRecord = Record<string, unknown>;

function rows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const items = (payload as UnknownRecord | null)?.items;
  return Array.isArray(items) ? items : [];
}

function toOptions(payload: unknown) {
  return rows(payload).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as UnknownRecord;
    const id = record.id ?? record.key;
    if (typeof id !== "string" || !id) return [];
    const label = record.name ?? record.label ?? record.title ?? id;
    return [{ id, label: typeof label === "string" ? label : id }];
  });
}

/* Roles are matched by key, not id, because that is what the engine reads. */
function toRoleOptions(payload: unknown) {
  return rows(payload).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as UnknownRecord;
    const key = record.key;
    if (typeof key !== "string" || !key) return [];
    const label = record.name;
    return [{ id: key, label: typeof label === "string" ? label : key }];
  });
}

async function load(path: string): Promise<unknown> {
  return apiRequestJson<unknown>(path).catch(() => []);
}

export async function getAudienceOptions(): Promise<AudienceOptions> {
  const [roles, teams, departments, businessUnits, organizations, designations] =
    await Promise.all([
      load("/roles"),
      load("/teams"),
      load("/departments"),
      load("/business-units"),
      load("/organizations"),
      load("/designations"),
    ]);

  return {
    roleKeys: toRoleOptions(roles),
    teamIds: toOptions(teams),
    departmentIds: toOptions(departments),
    businessUnitIds: toOptions(businessUnits),
    organizationIds: toOptions(organizations),
    designationIds: toOptions(designations),
  };
}
