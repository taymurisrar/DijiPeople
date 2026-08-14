/**
 * Work Site configuration logic, kept free of React.
 *
 * Everything the Work Site page decides — what a policy is called, whether a
 * value is an override or an inherited default, whether a readiness check has
 * actually been satisfied — lives here so the Node test runner in this app can
 * exercise it without a DOM. The components below it only render.
 *
 * The rules mirror the API's AttendancePolicyResolverService rather than
 * restating them: null means inherit, and inheritance is a decision the backend
 * makes. Nothing here computes an effective policy of its own; it labels the one
 * the API returned.
 */

// --- payload shapes ---------------------------------------------------------

export type WorkSiteDevicePolicy =
  | "DEVICE_REQUIRED"
  | "DEVICE_PREFERRED"
  | "DEVICE_OPTIONAL";

export type WorkSiteWebAttendancePolicy = "ALLOWED" | "DISALLOWED" | "FALLBACK_ONLY";

export type AttendanceMethod = "DEVICE" | "WEB" | "MOBILE" | "MANUAL";

export type WorkSiteReadinessPayload = {
  readonly workSite: {
    readonly id: string;
    readonly name: string;
    readonly code: string | null;
    readonly city: string | null;
    readonly state: string | null;
    readonly country: string | null;
    readonly timezone: string | null;
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly isActive: boolean;
    readonly allowedRadiusMeters: number | null;
    readonly maximumAccuracyMeters: number | null;
    readonly attendanceEnabled: boolean | null;
    readonly allowedAttendanceMethods: readonly AttendanceMethod[];
    readonly webAttendancePolicy: WorkSiteWebAttendancePolicy | null;
    readonly devicePolicy: WorkSiteDevicePolicy | null;
    readonly webFallbackEnabled: boolean | null;
    readonly defaultWorkScheduleId: string | null;
    readonly holidayCalendarId: string | null;
  };
  readonly effective: {
    readonly attendanceEnabled: boolean;
    readonly devicePolicy: WorkSiteDevicePolicy;
    readonly webAttendancePolicy: WorkSiteWebAttendancePolicy;
    readonly webFallbackEnabled: boolean;
    readonly radiusMeters: number;
    readonly maximumAccuracyMeters: number | null;
    /*
     * The capture methods the engine will accept here, after the work site's
     * own restriction has been layered over the tenant default. Reported from
     * the API's resolver rather than recomputed, so the screen cannot claim a
     * method the engine would refuse.
     */
    readonly allowedMethods: readonly AttendanceMethod[];
    readonly sources: Readonly<Record<string, "WORK_SITE" | "TENANT">>;
  };
  readonly tenantDefaults: {
    readonly attendanceEnabled: boolean;
    readonly devicePolicy: WorkSiteDevicePolicy;
    readonly webAttendancePolicy: WorkSiteWebAttendancePolicy;
    readonly webFallbackEnabled: boolean;
    readonly webFallbackPolicy: string;
    readonly radiusMeters: number;
    readonly maximumAccuracyMeters: number | null;
    readonly allowedMethods: readonly AttendanceMethod[];
  };
  readonly counts: {
    readonly authorizedEmployees: number;
    readonly assignedEmployees: number;
    readonly primaryOnlyEmployees: number;
    readonly attendanceDevices: number;
    readonly enabledAttendanceDevices: number;
    readonly recentAttendanceSessions: number;
  };
  readonly devices: readonly {
    readonly id: string;
    readonly name: string;
    readonly code: string | null;
    readonly model: string | null;
    readonly provider: string;
    readonly status: string;
    readonly isEnabled: boolean;
    readonly healthStatus: string;
    readonly lastSeenAt: string | null;
    readonly lastSuccessfulSyncAt: string | null;
    readonly gateway: {
      readonly id: string;
      readonly name: string;
      readonly status: string;
      readonly lastHeartbeatAt: string | null;
    } | null;
  }[];
  readonly gateways: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly lastHeartbeatAt: string | null;
    readonly lastSuccessfulUploadAt: string | null;
  }[];
  /*
   * The schedule and calendar this work site still stores, reported ONLY so the
   * Advanced tab can say the values exist and are no longer used. Nothing on
   * this page treats them as configuration: an employee's schedule and calendar
   * resolve down the organizational hierarchy, never from the place they stand.
   */
  readonly legacyWorkPlanning: {
    readonly defaultWorkScheduleName: string | null;
    readonly holidayCalendarName: string | null;
  } | null;
};

