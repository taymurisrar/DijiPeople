import { ConfigManager, DEFAULT_CONFIG } from "./config-manager";
import type { AgentConfig } from "./types";
import type { ApiClient } from "./api-client";

/**
 * REG-213 — ITEM-0033.
 *
 * The agent takes its configuration from the server, which decides what it may
 * capture and how often. Three properties matter, and none had a test:
 *
 *   - **A partial config does not disable tracking.** The server may send two
 *     fields; the other twenty must fall back to defaults, not to `undefined`,
 *     which reads as "off" for a boolean and as `NaN` for an interval.
 *   - **Keylogging is not negotiable.** Screenshots and clipboard capture became
 *     tenant-controllable DLP capabilities in TASK-0020, but keylogging is
 *     hardcoded off. A server that asks for it — a compromised one, or a future
 *     feature nobody reviewed — is refused here, on the machine, rather than
 *     trusted. The two capabilities that *can* be enabled still default off and
 *     are only on when the server says so.
 *   - **A failed refresh keeps the last good config.** The agent runs unattended
 *     from login; an API blip must not silently change what it captures.
 */
describe("ConfigManager", () => {
  function build(response: unknown) {
    const getConfig = jest.fn().mockResolvedValue(response);
    const manager = new ConfigManager({ getConfig } as unknown as ApiClient);
    return { manager, getConfig };
  }

  describe("a partial config from the server", () => {
    it("fills every unsent field from the defaults", async () => {
      const { manager } = build({ tracking: { enabled: true } });
      const config = await manager.refresh();

      expect(config.tracking.heartbeatIntervalSeconds).toBe(
        DEFAULT_CONFIG.tracking.heartbeatIntervalSeconds,
      );
      expect(config.api.heartbeatBatchSize).toBe(
        DEFAULT_CONFIG.api.heartbeatBatchSize,
      );
      expect(config.features.trayStatus).toBe(
        DEFAULT_CONFIG.features.trayStatus,
      );
    });

    it("leaves nothing undefined", async () => {
      // The failure this guards: `undefined` is falsy, so an unsent boolean
      // silently reads as "capability off" and an unsent interval as NaN.
      const { manager } = build({});
      const config = await manager.refresh();

      const undefinedPaths: string[] = [];
      for (const [section, values] of Object.entries(config)) {
        for (const [key, value] of Object.entries(
          values as Record<string, unknown>,
        )) {
          // `updateMessage` is legitimately nullable.
          if (value === undefined) undefinedPaths.push(`${section}.${key}`);
        }
      }

      expect(undefinedPaths).toEqual([]);
    });

    it("survives an entirely empty response", async () => {
      const { manager } = build({});
      await expect(manager.refresh()).resolves.toMatchObject({
        tracking: { enabled: DEFAULT_CONFIG.tracking.enabled },
      });
    });
  });

  describe("what the server may not turn on", () => {
    it("refuses keylogging whatever the server says", async () => {
      // The one capability that stays off on the machine, not by the config
      // endpoint's grace. It records what is typed, not what is copied or read,
      // so it carries the most liability for the least protection against the
      // exfiltration threat this feature exists for (TASK-0020).
      const { manager } = build({
        privacy: {
          allowScreenshots: true,
          allowClipboardTracking: true,
          allowKeylogging: true,
        },
      });

      const config = await manager.refresh();

      expect(config.privacy.allowKeylogging).toBe(false);
    });
  });

  describe("DLP capture, which the server now controls", () => {
    it("stays off by default", async () => {
      const { manager } = build({});
      const config = await manager.refresh();

      expect(config.privacy.allowScreenshots).toBe(false);
      expect(config.privacy.allowClipboardTracking).toBe(false);
      expect(config.dlp.clipboardCaptureEnabled).toBe(false);
      expect(config.dlp.screenshotCaptureEnabled).toBe(false);
    });

    it("turns on when the tenant enabled it, and mirrors the gates into dlp", async () => {
      const { manager } = build({
        privacy: { allowScreenshots: true, allowClipboardTracking: true },
        dlp: { clipboardFullContent: true },
      });

      const config = await manager.refresh();

      expect(config.privacy.allowScreenshots).toBe(true);
      expect(config.privacy.allowClipboardTracking).toBe(true);
      // The dlp gates are derived from privacy, so the two can never disagree.
      expect(config.dlp.clipboardCaptureEnabled).toBe(true);
      expect(config.dlp.screenshotCaptureEnabled).toBe(true);
      expect(config.dlp.clipboardFullContent).toBe(true);
    });

    it("does not capture on detail alone when the privacy gate is off", async () => {
      // A payload with rules and full-content set but the master gate absent must
      // resolve to "do not capture" — detail never overrides the gate.
      const { manager } = build({
        dlp: {
          clipboardFullContent: true,
          rules: [
            {
              id: "r1",
              name: "r1",
              enabled: true,
              sourceAppPatterns: ["excel"],
              channelAppPatterns: ["whatsapp"],
              action: "OBSERVE",
            },
          ],
        },
      });

      const config = await manager.refresh();

      expect(config.dlp.clipboardCaptureEnabled).toBe(false);
      expect(config.dlp.screenshotCaptureEnabled).toBe(false);
    });

    it("drops a rule with no source or channel pattern", async () => {
      const { manager } = build({
        privacy: { allowClipboardTracking: true },
        dlp: {
          rules: [
            {
              id: "ok",
              name: "ok",
              enabled: true,
              sourceAppPatterns: ["excel"],
              channelAppPatterns: ["whatsapp"],
              action: "OBSERVE",
            },
            {
              id: "no-channel",
              name: "no-channel",
              enabled: true,
              sourceAppPatterns: ["excel"],
              channelAppPatterns: [],
              action: "OBSERVE",
            },
          ],
        },
      });

      const config = await manager.refresh();

      expect(config.dlp.rules.map((r) => r.id)).toEqual(["ok"]);
    });

    it("clamps an absurd clipboard poll interval", async () => {
      const { manager } = build({
        privacy: { allowClipboardTracking: true },
        dlp: { clipboardPollIntervalSeconds: 100000 },
      });

      const config = await manager.refresh();

      expect(config.dlp.clipboardPollIntervalSeconds).toBeLessThanOrEqual(60);
      expect(config.dlp.clipboardPollIntervalSeconds).toBeGreaterThanOrEqual(2);
    });
  });

  describe("bounds", () => {
    it("clamps an absurd heartbeat interval rather than accepting it", async () => {
      const { manager } = build({ tracking: { heartbeatIntervalSeconds: 1 } });
      const config = await manager.refresh();
      expect(config.tracking.heartbeatIntervalSeconds).toBeGreaterThanOrEqual(
        10,
      );

      const { manager: slow } = build({
        tracking: { heartbeatIntervalSeconds: 999_999 },
      });
      const slowConfig = await slow.refresh();
      expect(slowConfig.tracking.heartbeatIntervalSeconds).toBeLessThanOrEqual(
        3600,
      );
    });

    it("clamps the batch size", async () => {
      const { manager } = build({ api: { heartbeatBatchSize: 10_000 } });
      const config = await manager.refresh();
      expect(config.api.heartbeatBatchSize).toBeLessThanOrEqual(1000);
    });

    it("falls back on a non-numeric interval instead of producing NaN", async () => {
      const { manager } = build({
        tracking: { heartbeatIntervalSeconds: "soon" as unknown as number },
      });
      const config = await manager.refresh();
      expect(config.tracking.heartbeatIntervalSeconds).toBe(
        DEFAULT_CONFIG.tracking.heartbeatIntervalSeconds,
      );
    });

    it("never lets the away threshold fall below the idle threshold", async () => {
      // Away is a state you reach *after* idle. Inverted, the agent would jump
      // straight past IDLE and report AWAY for a user who stepped away for a
      // minute.
      const { manager } = build({
        tracking: { idleThresholdSeconds: 600, awayThresholdSeconds: 60 },
      });
      const config = await manager.refresh();

      expect(config.tracking.awayThresholdSeconds).toBeGreaterThanOrEqual(
        config.tracking.idleThresholdSeconds,
      );
    });
  });

  describe("when the server cannot be reached", () => {
    it("keeps the last good config rather than reverting to defaults", async () => {
      const getConfig = jest
        .fn()
        .mockResolvedValueOnce({ tracking: { heartbeatIntervalSeconds: 120 } })
        .mockRejectedValueOnce(new Error("offline"));

      const manager = new ConfigManager({ getConfig } as unknown as ApiClient);

      const first = await manager.refresh();
      expect(first.tracking.heartbeatIntervalSeconds).toBe(120);

      const second = await manager.refresh();
      expect(second.tracking.heartbeatIntervalSeconds).toBe(120);
    });

    it("does not throw, so an API blip cannot stop the agent", async () => {
      const getConfig = jest.fn().mockRejectedValue(new Error("offline"));
      const manager = new ConfigManager({ getConfig } as unknown as ApiClient);

      await expect(manager.refresh()).resolves.toBeDefined();
    });

    it("leaves lastConfigSync unset when the first refresh fails", async () => {
      // So "when did this agent last hear from us" cannot report a sync that
      // never happened.
      const getConfig = jest.fn().mockRejectedValue(new Error("offline"));
      const manager = new ConfigManager({ getConfig } as unknown as ApiClient);

      await manager.refresh();
      expect(manager.lastConfigSync).toBeNull();
    });
  });

  describe("concurrent refreshes", () => {
    it("does not issue a second request while one is in flight", async () => {
      let release!: (value: Partial<AgentConfig>) => void;
      const getConfig = jest.fn().mockReturnValue(
        new Promise((resolve) => {
          release = resolve as (value: Partial<AgentConfig>) => void;
        }),
      );

      const manager = new ConfigManager({ getConfig } as unknown as ApiClient);

      const first = manager.refresh();
      const second = manager.refresh();

      release({});
      await Promise.all([first, second]);

      expect(getConfig).toHaveBeenCalledTimes(1);
    });
  });
});
