import {
  applyExpiryMode,
  attendanceMethodsLabel,
  buildWorkSiteReadinessChecks,
  buildWorkSiteSummaryRows,
  describeInheritance,
  devicePolicyLabel,
  isOverridden,
  resolveExpiryMode,
  validateWorkSiteDraft,
  webAttendanceLabel,
  webFallbackLabel,
  type WorkSiteReadinessPayload,
} from "./work-site-configuration";

function payload(
  overrides: Partial<WorkSiteReadinessPayload> = {},
): WorkSiteReadinessPayload {
  return {
    workSite: {
      id: "site-1",
      name: "Karachi Office",
      code: "KHI-001",
      city: "Karachi",
      state: "Sindh",
      country: "Pakistan",
      timezone: "Asia/Karachi",
      latitude: 24.8607,
      longitude: 67.0011,
      isActive: true,
      allowedRadiusMeters: 100,
      maximumAccuracyMeters: null,
      attendanceEnabled: null,
      allowedAttendanceMethods: [],
      webAttendancePolicy: null,
      devicePolicy: "DEVICE_REQUIRED",
      webFallbackEnabled: null,
      defaultWorkScheduleId: "schedule-1",
      holidayCalendarId: null,
      ...(overrides.workSite ?? {}),
    },
    effective: {
      attendanceEnabled: true,
      devicePolicy: "DEVICE_REQUIRED",
      webAttendancePolicy: "ALLOWED",
      webFallbackEnabled: true,
      radiusMeters: 100,
      maximumAccuracyMeters: 100,
      allowedMethods: ["DEVICE", "WEB", "MOBILE", "MANUAL"],
      sources: {
        attendanceEnabled: "TENANT",
        devicePolicy: "WORK_SITE",
        webAttendancePolicy: "TENANT",
        webFallbackEnabled: "TENANT",
        radiusMeters: "WORK_SITE",
        maximumAccuracyMeters: "TENANT",
        allowedAttendanceMethods: "TENANT",
      },
      ...(overrides.effective ?? {}),
    },
    tenantDefaults: {
      attendanceEnabled: true,
      devicePolicy: "DEVICE_PREFERRED",
      webAttendancePolicy: "ALLOWED",
      webFallbackEnabled: true,
      webFallbackPolicy: "ALLOW_WHEN_DEVICE_UNAVAILABLE",
      radiusMeters: 200,
      maximumAccuracyMeters: 100,
      allowedMethods: ["DEVICE", "WEB", "MOBILE", "MANUAL"],
      ...(overrides.tenantDefaults ?? {}),
    },
    counts: {
      authorizedEmployees: 47,
      assignedEmployees: 40,
      primaryOnlyEmployees: 7,
      attendanceDevices: 2,
      enabledAttendanceDevices: 2,
      recentAttendanceSessions: 120,
      ...(overrides.counts ?? {}),
    },
    devices: overrides.devices ?? [
      {
        id: "device-1",
        name: "Main Entrance K50",
        code: "K50-1",
        model: "K50",
        provider: "ZKTECO_LEGACY",
        status: "ACTIVE",
        isEnabled: true,
        healthStatus: "HEALTHY",
        lastSeenAt: "2026-08-14T09:00:00.000Z",
        lastSuccessfulSyncAt: "2026-08-14T09:00:00.000Z",
        gateway: {
          id: "gw-1",
          name: "Karachi Office Gateway",
          status: "ONLINE",
          lastHeartbeatAt: "2026-08-14T09:05:00.000Z",
        },
      },
    ],
    gateways: overrides.gateways ?? [
      {
        id: "gw-1",
        name: "Karachi Office Gateway",
        status: "ONLINE",
        lastHeartbeatAt: "2026-08-14T09:05:00.000Z",
        lastSuccessfulUploadAt: "2026-08-14T09:05:00.000Z",
      },
    ],
    legacyWorkPlanning:
      overrides.legacyWorkPlanning === undefined
        ? {
            defaultWorkScheduleName: "Pakistan Region",
            holidayCalendarName: "Pakistan Region",
          }
        : overrides.legacyWorkPlanning,
  };
}

