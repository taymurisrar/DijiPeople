import type {
  ConnectionMode,
  IntegrationReadiness,
  IntegrationStatus,
} from "./types";

/**
 * Business-facing wording for the integration domain.
 *
 * Kept in one place so the list, the detail page and the wizard cannot describe
 * the same state differently. Everything here is deliberately non-technical:
 * COM, x86 and SDK internals belong in diagnostics, not in Settings.
 */

type Tone = "good" | "muted" | "neutral" | "danger" | "warning" | "info";

export const STATUS_LABELS: Record<IntegrationStatus, string> = {
  DRAFT: "Draft",
  UNVERIFIED: "Unverified",
  ACTIVE: "Active",
  DISABLED: "Disabled",
  ERROR: "Error",
};

export const STATUS_TONES: Record<IntegrationStatus, Tone> = {
  DRAFT: "muted",
  // Amber rather than red: unverified is an expected waypoint, not a fault.
  UNVERIFIED: "warning",
  ACTIVE: "good",
  DISABLED: "muted",
  ERROR: "danger",
};

export const STATUS_DESCRIPTIONS: Record<IntegrationStatus, string> = {
  DRAFT: "Configuration is still being filled in.",
  UNVERIFIED:
    "Configuration is valid. Waiting for a gateway to confirm it can reach the device.",
  ACTIVE: "Ready to synchronise attendance.",
  DISABLED: "Switched off. No attendance will be collected.",
  ERROR: "The last operation failed. Review the integration.",
};

export const CONNECTION_MODE_LABELS: Record<ConnectionMode, string> = {
  LOCAL_GATEWAY: "Local gateway",
  DEVICE_PUSH: "Device push",
  CLOUD_API: "Cloud API",
  VENDOR_SERVER: "Vendor server",
  DATABASE: "Database",
  FILE_IMPORT: "File import",
};

export function connectionModeLabel(mode: string): string {
  return CONNECTION_MODE_LABELS[mode as ConnectionMode] ?? mode;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as IntegrationStatus] ?? status;
}

export function statusTone(status: string): Tone {
  return STATUS_TONES[status as IntegrationStatus] ?? "neutral";
}

/** One readiness fact, rendered as its own row rather than folded into a status. */
export type ReadinessSignal = {
  key: string;
  label: string;
  value: string;
  tone: Tone;
  detail?: string;
};

/**
 * Turns the readiness response into display rows.
 *
 * Device verification reads "Awaiting gateway validation", never "Failed":
 * nothing has tried and failed, the capability simply does not exist yet. A red
 * cross here would send an administrator hunting for a problem that is not there.
 */
export function readinessSignals(
  readiness: IntegrationReadiness,
  connectionMode: string,
  status: string,
): ReadinessSignal[] {
  const requiresGateway = connectionMode === "LOCAL_GATEWAY";

  const signals: ReadinessSignal[] = [
    {
      key: "configuration",
      label: "Configuration",
      value: readiness.configurationValid ? "Valid" : "Incomplete",
      tone: readiness.configurationValid ? "good" : "warning",
      detail: readiness.configurationValid
        ? undefined
        : "Some required connection settings are missing or invalid.",
    },
  ];

  if (requiresGateway) {
    signals.push({
      key: "gateway",
      label: "Gateway",
      value: readiness.gatewayAvailable ? "Paired" : "Not available",
      tone: readiness.gatewayAvailable ? "good" : "warning",
      detail: readiness.gatewayAvailable
        ? undefined
        : "This connector reaches devices inside your network, so it needs a paired gateway.",
    });
  }

  signals.push({
    key: "device",
    label: "Enabled device",
    value:
      readiness.enabledDeviceCount > 0
        ? `${readiness.enabledDeviceCount} configured`
        : "None yet",
    tone: readiness.enabledDeviceCount > 0 ? "good" : "warning",
    detail:
      readiness.enabledDeviceCount > 0
        ? undefined
        : "Add at least one attendance device to this integration.",
  });

  signals.push({
    key: "deviceVerification",
    label: "Device verification",
    value: readiness.deviceVerified
      ? verifiedDeviceLabel(readiness)
      : "Not verified yet",
    tone: readiness.deviceVerified ? "good" : "warning",
    detail: readiness.deviceVerified
      ? undefined
      : "Install and pair a gateway, then use Verify device. Activation waits until a terminal has answered.",
  });

  signals.push({
    key: "status",
    label: "Integration",
    value: statusLabel(status),
    tone: statusTone(status),
    detail: STATUS_DESCRIPTIONS[status as IntegrationStatus],
  });

  return signals;
}

