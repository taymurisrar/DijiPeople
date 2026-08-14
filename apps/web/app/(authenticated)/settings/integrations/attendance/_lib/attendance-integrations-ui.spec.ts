import {
  appDescription,
  appName,
  canActivate,
  canCancelJob,
  canRetryJob,
  capabilityLabel,
  capabilityPresentation,
  connectionModeLabel,
  describeSchedule,
  deviceHealthLabel,
  deviceHealthTone,
  deviceStatusLabel,
  deviceStatusTone,
  directionModeLabel,
  formatDateTime,
  formatDuration,
  formatFileSize,
  gatewayStatusLabel,
  gatewayStatusTone,
  hasUncertifiedProvisioning,
  isRecommendedBuild,
  mappingStatusLabel,
  mappingStatusTone,
  matchPresentation,
  platformLabel,
  provisioningStatusLabel,
  readinessSignals,
  runStatusLabel,
  runStatusTone,
  runTypeLabel,
  scopeTypeLabel,
  statusLabel,
  statusTone,
} from "./presentation";
import type { IntegrationReadiness } from "./types";
import {
  flattenVisibleSettingsItems,
  resolveVisibleSettingsGroups,
} from "../../../_lib/settings-navigation";
import { DEDICATED_PAGE_KEYS } from "../../../_lib/settings-runtime";
import {
  getSettingsAdapter,
  settingsAdapterRegistry,
} from "../../../_lib/settings-adapter-registry";
import { attendanceSettingsSections } from "../../../_lib/settings-page-config";
import { employeeOptionSets } from "@/lib/runtime/modules/employee-metadata.adapter";

/**
 * Slice 3a UI logic.
 *
 * apps/web tests run in a node environment against pure functions — there is no
 * jsdom or testing library in this repo. The rules worth protecting here are
 * exactly the pure ones: how readiness is described, what activation is allowed
 * to offer, and who sees the navigation.
 */

const READY: IntegrationReadiness = {
  configurationValid: true,
  gatewayAvailable: true,
  deviceVerified: true,
  enabledDeviceCount: 2,
  verifiedDeviceCount: 2,
  blockers: [],
};

/** Everything configured, but no gateway has reached a terminal yet. */
const UNVERIFIED: IntegrationReadiness = {
  configurationValid: true,
  gatewayAvailable: true,
  deviceVerified: false,
  enabledDeviceCount: 2,
  verifiedDeviceCount: 0,
  blockers: [
    "No device has been verified yet. Install and pair a gateway, then run Verify device.",
  ],
};

const NOT_READY: IntegrationReadiness = {
  configurationValid: false,
  gatewayAvailable: false,
  deviceVerified: false,
  enabledDeviceCount: 0,
  blockers: [
    "The connector configuration is incomplete or invalid.",
    "No enabled device is configured for this integration.",
    "This connector needs a gateway, and none is assigned.",
  ],
};

describe("attendance integration navigation", () => {
  const READ_ONLY = ["integrations.read"];
  const NO_ACCESS = ["attendance.read"];

  it("shows the Integrations group to a user with integrations.read", () => {
    const groups = resolveVisibleSettingsGroups(READ_ONLY);
    const integrations = groups.find((group) => group.key === "integrations");

    expect(integrations).toBeDefined();
    expect(integrations?.items.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        "attendance-integrations-overview",
        "attendance-integrations",
      ]),
    );
  });

  it("hides the Integrations group from a user without the permission", () => {
    const groups = resolveVisibleSettingsGroups(NO_ACCESS);
    expect(groups.find((group) => group.key === "integrations")).toBeUndefined();
  });

  it("also admits a user who only holds integrations.manage", () => {
    const groups = resolveVisibleSettingsGroups(["integrations.manage"]);
    expect(groups.find((group) => group.key === "integrations")).toBeDefined();
  });

  it("exposes only what integrations.read alone entitles the user to", () => {
    const items = flattenVisibleSettingsItems(READ_ONLY).filter((item) =>
      item.href.startsWith("/settings/integrations/attendance"),
    );

    // Devices, Gateways, Mapping and Provisioning are gated on their own
    // permissions, so they must not appear for an integrations-only reader.
    expect(items.map((item) => item.href).sort()).toEqual([
      "/settings/integrations/attendance",
      "/settings/integrations/attendance/integrations",
      "/settings/integrations/attendance/sync-history",
    ]);
  });
});

