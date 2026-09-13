/**
 * ITEM-0179 / ADR-0014 — an employee's authorised work sites as rows of the
 * standard related-records subgrid, on a Work Sites tab.
 *
 * The rows and the requests are shaped here, owned by the employee module,
 * so the shared subgrid never learns the attendance routes. Every write goes
 * to the existing transactional endpoints in
 * `services/api/src/modules/attendance-integrations/operations/attendance-operations.controller.ts`
 * (`attendanceDevices.read` / `attendanceDevices.manage`, tenant from the
 * session), never to a generic record update, because changing the primary
 * site has to move `EmployeeWorkSite` and `Employee.locationId` together.
 */

export const EMPLOYEE_WORK_SITES_RELATIONSHIP = "employee_work_sites";

export const EMPLOYEE_WORK_SITES_PATH =
  "/api/integrations/attendance/employees/{parentId}/work-sites";

export const EMPLOYEE_WORK_SITE_SET_PRIMARY_ACTION = "setPrimary";

export type EmployeeWorkSiteRow = {
  /* The location id: an employee has at most one active assignment per site. */
  readonly id: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly isPrimary: boolean;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  /*
   * True for the one row shown when the employee has no assignment rows and
   * is authorised for their Location only. It is the same fallback
   * `EmployeeWorkSiteResolver.resolveAuthorizedWorkSites` applies at check-in,
   * so the tab shows what attendance will actually enforce instead of an empty
   * list beside a record that has a Location.
   */
  readonly isDerived: boolean;
};

/** Maps `GET …/work-sites` (`listEmployeeWorkSites`) to subgrid rows. */
export function mapEmployeeWorkSiteRows(response: unknown): EmployeeWorkSiteRow[] {
  if (!isRecord(response)) return [];

  const assignments = Array.isArray(response.assignments)
    ? response.assignments.filter(isRecord)
    : [];
  const activeRows = assignments
    .filter((assignment) => assignment.status === "ACTIVE")
    .flatMap((assignment): EmployeeWorkSiteRow[] => {
      const locationId = stringValue(assignment.locationId);
      if (!locationId) return [];
      const location = isRecord(assignment.location) ? assignment.location : {};
      return [
        {
          id: locationId,
          locationId,
          locationName: stringValue(location.name),
          isPrimary: assignment.isPrimary === true,
          validFrom: dateOrNull(assignment.validFrom),
          validTo: dateOrNull(assignment.validTo),
          isDerived: false,
        },
      ];
    });

  if (activeRows.length > 0) {
    return [...activeRows].sort(
      (left, right) => Number(right.isPrimary) - Number(left.isPrimary),
    );
  }

  const authorized = Array.isArray(response.authorized)
    ? response.authorized.filter(isRecord)
    : [];
  return authorized
    .filter((site) => site.derivedFromPrimaryLocation === true)
    .flatMap((site): EmployeeWorkSiteRow[] => {
      const locationId = stringValue(site.locationId);
      if (!locationId) return [];
      return [
        {
          id: locationId,
          locationId,
          locationName: stringValue(site.name),
          isPrimary: true,
          validFrom: null,
          validTo: null,
          isDerived: true,
        },
      ];
    });
}

export type WorkSiteAssignPayload = {
  readonly locationId: string;
  readonly isPrimary?: true;
  readonly validFrom: string | null;
  readonly validTo: string | null;
};

/**
 * Body for `POST …/work-sites` (`AssignWorkSiteDto`).
 *
 * Empty dates are sent as `null`, never `""`: the DTO's `@IsOptional()` skips
 * `null` but not an empty string, which `@IsDateString()` rejects, and `null`
 * is also how a cleared date is written back as "no restriction".
 *
 * `isPrimary` is only ever sent as `true`, for a derived row being given dates
 * (which materialises it as the primary assignment it already is). A plain
 * assignment or a validity edit omits it, so the server leaves the primary
 * flag exactly as it was.
 */
export function buildWorkSiteAssignPayload(
  values: Readonly<Record<string, unknown>>,
  options: { readonly locationId?: string; readonly existing?: EmployeeWorkSiteRow } = {},
): WorkSiteAssignPayload {
  return {
    locationId: options.locationId ?? stringValue(values.locationId),
    ...(options.existing?.isDerived ? { isPrimary: true as const } : {}),
    validFrom: dateOnlyOrNull(values.validFrom),
    validTo: dateOnlyOrNull(values.validTo),
  };
}

/**
 * ADR-0014 — the employee update request never carries `locationId`: the
 * primary site changes only through Make primary. Location stays writable at
 * create, where `settings.requireWorkLocation` must still be satisfiable and
 * the resolver derives the authorised site from it.
 */
export function omitPrimaryLocationFromEmployeeUpdate<
  TPayload extends Record<string, unknown>,
>(payload: TPayload): Omit<TPayload, "locationId"> {
  const next = { ...payload };
  delete next.locationId;
  return next;
}

function dateOnlyOrNull(value: unknown) {
  const text = stringValue(value).trim();
  return text ? text.slice(0, 10) : null;
}

function dateOrNull(value: unknown) {
  const text = stringValue(value);
  return text || null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
