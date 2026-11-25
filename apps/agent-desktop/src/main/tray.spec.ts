import { EventEmitter } from "node:events";

/*
 * DP-MASTER/WP-17 (D16, S02): what the employee actually sees in the tray menu.
 * Electron itself is not started here (no display in CI); the menu template the
 * real createAgentTray builds is captured and asserted, so a wording or wiring
 * regression in the disclosure fails a test. A real-Electron smoke is a separate
 * manual step recorded in the R1 manifest.
 */
let lastTemplate: Array<Record<string, unknown>> = [];

jest.mock("electron", () => ({
  app: { getVersion: () => "0.0.0-test", quit: jest.fn() },
  Menu: {
    buildFromTemplate: (template: Array<Record<string, unknown>>) => {
      lastTemplate = template;
      return {};
    },
  },
  nativeImage: {
    createEmpty: () => ({ isEmpty: () => true }),
    createFromPath: () => ({ isEmpty: () => true }),
  },
  Tray: class {
    setTitle() {}
    setToolTip() {}
    setContextMenu() {}
    on() {}
    popUpContextMenu() {}
  },
}));
jest.mock("./assets", () => ({ resolveAgentAsset: () => null }));

import { createAgentTray } from "./tray";

function build(dlpConsent: { required: boolean; granted: boolean }, captureActive: boolean) {
  const sessionManager = Object.assign(new EventEmitter(), {
    user: { fullName: "Ada Lovelace" },
    status: "ACTIVE",
    sessionId: "s",
    deviceId: "d",
    lastHeartbeatSync: null,
    lastConfigSync: null,
  });
  const configManager = {
    current: {
      policy: { mandatory: false, allowUserQuit: true },
      features: { cameraAccess: false, microphoneAccess: false, locationAccess: false },
      tracking: { enabled: true, captureActiveApp: true, captureWindowTitle: false },
      privacy: { allowClipboardTracking: captureActive, allowScreenshots: false },
      dlpConsent,
    },
    lastSyncedAt: null,
  };
  const onReview = jest.fn();
  createAgentTray({
    sessionManager: sessionManager as never,
    configManager: configManager as never,
    onShowLogin: jest.fn(),
    onShowDevicePermissions: jest.fn(),
    onCheckUpdates: jest.fn(),
    isDlpCaptureActive: () => captureActive,
    onReviewMonitoringPolicy: onReview,
  });
  return { onReview };
}

const labels = () => lastTemplate.map((item) => String(item.label ?? ""));

describe("tray disclosure", () => {
  it("lists what is collected, including that window titles are not", () => {
    build({ required: false, granted: false }, false);
    const collects = lastTemplate.find((i) => i.label === "What this app collects");
    const lines = (collects?.submenu as Array<{ label: string }>).map((i) => i.label);
    expect(lines).toContain("Window titles: not collected");
    expect(lines).toContain("Keystrokes: never collected");
  });

  it("says content monitoring is off until the policy is acknowledged, and offers the review", () => {
    const { onReview } = build({ required: true, granted: false }, false);
    expect(labels()).toContain("Content monitoring: off until you acknowledge the policy");
    const review = lastTemplate.find((i) => String(i.label).startsWith("Review and acknowledge"));
    expect(review).toBeDefined();
    (review!.click as () => void)();
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("shows no acknowledgement prompt once granted and reports capture truthfully", () => {
    build({ required: true, granted: true }, true);
    expect(labels().some((l) => l.startsWith("Review and acknowledge"))).toBe(false);
    expect(labels()).toContain("Content monitoring: ON (clipboard/screenshots)");
  });
});