// --- option catalogs --------------------------------------------------------

export const ATTENDANCE_ENABLED_OPTIONS = [
  { value: "true", label: "Enabled" },
  { value: "false", label: "Disabled" },
] as const;

export const DEVICE_POLICY_OPTIONS: readonly {
  value: WorkSiteDevicePolicy;
  label: string;
  description: string;
}[] = [
  {
    value: "DEVICE_REQUIRED",
    label: "Require attendance device",
    description:
      "People inside this work site must use a terminal. Web and mobile punches from inside the site are refused.",
  },
  {
    value: "DEVICE_PREFERRED",
    label: "Prefer the device, allow web/mobile",
    description:
      "A terminal is expected, but a web or mobile punch from inside the site is still accepted.",
  },
  {
    value: "DEVICE_OPTIONAL",
    label: "Allow web/mobile attendance",
    description: "Any allowed method may be used inside this work site.",
  },
];

export const WEB_ATTENDANCE_OPTIONS: readonly {
  value: WorkSiteWebAttendancePolicy;
  label: string;
  description: string;
}[] = [
  {
    value: "ALLOWED",
    label: "Allowed",
    description: "People may record attendance from a browser at this work site.",
  },
  {
    value: "FALLBACK_ONLY",
    label: "Allowed only as a fallback",
    description: "Web attendance is accepted only when the device route is unavailable.",
  },
  {
    value: "DISALLOWED",
    label: "Not allowed",
    description: "Web attendance is refused at this work site.",
  },
];

export const WEB_FALLBACK_OPTIONS = [
  {
    value: "true",
    label: "Allow web attendance as a fallback",
    description:
      "If the terminal is unavailable, people may record attendance from a browser.",
  },
  {
    value: "false",
    label: "Do not allow a fallback",
    description: "Attendance waits for the terminal; no browser fallback is offered.",
  },
] as const;

export const ATTENDANCE_METHOD_OPTIONS: readonly {
  value: AttendanceMethod;
  label: string;
}[] = [
  { value: "DEVICE", label: "Attendance device" },
  { value: "WEB", label: "Web" },
  { value: "MOBILE", label: "Mobile" },
  { value: "MANUAL", label: "Manual entry" },
];

// --- labels -----------------------------------------------------------------

export function devicePolicyLabel(value: WorkSiteDevicePolicy | null | undefined) {
  return (
    DEVICE_POLICY_OPTIONS.find((option) => option.value === value)?.label ??
    "Not configured"
  );
}

export function webAttendanceLabel(
  value: WorkSiteWebAttendancePolicy | null | undefined,
) {
  return (
    WEB_ATTENDANCE_OPTIONS.find((option) => option.value === value)?.label ??
    "Not configured"
  );
}

export function webFallbackLabel(value: boolean | null | undefined) {
  if (value === null || value === undefined) return "Not configured";
  return value ? "Allowed as a fallback" : "Not allowed";
}

export function attendanceEnabledLabel(value: boolean | null | undefined) {
  if (value === null || value === undefined) return "Not configured";
  return value ? "Enabled" : "Disabled";
}

export function attendanceMethodsLabel(
  methods: readonly AttendanceMethod[] | null | undefined,
) {
  if (!methods?.length) return "No restriction at this work site";
  return methods
    .map(
      (method) =>
        ATTENDANCE_METHOD_OPTIONS.find((option) => option.value === method)?.label ??
        method,
    )
    .join(", ");
}

export function metersLabel(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "Not configured"
    : `${Math.round(value)} m`;
}

// --- inheritance ------------------------------------------------------------