function checkFor(data: WorkSiteReadinessPayload, key: string) {
  const check = buildWorkSiteReadinessChecks(data).find((item) => item.key === key);
  if (!check) throw new Error(`No readiness check named ${key}`);
  return check;
}

describe("inheritance", () => {
  it("treats null, undefined and empty string as inherited", () => {
    expect(isOverridden(null)).toBe(false);
    expect(isOverridden(undefined)).toBe(false);
    expect(isOverridden("")).toBe(false);
  });

  it("treats an explicit false as an override, not an absence", () => {
    expect(isOverridden(false)).toBe(true);
    expect(isOverridden(0)).toBe(true);
    expect(isOverridden("DEVICE_REQUIRED")).toBe(true);
  });

  it("describes an override alongside the value the tenant resolves to", () => {
    const described = describeInheritance({
      override: "DEVICE_REQUIRED" as const,
      effective: "DEVICE_REQUIRED" as const,
      tenantValue: "DEVICE_PREFERRED" as const,
      format: devicePolicyLabel,
    });
    expect(described.isOverridden).toBe(true);
    expect(described.overrideLabel).toBe("Require attendance device");
    expect(described.tenantLabel).toBe("Prefer the device, allow web/mobile");
  });

  it("describes an inherited setting with no override label", () => {
    const described = describeInheritance({
      override: null,
      effective: true,
      tenantValue: true,
      format: webFallbackLabel,
    });
    expect(described.isOverridden).toBe(false);
    expect(described.overrideLabel).toBe("");
    expect(described.effectiveLabel).toBe("Allowed as a fallback");
  });
});

describe("policy wording", () => {
  it("names the device requirement in business terms", () => {
    expect(devicePolicyLabel("DEVICE_REQUIRED")).toBe("Require attendance device");
    expect(devicePolicyLabel("DEVICE_OPTIONAL")).toBe("Allow web/mobile attendance");
    expect(devicePolicyLabel(null)).toBe("Not configured");
  });

  it("names the web attendance policy without exposing the enum", () => {
    expect(webAttendanceLabel("FALLBACK_ONLY")).toBe("Allowed only as a fallback");
    expect(webAttendanceLabel("DISALLOWED")).toBe("Not allowed");
  });

  it("says what an empty method list actually means", () => {
    expect(attendanceMethodsLabel([])).toBe("No restriction at this work site");
    expect(attendanceMethodsLabel(null)).toBe("No restriction at this work site");
    expect(attendanceMethodsLabel(["DEVICE", "WEB"])).toBe(
      "Attendance device, Web",
    );
  });
});

describe("effective period", () => {
  it("reads a missing validTo as Never", () => {
    expect(resolveExpiryMode(null)).toBe("NEVER");
    expect(resolveExpiryMode("")).toBe("NEVER");
    expect(resolveExpiryMode(undefined)).toBe("NEVER");
  });

  it("reads a stored validTo as an expiry date", () => {
    expect(resolveExpiryMode("2027-01-01")).toBe("ON_DATE");
  });

  it("persists Never as null on the existing column", () => {
    expect(applyExpiryMode("NEVER", "2027-01-01")).toBeNull();
  });

  it("keeps the chosen date when switching to On date", () => {
    expect(applyExpiryMode("ON_DATE", "2027-01-01")).toBe("2027-01-01");
    expect(applyExpiryMode("ON_DATE", null)).toBe("");
  });
});