/** "Verified", or "2 of 3 verified" once more than one device is configured. */
function verifiedDeviceLabel(readiness: IntegrationReadiness): string {
  const verified = readiness.verifiedDeviceCount;
  if (verified === undefined || readiness.enabledDeviceCount <= 1) {
    return "Verified";
  }
  return `${verified} of ${readiness.enabledDeviceCount} verified`;
}

/** Whether the Activate action can do anything useful right now. */
export function canActivate(
  readiness: IntegrationReadiness,
  status: string,
): boolean {
  return readiness.blockers.length === 0 && status !== "ACTIVE";
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

/** "Every 30 minutes", or a plain dash when nothing is scheduled. */
export function describeSchedule(
  policy: { name: string } | null,
  intervalValue?: number | null,
  intervalUnit?: string | null,
): string {
  if (!policy) return "Not scheduled";
  if (!intervalValue) return policy.name;
  const unit = (intervalUnit ?? "MINUTES").toLowerCase();
  const singular = intervalValue === 1 ? unit.replace(/s$/, "") : unit;
  return `Every ${intervalValue} ${singular}`;
}

// --- Devices ---------------------------------------------------------------

/**
 * Device health.
 *
 * UNKNOWN is the honest state for every device today: nothing has contacted one,
 * because the gateway runtime that would do the contacting does not exist yet.
 * It reads as "Not checked yet", never as a fault.
 */
export function deviceHealthLabel(health: string): string {
  switch (health) {
    case "HEALTHY":
      return "Healthy";
    case "DEGRADED":
      return "Degraded";
    case "UNREACHABLE":
      return "Unreachable";
    default:
      return "Not checked yet";
  }
}

export function deviceHealthTone(health: string): Tone {
  switch (health) {
    case "HEALTHY":
      return "good";
    case "DEGRADED":
      return "warning";
    case "UNREACHABLE":
      return "danger";
    default:
      return "info";
  }
}

/**
 * Verification, in the operator's terms.
 *
 * A device whose terminal answered with the wrong serial gets its own message
 * rather than a generic failure: the fix is a configuration correction, not a
 * network investigation, and saying so saves a wasted call-out.
 */
export function deviceVerificationLabel(status: string | undefined): string {
  switch (status) {
    case "VERIFIED":
      return "Verified";
    case "SERIAL_MISMATCH":
      return "Wrong device answered";
    case "FAILED":
      return "Could not be reached";
    case "UNVERIFIED":
    default:
      return "Not verified yet";
  }
}

export function deviceVerificationTone(status: string | undefined): Tone {
  switch (status) {
    case "VERIFIED":
      return "good";
    case "SERIAL_MISMATCH":
    case "FAILED":
      return "danger";
    case "UNVERIFIED":
    default:
      return "warning";
  }
}

/**
 * Clock drift in words.
 *
 * DijiPeople reports drift and never corrects it — the terminal is the
 * customer's equipment and other software reads the same clock — so the phrasing
 * stays descriptive rather than offering to fix anything.
 */
export function describeClockDrift(seconds: number): string {
  const magnitude = Math.abs(seconds);

  if (magnitude < 30) return "clock in step";

  const direction = seconds > 0 ? "ahead of" : "behind";
  const amount =
    magnitude < 120
      ? `${magnitude} seconds`
      : magnitude < 7200
        ? `${Math.round(magnitude / 60)} minutes`
        : `${Math.round(magnitude / 3600)} hours`;

  return `${amount} ${direction} DijiPeople`;
}

export function deviceStatusLabel(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "DISABLED":
      return "Disabled";
    case "DECOMMISSIONED":
      return "Decommissioned";
    default:
      return "Pending";
  }
}