/**
 * A stored override is anything that is not null/undefined.
 *
 * An empty string counts as cleared: that is what a text control sends when its
 * value is removed, and the API's DTOs translate it to null for exactly this
 * reason.
 */
export function isOverridden(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

/** What "Use tenant setting" persists. */
export const INHERITED_VALUE = null;

/**
 * Describes an inheritable setting for the override control.
 *
 * `source` comes from the API's own resolver, so the badge never disagrees with
 * the engine about which layer decided the value.
 */
export function describeInheritance<T>(input: {
  readonly override: T | null | undefined;
  readonly effective: T;
  readonly tenantValue: T;
  readonly format: (value: T | null | undefined) => string;
}) {
  const overridden = isOverridden(input.override);
  return {
    isOverridden: overridden,
    effectiveLabel: input.format(input.effective),
    tenantLabel: input.format(input.tenantValue),
    overrideLabel: overridden ? input.format(input.override as T) : "",
  };
}

// --- effective period -------------------------------------------------------

export type ExpiryMode = "NEVER" | "ON_DATE";

export function resolveExpiryMode(validTo: unknown): ExpiryMode {
  return isOverridden(validTo) ? "ON_DATE" : "NEVER";
}

/**
 * What switching the expiry radio should write.
 *
 * "Never" persists as null on the existing nullable column — no extra boolean is
 * introduced, because the column already says everything the UI needs.
 */
export function applyExpiryMode(
  mode: ExpiryMode,
  currentValidTo: string | null,
): string | null {
  return mode === "NEVER" ? null : (currentValidTo ?? "");
}

// --- validation -------------------------------------------------------------

export type WorkSiteDraft = {
  readonly latitude?: unknown;
  readonly longitude?: unknown;
  readonly allowedRadiusMeters?: unknown;
  readonly maximumAccuracyMeters?: unknown;
  readonly validFrom?: unknown;
  readonly validTo?: unknown;
};

/**
 * Front-of-house validation only.
 *
 * The API remains the authority — these checks exist so an administrator is told
 * about an obviously broken combination before a round trip, not so the backend
 * can be trusted less.
 */
export function validateWorkSiteDraft(draft: WorkSiteDraft) {
  const errors: Record<string, string> = {};
  const latitude = numberOrNull(draft.latitude);
  const longitude = numberOrNull(draft.longitude);
  const radius = numberOrNull(draft.allowedRadiusMeters);
  const accuracy = numberOrNull(draft.maximumAccuracyMeters);

  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    errors.latitude = "Latitude must be between -90 and 90.";
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    errors.longitude = "Longitude must be between -180 and 180.";
  }
  if (draft.latitude !== undefined && isBlank(draft.latitude) && longitude !== null) {
    errors.latitude = "Latitude is required when longitude is set.";
  }
  if (draft.longitude !== undefined && isBlank(draft.longitude) && latitude !== null) {
    errors.longitude = "Longitude is required when latitude is set.";
  }
  if (radius !== null && radius <= 0) {
    errors.allowedRadiusMeters = "Geofence radius must be greater than 0 metres.";
  }
  if (accuracy !== null && accuracy <= 0) {
    errors.maximumAccuracyMeters =
      "Location accuracy requirement must be greater than 0 metres.";
  }

  const validFrom = dateOrNull(draft.validFrom);
  const validTo = dateOrNull(draft.validTo);
  if (validFrom && validTo && validTo < validFrom) {
    errors.validTo = "Expiry date cannot be earlier than the valid-from date.";
  }

  return errors;
}

// --- readiness --------------------------------------------------------------

export type ReadinessStatus =
  | "ready"
  | "needs-configuration"
  | "pending"
  | "not-applicable"
  | "not-reported";

export type ReadinessCheck = {
  readonly key: string;
  readonly label: string;
  readonly status: ReadinessStatus;
  readonly detail: string;
};

export const READINESS_STATUS_LABELS: Readonly<Record<ReadinessStatus, string>> = {
  ready: "Ready",
  "needs-configuration": "Needs configuration",
  pending: "Pending",
  "not-applicable": "Not applicable",
  "not-reported": "Not yet reported",
};