describe("validation", () => {
  it("accepts a fully configured draft", () => {
    expect(
      validateWorkSiteDraft({
        latitude: 24.8607,
        longitude: 67.0011,
        allowedRadiusMeters: 100,
        maximumAccuracyMeters: 100,
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
      }),
    ).toEqual({});
  });

  it("rejects coordinates outside the legal range", () => {
    const errors = validateWorkSiteDraft({ latitude: 91, longitude: -181 });
    expect(errors.latitude).toContain("-90 and 90");
    expect(errors.longitude).toContain("-180 and 180");
  });

  it("requires the two coordinates together", () => {
    expect(validateWorkSiteDraft({ latitude: "", longitude: 67 }).latitude).toBeDefined();
    expect(validateWorkSiteDraft({ latitude: 24, longitude: "" }).longitude).toBeDefined();
  });

  it("rejects a zero or negative radius and accuracy", () => {
    expect(validateWorkSiteDraft({ allowedRadiusMeters: 0 }).allowedRadiusMeters)
      .toBeDefined();
    expect(validateWorkSiteDraft({ maximumAccuracyMeters: -5 }).maximumAccuracyMeters)
      .toBeDefined();
  });

  it("rejects an expiry earlier than the start", () => {
    expect(
      validateWorkSiteDraft({ validFrom: "2026-06-01", validTo: "2026-01-01" }).validTo,
    ).toBeDefined();
    expect(
      validateWorkSiteDraft({ validFrom: "2026-01-01", validTo: "2026-01-01" }).validTo,
    ).toBeUndefined();
  });

  it("treats an unset expiry as valid", () => {
    expect(
      validateWorkSiteDraft({ validFrom: "2026-06-01", validTo: null }),
    ).toEqual({});
  });
});

describe("readiness", () => {
  it("reports every check ready for a fully configured work site", () => {
    const checks = buildWorkSiteReadinessChecks(payload());
    expect(checks.every((check) => check.status === "ready")).toBe(true);
    expect(checks.map((check) => check.key)).toEqual([
      "location",
      "geofence",
      "timezone",
      "attendance",
      "policy",
      "devices",
      "gateway",
    ]);
  });

  it("flags missing coordinates without failing the other checks", () => {
    const data = payload({
      workSite: { ...payload().workSite, latitude: null, longitude: null },
    });
    expect(checkFor(data, "location").status).toBe("needs-configuration");
    expect(checkFor(data, "devices").status).toBe("ready");
  });

  it("marks an inherited geofence as pending rather than configured here", () => {
    const data = payload({
      workSite: { ...payload().workSite, allowedRadiusMeters: null },
    });
    const check = checkFor(data, "geofence");
    expect(check.status).toBe("pending");
    expect(check.detail).toContain("tenant default");
  });

  it("says no devices assigned when there are none", () => {
    const data = payload({ devices: [], gateways: [] });
    expect(checkFor(data, "devices").status).toBe("needs-configuration");
    expect(checkFor(data, "devices").detail).toBe("No devices assigned");
  });

  it("never claims a gateway is connected before it has reported", () => {
    const data = payload({
      gateways: [
        {
          id: "gw-1",
          name: "Karachi Office Gateway",
          status: "PENDING",
          lastHeartbeatAt: null,
          lastSuccessfulUploadAt: null,
        },
      ],
    });
    const check = checkFor(data, "gateway");
    expect(check.status).toBe("not-reported");
    expect(check.detail).toContain("has not reported a heartbeat yet");
  });

  it("reports a heard-from but offline gateway as pending, not ready", () => {
    const data = payload({
      gateways: [
        {
          id: "gw-1",
          name: "Karachi Office Gateway",
          status: "OFFLINE",
          lastHeartbeatAt: "2026-08-10T09:05:00.000Z",
          lastSuccessfulUploadAt: null,
        },
      ],
    });
    expect(checkFor(data, "gateway").status).toBe("pending");
  });

  it("marks the gateway check not applicable when no device uses one", () => {
    const data = payload({
      devices: [
        {
          ...payload().devices[0],
          gateway: null,
        },
      ],
      gateways: [],
    });
    expect(checkFor(data, "gateway").status).toBe("not-applicable");
  });

  it("says where a disabled attendance decision came from", () => {
    const base = payload();
    const data = payload({
      effective: {
        ...base.effective,
        attendanceEnabled: false,
        sources: { ...base.effective.sources, attendanceEnabled: "WORK_SITE" },
      },
    });
    const check = checkFor(data, "attendance");
    expect(check.status).toBe("needs-configuration");
    expect(check.detail).toContain("work site override");
  });

  /*
   * A Work Site is a physical place, so "no schedule assigned to this site" is
   * not a statement about whether the site can capture attendance. The check was
   * removed when schedule resolution moved onto the organizational hierarchy;
   * this asserts it stays gone rather than quietly returning.
   */
  it("does not judge the site on a work schedule", () => {
    const keys = buildWorkSiteReadinessChecks(payload()).map((check) => check.key);
    expect(keys).not.toContain("schedule");
    expect(keys).toEqual([
      "location",
      "geofence",
      "timezone",
      "attendance",
      "policy",
      "devices",
      "gateway",
    ]);
  });

  it("flags a work site where no capture method survives the restriction", () => {
    const base = payload();
    const data = payload({
      effective: { ...base.effective, allowedMethods: [] },
    });
    expect(checkFor(data, "policy").status).toBe("needs-configuration");
  });

  it("names the layer that decided the permitted methods", () => {
    const base = payload();
    const data = payload({
      effective: {
        ...base.effective,
        allowedMethods: ["DEVICE"],
        sources: {
          ...base.effective.sources,
          allowedAttendanceMethods: "WORK_SITE",
        },
      },
    });
    const check = checkFor(data, "policy");
    expect(check.status).toBe("ready");
    expect(check.detail).toContain("work site override");
  });
});

