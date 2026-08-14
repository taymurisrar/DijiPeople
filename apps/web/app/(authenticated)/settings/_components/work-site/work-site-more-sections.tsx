"use client";

import Link from "next/link";
import type { FieldValueMap } from "@/app/components/metadata/runtime-metadata-form-renderer";
import { DateField } from "@/app/components/ui/form-control";
import {
  applyExpiryMode,
  resolveExpiryMode,
  validateWorkSiteDraft,
  type WorkSiteReadinessPayload,
} from "../../_lib/work-site-configuration";

type SectionContext = {
  readonly values: FieldValueMap;
  readonly mode: "detail" | "edit" | "new";
  readonly onValuesChange?: (values: FieldValueMap) => void;
};

/**
 * When this work site's configuration applies.
 *
 * "Never" is not a new flag: it persists as the existing nullable `validTo`,
 * which already carries exactly that meaning. Introducing a boolean beside it
 * would create two sources of truth for one question.
 */
export function WorkSiteEffectivePeriodSection({
  context,
}: {
  readonly context: SectionContext;
}) {
  const { values, mode, onValuesChange } = context;
  const readOnly = mode === "detail" || !onValuesChange;
  const validFrom = dateText(values.validFrom);
  const validTo = dateText(values.validTo);
  const expiryMode = resolveExpiryMode(values.validTo);
  const errors = validateWorkSiteDraft(values);

  if (readOnly) {
    return (
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-white px-3 py-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Valid from
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-foreground">
            {validFrom || "Not set"}
          </dd>
        </div>
        <div className="rounded-xl border border-border bg-white px-3 py-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Expires
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-foreground">
            {validTo || "Never"}
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="grid gap-4">
      <DateField
        className="max-w-xs"
        hint="Leave empty to apply immediately."
        label="Valid from"
        onChange={(next) => onValuesChange?.({ validFrom: next || null })}
        touched
        value={validFrom}
      />

      <fieldset className="grid gap-2 rounded-2xl border border-border bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">Expires</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={expiryMode === "NEVER"}
            name="work-site-expiry"
            onChange={() =>
              onValuesChange?.({ validTo: applyExpiryMode("NEVER", validTo) })
            }
            type="radio"
          />
          <span className="font-medium text-foreground">Never</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={expiryMode === "ON_DATE"}
            name="work-site-expiry"
            onChange={() =>
              onValuesChange?.({ validTo: applyExpiryMode("ON_DATE", validTo) })
            }
            type="radio"
          />
          <span className="font-medium text-foreground">On date</span>
        </label>
        {expiryMode === "ON_DATE" ? (
          <DateField
            className="max-w-xs"
            error={errors.validTo}
            label="Expiry date"
            min={validFrom || undefined}
            onChange={(next) => onValuesChange?.({ validTo: next || "" })}
            touched
            value={validTo}
          />
        ) : null}
      </fieldset>
    </div>
  );
}

const EMPLOYEE_ROUTE = "/employees";
const TEAMS_ROUTE = "/settings/general-setup/organization/teams";
const DEPARTMENTS_ROUTE = "/settings/general-setup/organization/departments";

/**
 * Technical detail and the legacy fields this page no longer governs.
 *
 * WHY THE LEGACY NOTICE IS HERE. `Location.defaultWorkScheduleId` and
 * `Location.holidayCalendarId` still hold whatever a tenant configured before
 * schedule resolution moved onto the organizational hierarchy. The data is
 * preserved deliberately, but nothing reads it — and a value that exists,
 * is invisible, and does nothing is exactly what makes an administrator
 * distrust the screen. So it is stated, once, where it will not be mistaken for
 * a live setting.
 */
export function WorkSiteAdvancedSection({
  context,
  readiness,
}: {
  readonly context: SectionContext;
  readonly readiness: WorkSiteReadinessPayload | null;
}) {
  const legacy = readiness?.legacyWorkPlanning ?? null;
  const hasLegacyValue = Boolean(
    legacy && (legacy.defaultWorkScheduleName || legacy.holidayCalendarName),
  );

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-border bg-white p-4">
        <p className="text-sm font-semibold text-foreground">
          Work schedules and calendars are not configured here
        </p>
        <p className="mt-1 text-sm text-muted">
          One work site holds teams and people who work different hours and
          follow different calendars, so the schedule and the calendar that apply
          to an employee are resolved from the organization: their own
          assignment first, then their team, then their department, then their
          business unit or organization, and finally the tenant default.
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link className="font-medium text-accent hover:underline" href={EMPLOYEE_ROUTE}>
            Employee assignments
          </Link>
          <Link className="font-medium text-accent hover:underline" href={TEAMS_ROUTE}>
            Teams
          </Link>
          <Link
            className="font-medium text-accent hover:underline"
            href={DEPARTMENTS_ROUTE}
          >
            Departments
          </Link>
        </div>
      </div>

      {hasLegacyValue ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Legacy work planning values
          </p>
          <p className="mt-1 text-sm text-amber-900">
            This work site still stores the schedule and calendar it was given
            before resolution moved to the organizational hierarchy. They are
            kept so nothing is lost, and they no longer affect attendance.
          </p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-amber-800">
                Stored work schedule
              </dt>
              <dd className="text-sm text-amber-900">
                {legacy?.defaultWorkScheduleName ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-amber-800">
                Stored work calendar
              </dt>
              <dd className="text-sm text-amber-900">
                {legacy?.holidayCalendarName ?? "Not set"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-white px-3 py-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Work site identifier
          </dt>
          <dd className="mt-0.5 break-all text-sm font-medium text-foreground">
            {readiness?.workSite.id ?? textValue(context.values.id) ?? "Not saved yet"}
          </dd>
        </div>
        <div className="rounded-xl border border-border bg-white px-3 py-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Coordinates
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-foreground">
            {coordinateSummary(context.values)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function coordinateSummary(values: FieldValueMap) {
  const latitude = values.latitude;
  const longitude = values.longitude;
  if (latitude === null || latitude === undefined || latitude === "") {
    return "Not configured";
  }
  if (longitude === null || longitude === undefined || longitude === "") {
    return "Not configured";
  }
  return `${String(latitude)}, ${String(longitude)}`;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function dateText(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  return value.slice(0, 10);
}