export function deviceStatusTone(status: string): Tone {
  switch (status) {
    case "ACTIVE":
      return "good";
    case "DISABLED":
    case "DECOMMISSIONED":
      return "muted";
    default:
      return "warning";
  }
}

export function directionModeLabel(mode: string): string {
  switch (mode) {
    case "ENTRY":
      return "Entry only";
    case "EXIT":
      return "Exit only";
    default:
      return "Entry and exit";
  }
}

export const SCOPE_TYPE_LABELS: Record<string, string> = {
  TENANT: "Whole organisation",
  ORGANIZATION: "Organization",
  BUSINESS_UNIT: "Business unit",
  DEPARTMENT: "Department",
  TEAM: "Team",
  EMPLOYEE: "Employee",
};

export function scopeTypeLabel(scopeType: string): string {
  return SCOPE_TYPE_LABELS[scopeType] ?? scopeType;
}

// --- Mapping ---------------------------------------------------------------

export function mappingStatusLabel(status: string): string {
  switch (status) {
    case "MATCHED":
      return "Mapped";
    case "IGNORED":
      return "Ignored";
    case "CONFLICT":
      return "Needs review";
    case "INACTIVE":
      return "Inactive";
    default:
      return "Unmapped";
  }
}

export function mappingStatusTone(status: string): Tone {
  switch (status) {
    case "MATCHED":
      return "good";
    case "IGNORED":
    case "INACTIVE":
      return "muted";
    case "CONFLICT":
      return "danger";
    default:
      return "warning";
  }
}

/**
 * How a suggested match is presented.
 *
 * A name-only match is never allowed to look automatic or certain: two people
 * can share a name, and attributing one person's attendance to the other is a
 * payroll error that is painful to unpick. It is labelled a possible match and
 * always needs explicit human confirmation.
 */
export function matchPresentation(candidate: {
  strategy: string;
  confidence: string;
}): { label: string; tone: Tone; requiresConfirmation: boolean } {
  if (candidate.strategy === "NAME_SUGGESTION") {
    return {
      label: "Possible match - name only, confirmation required",
      tone: "warning",
      requiresConfirmation: true,
    };
  }

  if (candidate.confidence === "CONFIRMED") {
    return {
      label: "Already mapped",
      tone: "good",
      requiresConfirmation: false,
    };
  }

  if (candidate.strategy === "EMPLOYEE_CODE") {
    return {
      label: "Employee number match",
      tone: "good",
      requiresConfirmation: true,
    };
  }

  if (candidate.strategy === "EXTERNAL_EMPLOYEE_CODE") {
    return {
      label: "Employee code match",
      tone: "good",
      requiresConfirmation: true,
    };
  }

  if (candidate.strategy === "EMAIL") {
    return {
      label: "Work email match",
      tone: "good",
      requiresConfirmation: true,
    };
  }

  return { label: "Suggested match", tone: "info", requiresConfirmation: true };
}

// --- Provisioning ----------------------------------------------------------

export function provisioningStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "Queued";
    case "PROCESSING":
      return "In progress";
    case "SUCCEEDED":
      return "Completed";
    case "FAILED":
      return "Failed";
    case "RETRYING":
      return "Retrying";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

export function provisioningStatusTone(status: string): Tone {
  switch (status) {
    case "SUCCEEDED":
      return "good";
    case "FAILED":
      return "danger";
    case "PROCESSING":
    case "RETRYING":
      return "info";
    case "CANCELLED":
      return "muted";
    default:
      return "warning";
  }
}