describe("summary", () => {
  it("labels each value with the layer that decided it", () => {
    const rows = buildWorkSiteSummaryRows(payload());
    expect(rows.find((row) => row.label === "Office policy")?.source).toBe(
      "Work site",
    );
    expect(rows.find((row) => row.label === "Attendance")?.source).toBe(
      "Tenant setting",
    );
  });

  it("says Not configured instead of inventing a value", () => {
    const base = payload();
    const rows = buildWorkSiteSummaryRows(
      payload({
        workSite: { ...base.workSite, timezone: null },
        counts: { ...base.counts, attendanceDevices: 0, enabledAttendanceDevices: 0 },
      }),
    );
    expect(rows.find((row) => row.label === "Timezone")?.value).toBe("Not configured");
    expect(rows.find((row) => row.label === "Devices")?.value).toBe(
      "No devices assigned",
    );
  });

  /* Schedule and calendar belong to the employee's organization, not to a place. */
  it("does not report a schedule or a calendar", () => {
    const labels = buildWorkSiteSummaryRows(payload()).map((row) => row.label);
    expect(labels).not.toContain("Schedule");
    expect(labels).not.toContain("Work calendar");
  });

  it("reports the gateway only as strongly as the evidence allows", () => {
    const base = payload();
    const notReported = buildWorkSiteSummaryRows(
      payload({
        gateways: [
          {
            id: "gw-1",
            name: "Karachi Office Gateway",
            status: "PENDING",
            lastHeartbeatAt: null,
            lastSuccessfulUploadAt: null,
          },
        ],
      }),
    );
    expect(notReported.find((row) => row.label === "Gateway")?.value).toBe(
      "Not yet reported",
    );

    const none = buildWorkSiteSummaryRows(payload({ gateways: [] }));
    expect(none.find((row) => row.label === "Gateway")?.value).toBe(
      "Not applicable",
    );

    const online = buildWorkSiteSummaryRows(payload({ gateways: base.gateways }));
    expect(online.find((row) => row.label === "Gateway")?.value).toBe("Online");
  });
});
