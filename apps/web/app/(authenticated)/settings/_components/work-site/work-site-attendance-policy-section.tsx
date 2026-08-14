"use client";

import type { FieldValueMap } from "@/app/components/metadata/runtime-metadata-form-renderer";
import {
  InheritedOptionChoices,
  InheritedSettingControl,
} from "@/app/components/runtime/inherited-setting-control";
import {
  ATTENDANCE_METHOD_OPTIONS,
  DEVICE_POLICY_OPTIONS,
  WEB_ATTENDANCE_OPTIONS,
  WEB_FALLBACK_OPTIONS,
  attendanceEnabledLabel,
  attendanceMethodsLabel,
  devicePolicyLabel,
  isOverridden,
  webAttendanceLabel,
  webFallbackLabel,
  type AttendanceMethod,
  type WorkSiteDevicePolicy,
  type WorkSiteReadinessPayload,
  type WorkSiteWebAttendancePolicy,
} from "../../_lib/work-site-configuration";

type SectionContext = {
  readonly values: FieldValueMap;
  readonly mode: "detail" | "edit" | "new";
  readonly onValuesChange?: (values: FieldValueMap) => void;
};

/**
 * Attendance policy for one work site, as a sequence of business decisions.
 *
 * Each setting states its own inheritance explicitly: which mode is active, and
 * what the tenant currently resolves to if the override is cleared. The tenant
 * value comes from the API's resolver, so this page and the engine cannot
 * disagree about what "inherited" means.
 *
 * Persistence follows the existing backend semantics exactly — "Use tenant
 * setting" writes null, an override writes the explicit value — so no new
 * column, flag or endpoint is introduced.
 */
