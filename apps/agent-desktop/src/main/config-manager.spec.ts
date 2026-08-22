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
 *   - **The invasive capabilities are not negotiable.** Screenshots, clipboard
 *     and keylogging are hardcoded off. A server that asks for them — a
 *     compromised one, or a future feature nobody reviewed — is refused here,
 *     on the machine, rather than trusted.
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
      expect(config.api.heartbeatBatchSize).toBe(DEFAULT_CONFIG.api.heartbeatBatchSize);
      expect(config.features.trayStatus).toBe(DEFAULT_CONFIG.features.trayStatus);
    });

    it("leaves nothing undefined", async () => {
      // The failure this guards: `undefined` is falsy, so an unsent boolean
      // silently reads as "capability off" and an unsent interval as NaN.
      const { manager } = build({});
      const config = await manager.refresh();

      const undefinedPaths: string[] = [];
      for (const [section, values] of Object.entries(config)) {
        for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
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
    it("refuses screenshots, clipboard tracking and keylogging", async () => {
      // Hardcoded off, whatever the server says. These are the capabilities an
      // employee cannot observe and did not agree to, and the decision belongs
      // on the machine rather than to whoever can answer the config endpoint.
      const { manager } = build({
        privacy: {
          allowScreenshots: true,
          allowClipboardTracking: true,
          allowKeylogging: true,
        },
      });

      const config = await manager.refresh();

      expect(config.privacy.allowScreenshots).toBe(false);
      expect(config.privacy.allowClipboardTracking).toBe(false);
      expect(config.privacy.allowKeylogging).toBe(false);
    });
  });

  describe("bounds", () => {
    it("clamps an absurd heartbeat interval rather than accepting it", async () => {
      const { manager } = build({ tracking: { heartbeatIntervalSeconds: 1 } });
      const config = await manager.refresh();
      expect(config.tracking.heartbeatIntervalSeconds).toBeGreaterThanOrEqual(10);

      const { manager: slow } = build({
        tracking: { heartbeatIntervalSeconds: 999_999 },
      });
      const slowConfig = await slow.refresh();
      expect(slowConfig.tracking.heartbeatIntervalSeconds).toBeLessThanOrEqual(3600);
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
      const getConfig = jest
        .fn()
        .mockReturnValue(new Promise((resolve) => {
          release = resolve as (value: Partial<AgentConfig>) => void;
        }));

      const manager = new ConfigManager({ getConfig } as unknown as ApiClient);

      const first = manager.refresh();
      const second = manager.refresh();

      release({});
      await Promise.all([first, second]);

      expect(getConfig).toHaveBeenCalledTimes(1);
    });
  });
});