export function provisioningOperationLabel(operation: string): string {
  switch (operation) {
    case "CREATE_USER":
      return "Add employee to device";
    case "UPDATE_USER":
      return "Update employee on device";
    case "ENABLE_USER":
      return "Enable on device";
    case "DISABLE_USER":
      return "Disable on device";
    default:
      return operation;
  }
}

/** Retry is offered only for the state the API actually accepts. */
export function canRetryJob(status: string): boolean {
  return status === "FAILED";
}

/** PROCESSING is excluded: a gateway may already be mid-write. */
export function canCancelJob(status: string): boolean {
  return status === "PENDING" || status === "RETRYING";
}

// --- Gateways --------------------------------------------------------------

export function gatewayStatusLabel(status: string): string {
  switch (status) {
    case "ONLINE":
      return "Online";
    case "OFFLINE":
      return "Offline";
    case "DEGRADED":
      return "Degraded";
    case "REVOKED":
      return "Revoked";
    default:
      return "Awaiting pairing";
  }
}

export function gatewayStatusTone(status: string): Tone {
  switch (status) {
    case "ONLINE":
      return "good";
    case "DEGRADED":
      return "warning";
    case "REVOKED":
      return "danger";
    case "OFFLINE":
      return "muted";
    default:
      return "info";
  }
}

// --- Runs ------------------------------------------------------------------

export function runTypeLabel(runType: string): string {
  switch (runType) {
    case "ATTENDANCE_PULL":
      return "Attendance sync";
    case "USER_DISCOVERY":
      return "Device user discovery";
    case "USER_PROVISION":
      return "Employee provisioning";
    case "HEALTH_CHECK":
      return "Health check";
    case "MANUAL_SYNC":
      return "Manual sync";
    default:
      return runType;
  }
}

export function runStatusLabel(status: string): string {
  switch (status) {
    case "SUCCEEDED":
      return "Succeeded";
    case "PARTIAL":
      return "Partial";
    case "FAILED":
      return "Failed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Running";
  }
}

export function runStatusTone(status: string): Tone {
  switch (status) {
    case "SUCCEEDED":
      return "good";
    case "PARTIAL":
      return "warning";
    case "FAILED":
      return "danger";
    case "CANCELLED":
      return "muted";
    default:
      return "info";
  }
}