/**
 * Independent checks, never collapsed into one badge.
 *
 * A single green "Active" hides which of six different things is actually
 * missing, and the gateway line in particular must never claim connectivity the
 * platform has not observed: a gateway with no heartbeat is "Not yet reported",
 * not "Pending connection to a device that works".
 */
export function buildWorkSiteReadinessChecks(
  payload: WorkSiteReadinessPayload,
): readonly ReadinessCheck[] {
  const { workSite, effective, devices, gateways } = payload;
  const hasCoordinates =
    typeof workSite.latitude === "number" && typeof workSite.longitude === "number";
  const enabledDevices = devices.filter((device) => device.isEnabled);
  const gatewayDevices = enabledDevices.filter((device) => device.gateway);

  return [
    {
      key: "location",
      label: "Coordinates configured",
      status: hasCoordinates ? "ready" : "needs-configuration",
      detail: hasCoordinates
        ? `${workSite.latitude}, ${workSite.longitude}`
        : "Place the pin on the map or enter latitude and longitude.",
    },
    {
      key: "geofence",
      label: "Geofence radius configured",
      status:
        effective.radiusMeters > 0
          ? workSite.allowedRadiusMeters
            ? "ready"
            : "pending"
          : "needs-configuration",
      detail: workSite.allowedRadiusMeters
        ? `${workSite.allowedRadiusMeters} m set on this work site.`
        : `Using the tenant default of ${effective.radiusMeters} m.`,
    },
    {
      key: "timezone",
      label: "Timezone configured",
      status: workSite.timezone ? "ready" : "needs-configuration",
      detail: workSite.timezone ?? "No timezone is set for this work site.",
    },
    {
      key: "attendance",
      label: "Attendance enabled",
      status: effective.attendanceEnabled ? "ready" : "needs-configuration",
      detail: `${
        effective.attendanceEnabled ? "Enabled" : "Disabled"
      } (${effective.sources.attendanceEnabled === "WORK_SITE" ? "work site override" : "tenant setting"}).`,
    },
    {
      /*
       * Whether the layered policy actually produced an answer for this site.
       * Separate from "attendance enabled": a site can be enabled and still be
       * unusable because no capture method survives the method restriction.
       */
      key: "policy",
      label: "Attendance policy resolved",
      status: effective.allowedMethods.length ? "ready" : "needs-configuration",
      detail: effective.allowedMethods.length
        ? `${attendanceMethodsLabel(effective.allowedMethods)} permitted (${
            effective.sources.allowedAttendanceMethods === "WORK_SITE"
              ? "work site override"
              : "tenant setting"
          }).`
        : "No attendance method is permitted at this work site, so nothing can be recorded here.",
    },
    {
      key: "devices",
      label: "Attendance device assigned",
      status: enabledDevices.length ? "ready" : "needs-configuration",
      detail: enabledDevices.length
        ? `${enabledDevices.length} enabled device${enabledDevices.length === 1 ? "" : "s"} at this work site.`
        : "No devices assigned",
    },
    gatewayCheck(gatewayDevices.length, gateways),
  ];
}

function gatewayCheck(
  gatewayDeviceCount: number,
  gateways: WorkSiteReadinessPayload["gateways"],
): ReadinessCheck {
  if (!gateways.length) {
    return {
      key: "gateway",
      label: "Gateway connected",
      status: "not-applicable",
      detail: gatewayDeviceCount
        ? "Assigned devices are not routed through a local gateway."
        : "No device at this work site uses a local gateway.",
    };
  }

  const reported = gateways.filter((gateway) => gateway.lastHeartbeatAt);
  if (!reported.length) {
    return {
      key: "gateway",
      label: "Gateway connected",
      status: "not-reported",
      detail: `${gateways.map((gateway) => gateway.name).join(", ")} has not reported a heartbeat yet.`,
    };
  }

  const online = reported.filter((gateway) => gateway.status === "ONLINE");
  if (online.length === reported.length) {
    return {
      key: "gateway",
      label: "Gateway connected",
      status: "ready",
      detail: `${online.map((gateway) => gateway.name).join(", ")} reported online.`,
    };
  }

  return {
    key: "gateway",
    label: "Gateway connected",
    status: "pending",
    detail: reported
      .map((gateway) => `${gateway.name}: ${gatewayStatusLabel(gateway.status)}`)
      .join(", "),
  };
}

