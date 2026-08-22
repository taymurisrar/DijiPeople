import { powerMonitor } from "electron";
import { ActivityTracker } from "./activity-tracker";
import { DEFAULT_CONFIG } from "./config-manager";
import type { AgentConfig } from "./types";

/**
 * REG-214 — ITEM-0033.
 *
 * This is the code that decides **what leaves the employee's machine**. It reads
 * the title of whatever window is in front — which on a browser is the page they
 * are reading, and on anything else is often a filename, a customer name or a
 * document. Nothing tested it.
 *
 * Three properties, in descending order of how much they would cost to get
 * wrong:
 *
 *   - **A capability that is off captures nothing.** Not "captures and discards"
 *     — the snapshot must be empty, because a value that exists is a value that
 *     can be logged, queued or sent by the next change to this file.
 *   - **Text is bounded.** A window title is attacker-influenced in the sense
 *     that any application can set it; an unbounded one is a way to push
 *     arbitrary bytes through the heartbeat pipeline.
 *   - **The state follows the thresholds**, including when they are inverted or
 *     absent, because that number is what attendance is computed from.
 */

/** Reach `sanitizeText`, which is `protected` and therefore meant to be reached. */
class TestableTracker extends ActivityTracker {
  sanitize(value: string | null | undefined) {
    return this.sanitizeText(value);
  }
}

const activeWin = jest.fn();
jest.mock("active-win", () => ({
  __esModule: true,
  get default() {
    return activeWin;
  },
}));

function config(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    tracking: { ...DEFAULT_CONFIG.tracking, ...(overrides.tracking ?? {}) },
    features: { ...DEFAULT_CONFIG.features, ...(overrides.features ?? {}) },
  };
}

const IDENTITY = {
  sessionId: "session-1",
  deviceId: "device-1",
  agentVersion: "1.0.0",
};