export function formatDuration(ms: number | null): string {
  if (ms === null || Number.isNaN(ms)) return "-";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

// --- Downloads -------------------------------------------------------------

export function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function platformLabel(platform: string, architecture: string): string {
  const platformName =
    platform === "WINDOWS"
      ? "Windows"
      : platform === "MACOS"
        ? "macOS"
        : platform === "LINUX"
          ? "Linux"
          : platform;
  const archName =
    architecture === "X64"
      ? "64-bit"
      : architecture === "X86"
        ? "32-bit"
        : architecture === "ARM64"
          ? "ARM64"
          : architecture;
  return `${platformName} ${archName}`;
}

/**
 * Customer-facing descriptions for downloadable apps.
 *
 * Deliberately free of implementation language: an administrator choosing a
 * download does not need to hear about COM, zkemkeeper or 32-bit workers. Those
 * belong in technical documentation, not on the card.
 */
export const APP_DESCRIPTIONS: Record<string, string> = {
  INTEGRATION_GATEWAY:
    "Connects attendance devices and on-premise systems that are only reachable inside your own network.",
  AGENT_DESKTOP:
    "Workstation app for activity sessions, presence and desktop attendance.",
  ZKTECO_DIAGNOSTIC:
    "Support utility for checking connectivity and configuration on compatible legacy ZKTeco terminals.",
};

export function appDescription(
  appKey: string,
  fallback: string | null,
): string {
  return APP_DESCRIPTIONS[appKey] ?? fallback ?? "";
}

/**
 * Customer-facing product names.
 *
 * These override whatever name a release row happens to carry. Internal build
 * names ("POC worker", "COM worker", "zkemkeeper tool") are how the team talks
 * about these binaries, and one of them reaching a customer download page would
 * be both confusing and unprofessional. Naming is decided here, not by whoever
 * published the release.
 */
export const APP_NAMES: Record<string, string> = {
  INTEGRATION_GATEWAY: "DijiPeople Integration Gateway",
  AGENT_DESKTOP: "DijiPeople Agent Desktop",
  ZKTECO_DIAGNOSTIC: "ZKTeco Diagnostic Utility",
};

export function appName(appKey: string, fallback: string | null): string {
  return APP_NAMES[appKey] ?? fallback ?? appKey;
}

/** Recommends the build most administrators should take. */
export function isRecommendedBuild(
  release: { platform: string; architecture: string },
  siblings: Array<{ platform: string; architecture: string }>,
): boolean {
  if (release.platform !== "WINDOWS") return false;
  if (release.architecture !== "X64") return false;
  return siblings.some(
    (sibling) =>
      sibling.platform === "WINDOWS" && sibling.architecture !== "X64",
  );
}

// --- Connector capabilities ------------------------------------------------

export const CAPABILITY_LABELS: Record<string, string> = {
  READ_DEVICE_INFO: "Read device information",
  READ_USERS: "Read device user directory",
  READ_ATTENDANCE: "Collect attendance records",
  POLL_EVENTS: "Scheduled collection",
  DEVICE_TIME: "Read device clock",
  PUNCH_STATE: "Entry and exit state",
  WORK_CODE: "Work codes",
  WRITE_USERS: "Send employees to the device",
  DISABLE_USERS: "Disable employees on the device",
  LOCAL_GATEWAY_REQUIRED: "Requires a local gateway",
  PUSH_EVENTS: "Device-initiated push",
};

export function capabilityLabel(capability: string): string {
  return CAPABILITY_LABELS[capability] ?? capability;
}

export type CapabilityPresentation = {
  capability: string;
  label: string;
  /** Business-readable state. Never the bare word "Supported". */
  state: string;
  tone: Tone;
  detail: string | null;
};

/**
 * How a connector capability is described.
 *
 * The distinction that matters is between a capability the connector code
 * exposes and one that has been proven against real hardware. Calling an
 * unproven write path "Supported" would invite an administrator to enable
 * automatic provisioning that cannot yet be trusted to run unattended, so
 * declared-but-unvalidated capabilities say exactly that.
 */
export function capabilityPresentation(
  capability: string,
  connector: {
    capabilities: string[];
    experimentalCapabilities: Array<{ capability: string; reason: string }>;
    automaticallySupportedCapabilities: string[];
  },
): CapabilityPresentation {
  const experimental = connector.experimentalCapabilities.find(
    (note) => note.capability === capability,
  );

  if (experimental) {
    return {
      capability,
      label: capabilityLabel(capability),
      state: "Available in connector · awaiting production certification",
      tone: "warning",
      detail: experimental.reason,
    };
  }

  if (connector.automaticallySupportedCapabilities.includes(capability)) {
    return {
      capability,
      label: capabilityLabel(capability),
      state: "Certified for automatic use",
      tone: "good",
      detail: null,
    };
  }

  return {
    capability,
    label: capabilityLabel(capability),
    state: "Available in connector",
    tone: "info",
    detail: null,
  };
}

/** True when the connector can write users but is not certified to do so. */
export function hasUncertifiedProvisioning(connector: {
  capabilities: string[];
  automaticallySupportedCapabilities: string[];
}): boolean {
  return (
    connector.capabilities.includes("WRITE_USERS") &&
    !connector.automaticallySupportedCapabilities.includes("WRITE_USERS")
  );
}