export function gatewayStatusLabel(status: string) {
  switch (status) {
    case "ONLINE":
      return "Online";
    case "OFFLINE":
      return "Offline";
    case "DEGRADED":
      return "Degraded";
    case "REVOKED":
      return "Revoked";
    case "PENDING":
    default:
      return "Awaiting connection";
  }
}

// --- summary ----------------------------------------------------------------

export type SummaryRow = {
  readonly label: string;
  readonly value: string;
  readonly source?: "Work site" | "Tenant setting";
};

/** The operational one-glance view. Never invents a value it does not have. */
export function buildWorkSiteSummaryRows(
  payload: WorkSiteReadinessPayload,
): readonly SummaryRow[] {
  const { workSite, effective, counts, gateways } = payload;

  return [
    {
      label: "Status",
      value: workSite.isActive ? "Active" : "Inactive",
    },
    {
      label: "Timezone",
      value: workSite.timezone ?? "Not configured",
    },
    {
      label: "Geofence",
      value: metersLabel(effective.radiusMeters),
      source: sourceLabel(effective.sources.radiusMeters),
    },
    {
      label: "Attendance",
      value: attendanceEnabledLabel(effective.attendanceEnabled),
      source: sourceLabel(effective.sources.attendanceEnabled),
    },
    {
      label: "Office policy",
      value: devicePolicyLabel(effective.devicePolicy),
      source: sourceLabel(effective.sources.devicePolicy),
    },
    {
      label: "Web attendance",
      value: webAttendanceLabel(effective.webAttendancePolicy),
      source: sourceLabel(effective.sources.webAttendancePolicy),
    },
    {
      label: "Web fallback",
      value: webFallbackLabel(effective.webFallbackEnabled),
      source: sourceLabel(effective.sources.webFallbackEnabled),
    },
    {
      label: "Allowed methods",
      value: effective.allowedMethods.length
        ? attendanceMethodsLabel(effective.allowedMethods)
        : "None permitted",
      source: sourceLabel(effective.sources.allowedAttendanceMethods),
    },
    {
      label: "Devices",
      value: counts.attendanceDevices
        ? `${counts.attendanceDevices} (${counts.enabledAttendanceDevices} enabled)`
        : "No devices assigned",
    },
    {
      label: "Authorized employees",
      value: String(counts.authorizedEmployees),
    },
    {
      label: "Gateway",
      value: gatewaySummaryValue(gateways),
    },
  ];
}

/**
 * The gateway line, stated only as strongly as the evidence allows.
 *
 * A gateway that has never sent a heartbeat is "Not yet reported", never
 * "Offline" and never "Online": the platform has observed nothing, and guessing
 * either way would be a claim about a customer's network that nobody checked.
 */
function gatewaySummaryValue(gateways: WorkSiteReadinessPayload["gateways"]) {
  if (!gateways.length) return "Not applicable";
  const reported = gateways.filter((gateway) => gateway.lastHeartbeatAt);
  if (!reported.length) return "Not yet reported";
  const online = reported.filter((gateway) => gateway.status === "ONLINE");
  if (online.length === reported.length) {
    return reported.length === 1 ? "Online" : `${online.length} online`;
  }
  return reported
    .map((gateway) => `${gateway.name}: ${gatewayStatusLabel(gateway.status)}`)
    .join(", ");
}

function sourceLabel(source: "WORK_SITE" | "TENANT" | undefined) {
  if (source === "WORK_SITE") return "Work site" as const;
  if (source === "TENANT") return "Tenant setting" as const;
  return undefined;
}

// --- shared coercion --------------------------------------------------------

function isBlank(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

function numberOrNull(value: unknown) {
  if (isBlank(value)) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrNull(value: unknown) {
  if (isBlank(value)) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
