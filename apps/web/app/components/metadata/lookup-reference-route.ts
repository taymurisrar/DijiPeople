/*
 * ITEM-0163 / ITEM-0172 — replaces `LOOKUP_REFERENCE_ROUTES`, a flat,
 * exact-string, hand-maintained allowlist that silently produced no link at
 * all for anything it did not name.
 *
 * `apps/web` has no live entity -> route registry to delegate to instead:
 * `module-registry.ts` and its four siblings were removed as inert
 * scaffolding with zero callers (ADR-0007), and reviving one to answer this
 * question would contradict that decision. Admin's equivalent
 * (`resolveLookupRecordRoute`, `apps/admin/lib/runtime/lookup-record-href.ts`)
 * derives a route from the lookup's own API collection path instead of an
 * entity name, which sidesteps this problem entirely — but `FieldMetadata` in
 * `apps/web` never carries that path, only `lookupTargets[0].entityLogicalName`,
 * and every source of that name spells it differently: plural, lowercase,
 * hyphenated for a settings-runtime field
 * (`standard-module-runtime.ts#inferEntityLogicalNameFromLookupPath`);
 * singular, camelCase for the bespoke employee domain (`lookupEntity` in
 * `employee-metadata.adapter.ts`). The old map matched the raw string with no
 * normalization at all, so most of an Employee record's own lookups — Team,
 * Department, Designation, Location, Organization, Business Unit, Work
 * Schedule, Employee Level, Owner — silently never matched anything in it and
 * rendered no link, despite every one of those settings screens existing.
 *
 * `LOOKUP_REFERENCE_ALIASES` is what closes that gap: every spelling a real
 * call site is known to produce, mapped to the one canonical key that names
 * its destination in `LOOKUP_REFERENCE_DESTINATIONS`. A genuinely new
 * destination still needs one entry, exactly like admin's own table needs one
 * entry per module — the defect being fixed is silence on a spelling
 * mismatch, not the existence of a table.
 */
export function resolveLookupReferenceRoute(
  entityLogicalName: string,
): { readonly basePath: string; readonly moduleKey: string } | null {
  const normalized = entityLogicalName
    .replace(/^settings_/, "")
    .replaceAll("_", "-")
    .toLowerCase();
  const canonicalKey = LOOKUP_REFERENCE_ALIASES[normalized] ?? normalized;
  const basePath = LOOKUP_REFERENCE_DESTINATIONS[canonicalKey];

  return basePath
    ? {
        basePath,
        moduleKey: canonicalKey,
      }
    : null;
}

/**
 * A destination whose selected value is rendered as `?reference=<value>`
 * rather than `/<basePath>/<recordId>` — these settings screens navigate by
 * the value itself (an ISO code, an IANA name), not a database id.
 */
export function isReadOnlyLookupReferenceModule(moduleKey: string): boolean {
  return READ_ONLY_REFERENCE_MODULES.has(moduleKey);
}

const LOOKUP_REFERENCE_DESTINATIONS: Readonly<Record<string, string>> = {
  countries: "/settings/regional/geography/countries",
  "state-provinces": "/settings/regional/geography/states",
  cities: "/settings/regional/geography/cities",
  currencies: "/settings/regional/currency/currencies",
  timezones: "/settings/regional/localization/timezones",
  departments: "/settings/general-setup/organization/departments",
  designations: "/settings/people/workforce/designations",
  "employee-levels": "/settings/people/workforce/employee-levels",
  locations: "/settings/people/work-management/locations",
  "work-calendars": "/settings/people/work-management/work-calendars",
  "holiday-calendars": "/settings/people/work-management/holiday-calendars",
  shifts: "/settings/people/work-management/shifts",
  "work-schedules": "/settings/people/work-management/work-schedules",
  // ITEM-0107 — points at the canonical Users screen directly; the old path
  // still redirects here, but this map should not be a fifth place naming the
  // old one.
  users: "/settings/security-access/identities/users",
  /*
   * ITEM-0163 — this was `/settings/access/roles`, reachable only because
   * `next.config.ts` redirects it (verified: the redirect entry is still
   * there). Pointed at the canonical destination directly now — the same one
   * both that redirect and `settings-adapter-registry.ts`'s own `roles`
   * adapter (`routeBase`) name, skipping the extra hop.
   */
  roles: "/settings/security-access/authorization/roles",
  /*
   * ITEM-0163 named this a second legacy entry alongside `roles`. Verifying
   * it found otherwise: no `next.config.ts` redirect exists for
   * `/settings/access/teams`, and `settings-adapter-registry.ts`'s own
   * `teams` key (`mode: "specialized"`) declares this exact path as its live,
   * current destination — "Access Teams", the RBAC concept a Project or
   * approval-routing lookup means. That is a different entity from the
   * organizational "Team" an Employee record assigns
   * (`settings-adapter-registry.ts`'s `organization-teams` key,
   * `/settings/general-setup/organization/teams`), which the old map had no
   * entry for at all — added below as `team` (singular), the exact spelling
   * `employee-metadata.adapter.ts` uses for that field's `lookupEntity`. Left
   * unchanged after verifying it, not overlooked.
   */
  teams: "/settings/access/teams",
  team: "/settings/general-setup/organization/teams",
  organizations: "/settings/general-setup/organization/organizations",
  "business-units": "/settings/general-setup/organization/business-units",
  employees: "/employees",
};

/*
 * `normalized` spellings (already lowercase, hyphenated, `settings_`
 * stripped) that mean one of the destinations above but do not match its key
 * verbatim — see the block comment above `resolveLookupReferenceRoute`.
 */
const LOOKUP_REFERENCE_ALIASES: Readonly<Record<string, string>> = {
  country: "countries",
  currency: "currencies",
  timezone: "timezones",
  state: "state-provinces",
  states: "state-provinces",
  stateprovince: "state-provinces",
  stateprovinces: "state-provinces",
  city: "cities",
  department: "departments",
  designation: "designations",
  employeelevel: "employee-levels",
  location: "locations",
  workcalendar: "work-calendars",
  holidaycalendar: "holiday-calendars",
  shift: "shifts",
  workschedule: "work-schedules",
  user: "users",
  role: "roles",
  organization: "organizations",
  businessunit: "business-units",
  employee: "employees",
};

const READ_ONLY_REFERENCE_MODULES = new Set([
  "countries",
  "currencies",
  "timezones",
]);
