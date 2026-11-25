import {
  awaitingAcknowledgement,
  contentMonitoringLabel,
  describeCollection,
} from "./collection-disclosure";

const base = {
  tracking: { enabled: true, captureActiveApp: true, captureWindowTitle: false },
  privacy: { allowClipboardTracking: false, allowScreenshots: false },
  dlpConsent: { required: false, granted: false },
} as never;

describe("describeCollection", () => {
  it("reflects exactly what the server config enables", () => {
    const lines = describeCollection(base);
    expect(lines).toContain("Window titles: not collected");
    expect(lines).toContain("Clipboard: not collected");
    expect(lines).toContain("Keystrokes: never collected");
  });

  it("discloses window titles, clipboard and screenshots when enabled", () => {
    const lines = describeCollection({
      tracking: { enabled: true, captureActiveApp: true, captureWindowTitle: true },
      privacy: { allowClipboardTracking: true, allowScreenshots: true },
      dlpConsent: { required: true, granted: true },
    } as never);
    expect(lines).toContain("Window titles: collected");
    expect(lines.join("|")).toMatch(/Clipboard: monitored/);
    expect(lines.join("|")).toMatch(/Screenshots: taken only when/);
  });

  it("says tracking is off when the tenant has it disabled", () => {
    expect(
      describeCollection({ ...(base as object), tracking: { enabled: false } } as never),
    ).toEqual(["Activity tracking is off for your company."]);
  });
});

describe("consent status shown to the employee", () => {
  const waiting = { dlpConsent: { required: true, granted: false } } as never;
  const granted = { dlpConsent: { required: true, granted: true } } as never;

  it("says capture is off until the policy is acknowledged, even if the tenant enabled it", () => {
    expect(awaitingAcknowledgement(waiting)).toBe(true);
    expect(contentMonitoringLabel(waiting, true)).toBe(
      "Content monitoring: off until you acknowledge the policy",
    );
  });

  it("reports capture truthfully once acknowledged", () => {
    expect(awaitingAcknowledgement(granted)).toBe(false);
    expect(contentMonitoringLabel(granted, true)).toContain("ON");
    expect(contentMonitoringLabel(granted, false)).toBe("Content monitoring: off");
  });
});