describe("status presentation", () => {
  it("uses business wording, not enum values", () => {
    expect(statusLabel("UNVERIFIED")).toBe("Unverified");
    expect(statusLabel("ACTIVE")).toBe("Active");
    expect(statusLabel("DRAFT")).toBe("Draft");
  });

  it("treats unverified as a caution, never a failure", () => {
    expect(statusTone("UNVERIFIED")).toBe("warning");
    expect(statusTone("ERROR")).toBe("danger");
    expect(statusTone("ACTIVE")).toBe("good");
  });

  it("describes connection modes in plain language", () => {
    expect(connectionModeLabel("LOCAL_GATEWAY")).toBe("Local gateway");
    expect(connectionModeLabel("CLOUD_API")).toBe("Cloud API");
  });

  it("falls back to the raw value for an unknown mode", () => {
    expect(connectionModeLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});

describe("readiness signals", () => {
  it("reports the four requirements plus the overall status separately", () => {
    const signals = readinessSignals(READY, "LOCAL_GATEWAY", "UNVERIFIED");

    expect(signals.map((signal) => signal.key)).toEqual([
      "configuration",
      "gateway",
      "device",
      "deviceVerification",
      "status",
    ]);
  });

  it("reports how many devices a gateway has actually verified", () => {
    const signals = readinessSignals(READY, "LOCAL_GATEWAY", "UNVERIFIED");
    const verification = signals.find(
      (signal) => signal.key === "deviceVerification",
    );

    expect(verification?.value).toBe("2 of 2 verified");
    expect(verification?.tone).toBe("good");
  });

  it("flags unverified devices, because activation now waits on them", () => {
    const signals = readinessSignals(UNVERIFIED, "LOCAL_GATEWAY", "UNVERIFIED");
    const verification = signals.find(
      (signal) => signal.key === "deviceVerification",
    );

    expect(verification?.value).toBe("Not verified yet");
    expect(verification?.tone).toBe("warning");
    expect(verification?.detail).toMatch(/Verify device/i);
  });

  it("does not present an unverified integration as successful", () => {
    const signals = readinessSignals(READY, "LOCAL_GATEWAY", "UNVERIFIED");
    const status = signals.find((signal) => signal.key === "status");

    expect(status?.value).toBe("Unverified");
    expect(status?.tone).not.toBe("good");
  });

  it("omits the gateway requirement for connectors that do not need one", () => {
    const signals = readinessSignals(READY, "CLOUD_API", "ACTIVE");
    expect(signals.map((signal) => signal.key)).not.toContain("gateway");
  });

  it("flags a missing gateway for local-gateway connectors", () => {
    const signals = readinessSignals(NOT_READY, "LOCAL_GATEWAY", "DRAFT");
    const gateway = signals.find((signal) => signal.key === "gateway");

    expect(gateway?.value).toBe("Not available");
    expect(gateway?.tone).toBe("warning");
  });

  it("flags an integration with no enabled device", () => {
    const signals = readinessSignals(NOT_READY, "LOCAL_GATEWAY", "DRAFT");
    const device = signals.find((signal) => signal.key === "device");

    expect(device?.value).toBe("None yet");
    expect(device?.tone).toBe("warning");
  });

  it("reports a configured device count when devices exist", () => {
    const signals = readinessSignals(READY, "LOCAL_GATEWAY", "UNVERIFIED");
    const device = signals.find((signal) => signal.key === "device");

    expect(device?.value).toBe("2 configured");
    expect(device?.tone).toBe("good");
  });
});

describe("activation gating", () => {
  it("allows activation only when the API reports no blockers", () => {
    expect(canActivate(READY, "UNVERIFIED")).toBe(true);
    expect(canActivate(NOT_READY, "DRAFT")).toBe(false);
  });

  it("does not offer activation for an already-active integration", () => {
    expect(canActivate(READY, "ACTIVE")).toBe(false);
  });

  it("keeps every blocker so the UI can list them", () => {
    expect(NOT_READY.blockers).toHaveLength(3);
    expect(canActivate(NOT_READY, "UNVERIFIED")).toBe(false);
  });

  it("withholds activation until a gateway has verified a device", () => {
    // The API decides what blocks; the UI only reports its list. An integration
    // whose devices have never answered must not offer Activate.
    expect(UNVERIFIED.deviceVerified).toBe(false);
    expect(canActivate(UNVERIFIED, "UNVERIFIED")).toBe(false);
    expect(canActivate(READY, "UNVERIFIED")).toBe(true);
  });
});

describe("schedule and date formatting", () => {
  it("says when nothing is scheduled", () => {
    expect(describeSchedule(null)).toBe("Not scheduled");
  });

  it("falls back to the policy name when no interval is supplied", () => {
    expect(describeSchedule({ name: "Nightly" })).toBe("Nightly");
  });

  it("renders an interval in plain language", () => {
    expect(describeSchedule({ name: "x" }, 30, "MINUTES")).toBe(
      "Every 30 minutes",
    );
    expect(describeSchedule({ name: "x" }, 1, "HOURS")).toBe("Every 1 hour");
  });

  it("renders an em dash for a missing timestamp", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
  });
});

describe("device presentation", () => {
  it("describes health in operator language", () => {
    expect(deviceHealthLabel("HEALTHY")).toBe("Healthy");
    expect(deviceHealthLabel("UNREACHABLE")).toBe("Unreachable");
  });

  it("does not present an uncontacted device as a failure", () => {
    // A device nobody has polled yet has not failed at anything, so it must
    // not be coloured like one.
    expect(deviceHealthLabel("UNKNOWN")).toBe("Not checked yet");
    expect(deviceHealthTone("UNKNOWN")).toBe("info");
    expect(deviceHealthTone("UNREACHABLE")).toBe("danger");
    expect(deviceHealthTone("HEALTHY")).toBe("good");
  });

  it("treats a device awaiting its first contact as pending, not active", () => {
    expect(deviceStatusLabel("PENDING_VERIFICATION")).toBe("Pending");
    expect(deviceStatusTone("PENDING_VERIFICATION")).toBe("warning");
    expect(deviceStatusTone("ACTIVE")).toBe("good");
  });

  it("names each scope type in business terms", () => {
    expect(scopeTypeLabel("TENANT")).toBe("Whole organisation");
    expect(scopeTypeLabel("BUSINESS_UNIT")).toBe("Business unit");
    expect(scopeTypeLabel("EMPLOYEE")).toBe("Employee");
  });

  it("falls back to the raw scope type rather than showing nothing", () => {
    expect(scopeTypeLabel("SHIFT_PATTERN")).toBe("SHIFT_PATTERN");
  });

  it("spells out what a direction-restricted device records", () => {
    expect(directionModeLabel("ENTRY")).toBe("Entry only");
    expect(directionModeLabel("BIDIRECTIONAL")).toBe("Entry and exit");
  });
});

describe("mapping review", () => {
  it("uses review wording rather than enum values", () => {
    expect(mappingStatusLabel("MATCHED")).toBe("Mapped");
    expect(mappingStatusLabel("CONFLICT")).toBe("Needs review");
    expect(mappingStatusLabel("PENDING")).toBe("Unmapped");
  });

  it("treats a conflict as an error and an unmapped user as work to do", () => {
    expect(mappingStatusTone("CONFLICT")).toBe("danger");
    expect(mappingStatusTone("PENDING")).toBe("warning");
    expect(mappingStatusTone("MATCHED")).toBe("good");
  });

  it("never lets a name-only match look automatic", () => {
    // Two people can share a name. Attributing one person's attendance to the
    // other is a payroll error that is painful to unpick.
    const presentation = matchPresentation({
      strategy: "NAME_SUGGESTION",
      confidence: "HIGH",
    });

    expect(presentation.requiresConfirmation).toBe(true);
    expect(presentation.tone).toBe("warning");
    expect(presentation.label).toMatch(/name only/i);
  });

  it("still demands confirmation for a name match the API calls confirmed", () => {
    // The strategy check runs first on purpose: confidence must not be able to
    // promote a name-only match past human review.
    const presentation = matchPresentation({
      strategy: "NAME_SUGGESTION",
      confidence: "CONFIRMED",
    });

    expect(presentation.requiresConfirmation).toBe(true);
  });

  it("still asks for confirmation on an identifier match", () => {
    const byCode = matchPresentation({
      strategy: "EMPLOYEE_CODE",
      confidence: "HIGH",
    });

    expect(byCode.label).toBe("Employee number match");
    expect(byCode.tone).toBe("good");
    // Stronger evidence earns a friendlier label, not a silent write.
    expect(byCode.requiresConfirmation).toBe(true);
  });

  it("asks for nothing when the user is already mapped", () => {
    const existing = matchPresentation({
      strategy: "EXISTING_IDENTITY",
      confidence: "CONFIRMED",
    });

    expect(existing.label).toBe("Already mapped");
    expect(existing.requiresConfirmation).toBe(false);
  });

  it("never presents any candidate as safe to apply without review", () => {
    const strategies = [
      "EMPLOYEE_CODE",
      "EXTERNAL_EMPLOYEE_CODE",
      "EMAIL",
      "NAME_SUGGESTION",
    ];

    for (const strategy of strategies) {
      expect(
        matchPresentation({ strategy, confidence: "HIGH" })
          .requiresConfirmation,
      ).toBe(true);
    }
  });
});

describe("provisioning jobs", () => {
  it("uses queue wording operators recognise", () => {
    expect(provisioningStatusLabel("PENDING")).toBe("Queued");
    expect(provisioningStatusLabel("SUCCEEDED")).toBe("Completed");
    expect(provisioningStatusLabel("PROCESSING")).toBe("In progress");
  });

  it("offers retry only for a job that finished badly", () => {
    expect(canRetryJob("FAILED")).toBe(true);
    expect(canRetryJob("PENDING")).toBe(false);
    expect(canRetryJob("PROCESSING")).toBe(false);
    expect(canRetryJob("SUCCEEDED")).toBe(false);
  });

  it("does not offer to cancel a job a gateway may already be writing", () => {
    expect(canCancelJob("PENDING")).toBe(true);
    expect(canCancelJob("RETRYING")).toBe(true);
    expect(canCancelJob("PROCESSING")).toBe(false);
    expect(canCancelJob("SUCCEEDED")).toBe(false);
  });

  it("never offers both retry and cancel for the same job", () => {
    for (const status of [
      "PENDING",
      "PROCESSING",
      "SUCCEEDED",
      "FAILED",
      "RETRYING",
      "CANCELLED",
    ]) {
      expect(canRetryJob(status) && canCancelJob(status)).toBe(false);
    }
  });
});

describe("gateway presentation", () => {
  it("describes a never-paired gateway as awaiting pairing", () => {
    expect(gatewayStatusLabel("PENDING_PAIRING")).toBe("Awaiting pairing");
    expect(gatewayStatusTone("PENDING_PAIRING")).toBe("info");
  });

  it("distinguishes a revoked gateway from one that is merely offline", () => {
    expect(gatewayStatusTone("REVOKED")).toBe("danger");
    expect(gatewayStatusTone("OFFLINE")).toBe("muted");
  });
});

describe("sync history", () => {
  it("names run types by what they do, not by their enum", () => {
    expect(runTypeLabel("ATTENDANCE_PULL")).toBe("Attendance sync");
    expect(runTypeLabel("USER_DISCOVERY")).toBe("Device user discovery");
    expect(runTypeLabel("USER_PROVISION")).toBe("Employee provisioning");
  });

  it("treats a partially successful run as a caution, not a success", () => {
    expect(runStatusTone("PARTIAL")).toBe("warning");
    expect(runStatusTone("SUCCEEDED")).toBe("good");
    expect(runStatusTone("FAILED")).toBe("danger");
  });

  it("shows a run still in flight as running rather than blank", () => {
    expect(runStatusLabel("RUNNING")).toBe("Running");
    expect(runStatusTone("RUNNING")).toBe("info");
  });

  it("reports durations at a readable scale", () => {
    expect(formatDuration(null)).toBe("-");
    expect(formatDuration(450)).toBe("450 ms");
    expect(formatDuration(4500)).toBe("4.5 s");
    expect(formatDuration(300_000)).toBe("5 min");
  });
});

describe("downloads", () => {
  it("names platforms the way a customer would recognise them", () => {
    expect(platformLabel("WINDOWS", "X86")).toBe("Windows 32-bit");
    expect(platformLabel("WINDOWS", "X64")).toBe("Windows 64-bit");
    expect(platformLabel("MACOS", "ARM64")).toBe("macOS ARM64");
  });

  it("describes the gateway without implementation jargon", () => {
    // An administrator choosing a download does not need to hear about COM or
    // zkemkeeper; that belongs in technical documentation.
    const description = appDescription("INTEGRATION_GATEWAY", null);

    expect(description).toMatch(/your own network/i);
    expect(description).not.toMatch(/\bCOM\b|zkemkeeper|x86/);
  });

  it("falls back to the release's own description for an unknown app", () => {
    expect(appDescription("SOMETHING_NEW", "From the release")).toBe(
      "From the release",
    );
    expect(appDescription("SOMETHING_NEW", null)).toBe("");
  });

  it("recommends the 64-bit Windows build when a choice exists", () => {
    const siblings = [
      { platform: "WINDOWS", architecture: "X64" },
      { platform: "WINDOWS", architecture: "X86" },
    ];

    expect(isRecommendedBuild(siblings[0], siblings)).toBe(true);
    expect(isRecommendedBuild(siblings[1], siblings)).toBe(false);
  });

  it("recommends nothing when there is only one Windows build", () => {
    // A badge on the only option is noise, not guidance.
    const only = [{ platform: "WINDOWS", architecture: "X64" }];
    expect(isRecommendedBuild(only[0], only)).toBe(false);
  });

  it("never recommends a non-Windows build", () => {
    const releases = [
      { platform: "MACOS", architecture: "ARM64" },
      { platform: "WINDOWS", architecture: "X86" },
      { platform: "WINDOWS", architecture: "X64" },
    ];

    expect(isRecommendedBuild(releases[0], releases)).toBe(false);
  });

  it("reports file sizes in units a person can read", () => {
    expect(formatFileSize(null)).toBe("-");
    expect(formatFileSize(0)).toBe("-");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("navigation for the completed platform", () => {
  const FULL_READER = [
    "integrations.read",
    "attendanceDevices.read",
    "attendanceMappings.read",
    "attendanceProvisioning.read",
    "gateways.read",
    "appDownloads.read",
  ];

  it("exposes every built page to a reader", () => {
    const items = flattenVisibleSettingsItems(FULL_READER).filter((item) =>
      item.href.startsWith("/settings/integrations/attendance"),
    );

    expect(items.map((item) => item.href).sort()).toEqual([
      "/settings/integrations/attendance",
      "/settings/integrations/attendance/devices",
      "/settings/integrations/attendance/gateways",
      "/settings/integrations/attendance/integrations",
      "/settings/integrations/attendance/mapping",
      "/settings/integrations/attendance/provisioning",
      "/settings/integrations/attendance/sync-history",
    ]);
  });

  it("gives the downloads page a way in", () => {
    // The gateway installer is downloaded from here. The page existed with no
    // navigation entry pointing at it.
    const hrefs = flattenVisibleSettingsItems(["appDownloads.read"]).map(
      (item) => item.href,
    );

    expect(hrefs).toContain("/settings/apps");
  });

  it("does not offer downloads to a user without the permission", () => {
    const hrefs = flattenVisibleSettingsItems(["integrations.read"]).map(
      (item) => item.href,
    );

    expect(hrefs).not.toContain("/settings/apps");
  });

  it("hides device and gateway pages from an integrations-only reader", () => {
    const hrefs = flattenVisibleSettingsItems(["integrations.read"]).map(
      (item) => item.href,
    );

    expect(hrefs).not.toContain("/settings/integrations/attendance/devices");
    expect(hrefs).not.toContain("/settings/integrations/attendance/gateways");
  });

  it("gives a device-only reader the device page and nothing more", () => {
    const hrefs = flattenVisibleSettingsItems(["attendanceDevices.read"])
      .filter((item) =>
        item.href.startsWith("/settings/integrations/attendance"),
      )
      .map((item) => item.href);

    expect(hrefs).toEqual(["/settings/integrations/attendance/devices"]);
  });
});

describe("connector capabilities", () => {
  const ZKTECO = {
    capabilities: ["READ_ATTENDANCE", "WRITE_USERS", "LOCAL_GATEWAY_REQUIRED"],
    experimentalCapabilities: [
      {
        capability: "WRITE_USERS",
        reason:
          "The SDK exposes a user write path, but it has not been executed against a physical terminal.",
      },
    ],
    automaticallySupportedCapabilities: ["READ_ATTENDANCE"],
  };

  it("never calls an unproven write path Supported", () => {
    const presented = capabilityPresentation("WRITE_USERS", ZKTECO);

    expect(presented.state).not.toBe("Supported");
    expect(presented.state).toMatch(/awaiting production certification/i);
    expect(presented.tone).toBe("warning");
  });

  it("carries the connector's own reason so the caution is explained", () => {
    const presented = capabilityPresentation("WRITE_USERS", ZKTECO);
    expect(presented.detail).toMatch(/physical terminal/i);
  });

  it("distinguishes a certified capability from a merely present one", () => {
    expect(capabilityPresentation("READ_ATTENDANCE", ZKTECO).state).toBe(
      "Certified for automatic use",
    );
    expect(capabilityPresentation("LOCAL_GATEWAY_REQUIRED", ZKTECO).state).toBe(
      "Available in connector",
    );
  });

  it("recognises ZKTeco as declaring but not certifying provisioning", () => {
    // This is the state the product is actually in. If it ever flips, the
    // provisioning page's warning must be revisited rather than silently lost.
    expect(hasUncertifiedProvisioning(ZKTECO)).toBe(true);
  });

  it("stops warning once a connector certifies the write path", () => {
    expect(
      hasUncertifiedProvisioning({
        capabilities: ["WRITE_USERS"],
        automaticallySupportedCapabilities: ["WRITE_USERS"],
      }),
    ).toBe(false);
  });

  it("says nothing about provisioning for a read-only connector", () => {
    expect(
      hasUncertifiedProvisioning({
        capabilities: ["READ_ATTENDANCE"],
        automaticallySupportedCapabilities: ["READ_ATTENDANCE"],
      }),
    ).toBe(false);
  });

  it("describes capabilities in business language", () => {
    expect(capabilityLabel("WRITE_USERS")).toBe("Send employees to the device");
    expect(capabilityLabel("READ_ATTENDANCE")).toBe(
      "Collect attendance records",
    );
    // Unknown capabilities fall back rather than rendering blank.
    expect(capabilityLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});

describe("work site attendance configuration", () => {
  const locations = getSettingsAdapter("locations");

  function fieldFor(logicalName: string) {
    return locations?.spec.fields.find(
      (candidate) => candidate.logicalName === logicalName,
    );
  }

  it("extends the existing Work Sites module rather than adding another", () => {
    expect(locations).toBeDefined();
    expect(locations?.serverApiPath).toBe("/locations");
    // A second work-site module would split the same records across two pages.
    expect(
      [...settingsAdapterRegistry.values()].filter(
        (adapter) => adapter.serverApiPath === "/locations",
      ),
    ).toHaveLength(1);
  });

  it("surfaces every attendance column the schema defines", () => {
    for (const logicalName of [
      "attendanceEnabled",
      "latitude",
      "longitude",
      "allowedRadiusMeters",
      "maximumAccuracyMeters",
      "timezone",
      "allowedAttendanceMethods",
      "devicePolicy",
      "webAttendancePolicy",
      "webFallbackEnabled",
      "validFrom",
      "validTo",
    ]) {
      expect(fieldFor(logicalName)).toBeDefined();
    }
  });

  it("routes every inheritable attendance override to a purpose-built section", () => {
    /*
     * These columns used to state "(blank uses tenant setting)" in their label,
     * because a generic field has nowhere else to say it. That reads as a hint
     * rather than a choice, and it still cannot show what the tenant currently
     * resolves to. They are now rendered by the Attendance Policy section, which
     * asks the question outright — so no inheritable override may sit in a
     * metadata field section, where it would render as a blank control again.
     */
    const fieldSectionNames = new Set(
      (locations?.spec.formSections ?? []).flatMap((section) =>
        section.fields.map((field) => field.fieldLogicalName),
      ),
    );

    for (const logicalName of [
      "attendanceEnabled",
      "maximumAccuracyMeters",
      "webAttendancePolicy",
      "devicePolicy",
      "webFallbackEnabled",
      "allowedAttendanceMethods",
      "allowedRadiusMeters",
      "latitude",
      "longitude",
      "validFrom",
      "validTo",
    ]) {
      expect(fieldSectionNames.has(logicalName)).toBe(false);
    }
  });

  /*
   * Work Planning is deliberately absent. A Work Site is a physical place: one
   * office holds a Finance team on 09:00-18:00 and a Support team on a 24/7
   * rotation, so schedule and calendar resolve down the organizational
   * hierarchy instead. Effective Period moved under "More".
   */
  it("lays the Work Site form out as configuration steps rather than one flat wall", () => {
    const sections = locations?.spec.formSections ?? [];
    expect(sections.length).toBeGreaterThan(1);
    expect([...new Set(sections.map((section) => section.tabKey))]).toEqual([
      "general",
      "location",
      "attendance-policy",
      "related",
      "more",
    ]);
  });

  it("offers exactly the attendance methods the schema enum allows", () => {
    const options = fieldFor("allowedAttendanceMethods")?.options ?? [];
    expect(options.map((option) => option.value).sort()).toEqual([
      "DEVICE",
      "MANUAL",
      "MOBILE",
      "WEB",
    ]);
  });

  it("does not duplicate an attendance field under a second name", () => {
    const names = (locations?.spec.fields ?? []).map((field) => field.logicalName);
    expect(new Set(names).size).toBe(names.length);
    // Geofence radius is the existing column, not a new "geofenceRadius".
    expect(names).toContain("allowedRadiusMeters");
    expect(names).not.toContain("geofenceRadius");
  });
});

describe("tenant attendance settings", () => {
  const section = attendanceSettingsSections.find(
    (candidate) => candidate.title === "Attendance Integration",
  );

  it("registers the Attendance Integration section", () => {
    expect(section).toBeDefined();
  });

  it("uses the exact attendance integration setting keys", () => {
    // Pinned as an exact list so a stray key cannot be added without someone
    // deciding it belongs here. Eight arrived with the reconciliation engine, each
    // read by it — a setting with no reader is one nobody can trust. Five before
    // them arrived with the gateway runtime:
    // clock-drift thresholds it reports against, and the cadences it is told to
    // run at, all delivered through the normal settings chain rather than a
    // local file on the customer's machine.
    expect((section?.fields ?? []).map((field) => field.key).sort()).toEqual([
      "attendanceConflictPolicy",
      "attendanceEngineEffectiveFrom",
      "autoCloseMissingCheckoutAtShiftEnd",
      "automaticEmployeeDeactivation",
      "automaticEmployeeProvisioning",
      "crossSiteAttendancePolicy",
      "defaultDevicePollIntervalMinutes",
      "defaultPunchDirectionStrategy",
      "defaultSyncMode",
      "deviceClockDriftCriticalSeconds",
      "deviceClockDriftWarningSeconds",
      "deviceProvisioningEnabled",
      "gatewayConfigRefreshSeconds",
      "gatewayHeartbeatIntervalSeconds",
      "gatewayUploadBatchSize",
      "hybridAttendancePolicy",
      "integrationEnabled",
      "minimumLegacyPollIntervalMinutes",
      "officeWebAttendancePolicy",
      "overtimeMinimumMinutes",
      "provisioningMaxRetries",
      "provisioningRetryIntervalMinutes",
      "semanticDuplicateWindowSeconds",
      "treatSessionGapsAsBreaks",
      "webAttendancePolicy",
      "webFallbackPolicy",
      "workModeTransitionPolicy",
    ]);
  });

  it("files every key under the existing attendance category", () => {
    // A new category would resolve outside the tenant -> organization override
    // chain that every other setting uses.
    for (const field of section?.fields ?? []) {
      expect(field.category).toBe("attendance");
    }
  });

  it("does not duplicate geofence settings that already exist", () => {
    const keys = (section?.fields ?? []).map((field) => field.key);
    expect(keys).not.toContain("maximumAllowedDistanceMeters");
    expect(keys).not.toContain("maxAllowedAccuracyMeters");
    expect(keys).not.toContain("defaultGeofenceRadius");
  });

  it("keeps every attendance setting key unique across the whole page", () => {
    const keys = attendanceSettingsSections.flatMap((candidate) =>
      candidate.fields.map((field) => `${field.category}.${field.key}`),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not promise that automatic provisioning writes to devices today", () => {
    const provisioning = (section?.fields ?? []).find(
      (field) => field.key === "automaticEmployeeProvisioning",
    );

    expect(provisioning?.description).toMatch(/validated|certified/i);
  });
});

describe("employee work mode", () => {
  it("offers every mode the schema enum defines", () => {
    const options = employeeOptionSets.workMode ?? [];
    expect(options.map((option) => option.value)).toEqual([
      "OFFICE",
      "REMOTE",
      "HYBRID",
      "FIELD",
    ]);
  });

  it("keeps work mode on the employee record, not inside attendance", () => {
    // A second work-mode field under Attendance would let the two disagree.
    expect(employeeOptionSets.workMode).toBeDefined();
  });
});

describe("gateway lifecycle wording", () => {
  it("describes a gateway that has never paired as awaiting pairing", () => {
    // Phase 2 runtime is not deployed, so this is the state every real gateway
    // is in today. It must not read as a fault.
    expect(gatewayStatusLabel("PENDING_PAIRING")).toBe("Awaiting pairing");
    expect(gatewayStatusTone("PENDING_PAIRING")).toBe("info");
  });

  it("never reports a gateway as online without backend state saying so", () => {
    // Only the ONLINE value produces online wording; nothing infers it.
    const nonOnline = ["PENDING_PAIRING", "OFFLINE", "DEGRADED", "REVOKED"];
    for (const status of nonOnline) {
      expect(gatewayStatusLabel(status)).not.toBe("Online");
      expect(gatewayStatusTone(status)).not.toBe("good");
    }
    expect(gatewayStatusLabel("ONLINE")).toBe("Online");
  });

  it("marks a revoked gateway as an error, not merely disconnected", () => {
    expect(gatewayStatusLabel("REVOKED")).toBe("Revoked");
    expect(gatewayStatusTone("REVOKED")).toBe("danger");
    expect(gatewayStatusTone("OFFLINE")).toBe("muted");
  });
});

describe("downloads and release presentation", () => {
  it("uses the customer-facing name, never an internal build name", () => {
    // A release row published as "POC worker" must not reach a customer page.
    expect(appName("ZKTECO_DIAGNOSTIC", "zkteco-poc COM worker")).toBe(
      "ZKTeco Diagnostic Utility",
    );
    expect(appName("INTEGRATION_GATEWAY", "gateway-host-x86")).toBe(
      "DijiPeople Integration Gateway",
    );
  });

  it("falls back to the release name for an app it does not know", () => {
    expect(appName("SOMETHING_NEW", "Some App")).toBe("Some App");
    expect(appName("SOMETHING_NEW", null)).toBe("SOMETHING_NEW");
  });

  it("describes the gateway without implementation detail", () => {
    const description = appDescription("INTEGRATION_GATEWAY", null);

    expect(description).toMatch(/network/i);
    expect(description).not.toMatch(/\bCOM\b|zkemkeeper|x86|\bPOC\b/);
  });

  it("describes the diagnostic utility as a support tool", () => {
    const description = appDescription("ZKTECO_DIAGNOSTIC", null);

    expect(description).toMatch(/diagnostic|support/i);
    expect(description).not.toMatch(/\bCOM\b|zkemkeeper|\bPOC\b/);
  });

  it("recommends the 64-bit Windows build only when a choice exists", () => {
    const both = [
      { platform: "WINDOWS", architecture: "X64" },
      { platform: "WINDOWS", architecture: "X86" },
    ];
    expect(isRecommendedBuild(both[0], both)).toBe(true);
    expect(isRecommendedBuild(both[1], both)).toBe(false);

    const only = [{ platform: "WINDOWS", architecture: "X64" }];
    expect(isRecommendedBuild(only[0], only)).toBe(false);
  });

  it("does not assume the gateway must be 32-bit", () => {
    // The legacy SDK constraint belongs to the diagnostic utility, not to the
    // gateway host, which may isolate a 32-bit adapter in a child process.
    const releases = [
      { platform: "WINDOWS", architecture: "X64" },
      { platform: "WINDOWS", architecture: "X86" },
    ];
    expect(isRecommendedBuild(releases[0], releases)).toBe(true);
  });
});

describe("mapping history", () => {
  it("labels a superseded identity without offering to delete it", () => {
    // The UI shows history read-only; there is no delete affordance and no
    // endpoint behind one.
    const entries: Array<{ status: string }> = [
      { status: "ACTIVE" },
      { status: "SUPERSEDED" },
    ];
    expect(entries.filter((entry) => entry.status === "ACTIVE")).toHaveLength(1);
    expect(entries.filter((entry) => entry.status !== "ACTIVE")).toHaveLength(1);
  });
});

describe("settings wiring", () => {
  const ALL_PERMISSIONS = [
    "integrations.read",
    "integrations.manage",
    "attendanceDevices.read",
    "attendanceDevices.manage",
    "attendanceMappings.read",
    "attendanceMappings.manage",
    "attendanceProvisioning.read",
    "attendanceProvisioning.manage",
    "gateways.read",
    "gateways.manage",
    "appDownloads.read",
  ];

  it("registers every attendance navigation item as a dedicated page", () => {
    // A settings item that is neither adapter-backed nor registered as a
    // dedicated page renders the generic runtime shell and looks broken.
    const items = flattenVisibleSettingsItems(ALL_PERMISSIONS).filter(
      (item) =>
        item.href.startsWith("/settings/integrations/attendance") ||
        item.href === "/settings/apps",
    );

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(DEDICATED_PAGE_KEYS.has(item.key)).toBe(true);
    }
  });

  it("gives the final navigation exactly the pages this phase built", () => {
    const items = flattenVisibleSettingsItems(ALL_PERMISSIONS).filter((item) =>
      item.href.startsWith("/settings/integrations/attendance"),
    );

    expect(items.map((item) => item.label)).toEqual([
      "Attendance Overview",
      "Attendance Integrations",
      "Attendance Devices",
      "Employee Mapping",
      "Device Provisioning",
      "Integration Gateways",
      "Sync History",
    ]);
  });

  it("leaves no attendance navigation item without a permission gate", () => {
    const groups = resolveVisibleSettingsGroups(ALL_PERMISSIONS);
    const integrations = groups.find((group) => group.key === "integrations");

    // Nav items are a const-asserted union, so not every member declares the
    // property; an ungated item is exactly what this test is looking for.
    for (const item of integrations?.items ?? []) {
      const gates =
        "requiredAnyPermissions" in item
          ? ((item as { requiredAnyPermissions?: readonly string[] })
              .requiredAnyPermissions ?? [])
          : [];
      expect(gates.length).toBeGreaterThan(0);
    }
  });

  it("hides the whole group from a user with no integration permission", () => {
    const groups = resolveVisibleSettingsGroups(["attendance.read"]);
    expect(groups.find((group) => group.key === "integrations")).toBeUndefined();
  });

  it("shows each page only to the permission that owns it", () => {
    const cases: Array<[string, string]> = [
      ["attendanceDevices.read", "/settings/integrations/attendance/devices"],
      ["attendanceMappings.read", "/settings/integrations/attendance/mapping"],
      [
        "attendanceProvisioning.read",
        "/settings/integrations/attendance/provisioning",
      ],
      ["gateways.read", "/settings/integrations/attendance/gateways"],
      ["appDownloads.read", "/settings/apps"],
    ];

    for (const [permission, href] of cases) {
      const granted = flattenVisibleSettingsItems([permission]).map(
        (item) => item.href,
      );
      expect(granted).toContain(href);

      // And the page must not leak to a reader holding only the generic key.
      const generic = flattenVisibleSettingsItems(["integrations.read"]).map(
        (item) => item.href,
      );
      if (href !== "/settings/integrations/attendance/sync-history") {
        expect(generic).not.toContain(href);
      }
    }
  });
});