describe("ActivityTracker", () => {
  let tracker: TestableTracker;

  beforeEach(() => {
    tracker = new TestableTracker();
    (powerMonitor as unknown as { idleSeconds: number }).idleSeconds = 0;
    activeWin.mockReset();
    activeWin.mockResolvedValue({
      title: "quarterly-review.docx - Word",
      owner: { name: "Word", path: "C:/word.exe", processId: 4242 },
    });
  });

  describe("what is captured", () => {
    it("captures nothing at all when tracking is off", async () => {
      const event = await tracker.buildHeartbeat({
        ...IDENTITY,
        config: config({ tracking: { ...DEFAULT_CONFIG.tracking, enabled: false } }),
      });

      expect(event.activeApp).toBeNull();
      expect(event.windowTitle).toBeNull();
      expect(event.activeAppPath).toBeNull();
      expect(event.activeProcessId).toBeNull();
      expect(activeWin).not.toHaveBeenCalled();
    });

    it("does not read the window at all when both capabilities are off", async () => {
      // Not "reads and discards": the OS call is never made, so the title never
      // exists in this process.
      await tracker.buildHeartbeat({
        ...IDENTITY,
        config: config({
          tracking: {
            ...DEFAULT_CONFIG.tracking,
            captureActiveApp: false,
            captureWindowTitle: false,
          },
        }),
      });

      expect(activeWin).not.toHaveBeenCalled();
    });

    it("captures the app but not the title when only title capture is off", async () => {
      const event = await tracker.buildHeartbeat({
        ...IDENTITY,
        config: config({
          tracking: { ...DEFAULT_CONFIG.tracking, captureWindowTitle: false },
        }),
      });

      expect(event.activeApp).toBe("Word");
      expect(event.windowTitle).toBeNull();
    });

    it("respects the feature flag as well as the tracking flag", async () => {
      // Two switches, and either one being off is enough. The feature flag is
      // the platform's; the tracking flag is the tenant's.
      const event = await tracker.buildHeartbeat({
        ...IDENTITY,
        config: config({
          features: { ...DEFAULT_CONFIG.features, windowTitleTracking: false },
        }),
      });

      expect(event.windowTitle).toBeNull();
    });

    it("returns an empty snapshot when reading the window throws", async () => {
      activeWin.mockRejectedValue(new Error("no display"));

      const event = await tracker.buildHeartbeat({ ...IDENTITY, config: config() });

      expect(event.activeApp).toBeNull();
      expect(event.windowTitle).toBeNull();
    });
  });

  describe("browser tab titles", () => {
    it("strips the browser suffix, so the tab is the tab", async () => {
      activeWin.mockResolvedValue({
        title: "Inbox (3) - Google Chrome",
        owner: { name: "Google Chrome", path: "C:/chrome.exe", processId: 1 },
      });

      const event = await tracker.buildHeartbeat({ ...IDENTITY, config: config() });

      expect(event.browserTabTitle).toBe("Inbox (3)");
    });

    it("leaves a non-browser window without a tab title", async () => {
      const event = await tracker.buildHeartbeat({ ...IDENTITY, config: config() });
      expect(event.browserTabTitle).toBeNull();
    });

    it("does not produce a tab title when the title was not captured", async () => {
      activeWin.mockResolvedValue({
        title: "Inbox (3) - Google Chrome",
        owner: { name: "Google Chrome", path: "C:/chrome.exe", processId: 1 },
      });

      const event = await tracker.buildHeartbeat({
        ...IDENTITY,
        config: config({
          tracking: { ...DEFAULT_CONFIG.tracking, captureWindowTitle: false },
        }),
      });

      expect(event.browserTabTitle).toBeNull();
    });
  });

  describe("sanitisation", () => {
    it("bounds a title, so an application cannot push arbitrary bytes through", async () => {
      expect(tracker.sanitize("x".repeat(5000))).toHaveLength(300);
    });

    it("trims, and treats whitespace-only as absent", () => {
      expect(tracker.sanitize("  Word  ")).toBe("Word");
      expect(tracker.sanitize("   ")).toBeNull();
      expect(tracker.sanitize("")).toBeNull();
      expect(tracker.sanitize(null)).toBeNull();
      expect(tracker.sanitize(undefined)).toBeNull();
    });
  });

  describe("the state attendance is computed from", () => {
    async function stateAt(idleSeconds: number, overrides: Partial<AgentConfig["tracking"]> = {}) {
      (powerMonitor as unknown as { idleSeconds: number }).idleSeconds = idleSeconds;
      const event = await tracker.buildHeartbeat({
        ...IDENTITY,
        config: config({
          tracking: {
            ...DEFAULT_CONFIG.tracking,
            idleThresholdSeconds: 300,
            awayThresholdSeconds: 900,
            ...overrides,
          },
        }),
      });
      return event.state;
    }

    it("is ACTIVE below the idle threshold", async () => {
      expect(await stateAt(0)).toBe("ACTIVE");
      expect(await stateAt(299)).toBe("ACTIVE");
    });

    it("is IDLE at the threshold, not one second after it", async () => {
      expect(await stateAt(300)).toBe("IDLE");
    });

    it("is AWAY at the away threshold", async () => {
      expect(await stateAt(899)).toBe("IDLE");
      expect(await stateAt(900)).toBe("AWAY");
    });

    it("is AWAY when tracking is off, rather than falsely ACTIVE", async () => {
      const event = await tracker.buildHeartbeat({
        ...IDENTITY,
        config: config({ tracking: { ...DEFAULT_CONFIG.tracking, enabled: false } }),
      });
      expect(event.state).toBe("AWAY");
    });

    it("refuses an inverted threshold pair rather than guessing", async () => {
      /*
       * Away comes after idle. Asked to build a heartbeat where it does not,
       * the tracker throws rather than picking an interpretation — and that is
       * the right layer for it: `ConfigManager` already clamps anything the
       * server sends (see its spec), so reaching here inverted means the config
       * did not come from that path. Attendance is computed from this number;
       * a silent guess about it would be worse than a missing heartbeat.
       */
      await expect(
        stateAt(400, { idleThresholdSeconds: 600, awayThresholdSeconds: 60 }),
      ).rejects.toThrow(/away threshold/i);
    });

    it("bounds a nonsensical idle time from the OS", async () => {
      (powerMonitor as unknown as { idleSeconds: number }).idleSeconds = -5;
      const event = await tracker.buildHeartbeat({ ...IDENTITY, config: config() });
      expect(event.idleSeconds).toBe(0);

      (powerMonitor as unknown as { idleSeconds: number }).idleSeconds = 999_999_999;
      const capped = await tracker.buildHeartbeat({ ...IDENTITY, config: config() });
      expect(capped.idleSeconds).toBeLessThanOrEqual(24 * 60 * 60);
    });
  });

  describe("refusing to build a heartbeat nobody can attribute", () => {
    it("refuses a blank session, device or version", async () => {
      for (const missing of ["sessionId", "deviceId", "agentVersion"] as const) {
        await expect(
          tracker.buildHeartbeat({ ...IDENTITY, [missing]: "  ", config: config() }),
        ).rejects.toThrow();
      }
    });
  });
});