export function WorkSiteAttendancePolicySection({
  context,
  readiness,
  workSiteName,
}: {
  readonly context: SectionContext;
  readonly readiness: WorkSiteReadinessPayload | null;
  readonly workSiteName: string;
}) {
  const { values, mode, onValuesChange } = context;
  const readOnly = mode === "detail" || !onValuesChange;
  const tenant = readiness?.tenantDefaults;
  const overrideLabel = workSiteName
    ? `Override for ${workSiteName}`
    : "Override for this work site";

  const attendanceEnabled = booleanOrNull(values.attendanceEnabled);
  const devicePolicy = enumOrNull<WorkSiteDevicePolicy>(values.devicePolicy);
  const webAttendancePolicy = enumOrNull<WorkSiteWebAttendancePolicy>(
    values.webAttendancePolicy,
  );
  const webFallbackEnabled = booleanOrNull(values.webFallbackEnabled);
  const allowedMethods = methodList(values.allowedAttendanceMethods);

  return (
    <div className="grid gap-4">
      {!tenant ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The current tenant attendance settings could not be loaded, so the
          inherited values below are not shown. Overrides still save normally.
        </p>
      ) : null}

      <InheritedSettingControl
        description="Whether attendance may be recorded at this work site at all."
        inheritedValueLabel={
          tenant ? attendanceEnabledLabel(tenant.attendanceEnabled) : undefined
        }
        isOverridden={isOverridden(attendanceEnabled)}
        label="Attendance at this work site"
        onModeChange={(overridden) =>
          onValuesChange?.({
            attendanceEnabled: overridden ? (tenant?.attendanceEnabled ?? true) : null,
          })
        }
        overrideLabel={overrideLabel}
        readOnly={readOnly}
        readOnlyValueLabel={attendanceEnabledLabel(attendanceEnabled)}
      >
        <InheritedOptionChoices
          onChange={(next) =>
            onValuesChange?.({ attendanceEnabled: next === "true" })
          }
          options={[
            { value: "true", label: "Enabled" },
            { value: "false", label: "Disabled" },
          ]}
          value={attendanceEnabled ? "true" : "false"}
        />
      </InheritedSettingControl>

      <InheritedSettingControl
        description="What an employee standing inside this work site is expected to use."
        inheritedValueLabel={
          tenant ? devicePolicyLabel(tenant.devicePolicy) : undefined
        }
        inheritLabel="Use tenant policy"
        isOverridden={isOverridden(devicePolicy)}
        label="When an employee is inside this work site"
        onModeChange={(overridden) =>
          onValuesChange?.({
            devicePolicy: overridden
              ? (tenant?.devicePolicy ?? "DEVICE_PREFERRED")
              : null,
          })
        }
        overrideLabel={overrideLabel}
        readOnly={readOnly}
        readOnlyValueLabel={devicePolicyLabel(devicePolicy)}
      >
        <InheritedOptionChoices
          onChange={(next) => onValuesChange?.({ devicePolicy: next })}
          options={DEVICE_POLICY_OPTIONS}
          value={devicePolicy ?? ""}
        />
      </InheritedSettingControl>

      <InheritedSettingControl
        description="Whether a browser punch is accepted at this work site."
        inheritedValueLabel={
          tenant ? webAttendanceLabel(tenant.webAttendancePolicy) : undefined
        }
        isOverridden={isOverridden(webAttendancePolicy)}
        label="Web attendance"
        onModeChange={(overridden) =>
          onValuesChange?.({
            webAttendancePolicy: overridden
              ? (tenant?.webAttendancePolicy ?? "ALLOWED")
              : null,
          })
        }
        overrideLabel={overrideLabel}
        readOnly={readOnly}
        readOnlyValueLabel={webAttendanceLabel(webAttendancePolicy)}
      >
        <InheritedOptionChoices
          onChange={(next) => onValuesChange?.({ webAttendancePolicy: next })}
          options={WEB_ATTENDANCE_OPTIONS}
          value={webAttendancePolicy ?? ""}
        />
      </InheritedSettingControl>

      <InheritedSettingControl
        description="What happens when the attendance device at this work site is unavailable."
        inheritedValueLabel={
          tenant
            ? `${webFallbackLabel(tenant.webFallbackEnabled)} (tenant fallback policy: ${humanize(
                tenant.webFallbackPolicy,
              )})`
            : undefined
        }
        isOverridden={isOverridden(webFallbackEnabled)}
        label="If the attendance device is unavailable"
        onModeChange={(overridden) =>
          onValuesChange?.({
            webFallbackEnabled: overridden
              ? (tenant?.webFallbackEnabled ?? true)
              : null,
          })
        }
        overrideLabel={overrideLabel}
        readOnly={readOnly}
        readOnlyValueLabel={webFallbackLabel(webFallbackEnabled)}
      >
        <InheritedOptionChoices
          onChange={(next) =>
            onValuesChange?.({ webFallbackEnabled: next === "true" })
          }
          options={[...WEB_FALLBACK_OPTIONS]}
          value={webFallbackEnabled ? "true" : "false"}
        />
      </InheritedSettingControl>

      <fieldset className="grid gap-3 rounded-2xl border border-border bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">
          How can employees mark attendance here?
        </legend>
        <p className="text-sm text-muted">
          Selecting nothing means this work site adds no method restriction of its
          own, so the tenant attendance policy decides. This list is recorded
          against the work site; the attendance engine does not yet narrow methods
          by work site.
        </p>
        {readOnly ? (
          <p className="text-sm font-medium text-foreground">
            {attendanceMethodsLabel(allowedMethods)}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {ATTENDANCE_METHOD_OPTIONS.map((option) => {
              const checked = allowedMethods.includes(option.value);
              return (
                <label className="flex items-center gap-2 text-sm" key={option.value}>
                  <input
                    checked={checked}
                    onChange={() =>
                      onValuesChange?.({
                        allowedAttendanceMethods: checked
                          ? allowedMethods.filter((method) => method !== option.value)
                          : [...allowedMethods, option.value],
                      })
                    }
                    type="checkbox"
                  />
                  <span className="text-foreground">{option.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
    </div>
  );
}

function booleanOrNull(value: unknown) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function enumOrNull<T extends string>(value: unknown): T | null {
  return typeof value === "string" && value.trim() ? (value as T) : null;
}

function methodList(value: unknown): AttendanceMethod[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is AttendanceMethod =>
        typeof entry === "string" &&
        ATTENDANCE_METHOD_OPTIONS.some((option) => option.value === entry),
    );
  }
  if (typeof value === "string" && value.trim()) {
    return methodList(value.split(",").map((entry) => entry.trim()));
  }
  return [];
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
