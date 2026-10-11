import {
  deriveSafepayIntegrationState,
  missingSafepaySettings,
  type SafepayDescription,
} from "./safepay-integration-state";

const configured: SafepayDescription = {
  enabled: true,
  configured: true,
  environment: "sandbox",
  apiKeyConfigured: true,
  secretKeyConfigured: true,
  webhookSecretConfigured: true,
};

const event = (
  processingStatus: string,
  createdAt = "2026-10-10T09:30:00.000Z",
  provider = "SAFEPAY",
) => ({ provider, eventType: "payment.succeeded", processingStatus, createdAt });

describe("deriveSafepayIntegrationState", () => {
  it("is Unknown when the providers endpoint could not be read", () => {
    expect(
      deriveSafepayIntegrationState({
        safepay: null,
        recentEvents: null,
        recentFailures: null,
      }),
    ).toMatchObject({ label: "Unknown", tone: "unknown" });
  });

  it("names missing settings by variable, never by value", () => {
    const state = deriveSafepayIntegrationState({
      safepay: {
        ...configured,
        configured: false,
        webhookSecretConfigured: false,
        environment: null,
      },
      recentEvents: [],
      recentFailures: [],
    });
    expect(state.label).toBe("Not configured");
    expect(state.tone).toBe("down");
    expect(state.detail).toContain("SAFEPAY_WEBHOOK_SECRET");
    expect(state.detail).toContain("SAFEPAY_ENVIRONMENT");
    expect(state.detail).not.toContain("SAFEPAY_API_KEY");
  });

  it("is a warning, not down, when unconfigured and routing is off", () => {
    expect(
      deriveSafepayIntegrationState({
        safepay: { ...configured, enabled: false, apiKeyConfigured: false },
        recentEvents: [],
        recentFailures: [],
      }).tone,
    ).toBe("warn");
  });

  it("reports configured-but-off without claiming health", () => {
    expect(
      deriveSafepayIntegrationState({
        safepay: { ...configured, enabled: false },
        recentEvents: [],
        recentFailures: [],
      }),
    ).toMatchObject({ label: "Configured, routing off", tone: "unknown" });
  });

  // Configuration alone is not a signal that Safepay can reach us.
  it("warns when enabled but no verified webhook has arrived", () => {
    const state = deriveSafepayIntegrationState({
      safepay: configured,
      recentEvents: [],
      recentFailures: [],
    });
    expect(state).toMatchObject({ label: "Enabled (sandbox)", tone: "warn" });
    expect(state.detail).toContain("no verified webhook received yet");
  });

  it("is ok with the last verified webhook time when the newest was processed", () => {
    const state = deriveSafepayIntegrationState({
      safepay: configured,
      recentEvents: [event("PROCESSED")],
      recentFailures: [],
    });
    expect(state.tone).toBe("ok");
    expect(state.detail).toContain("last verified webhook 2026-10-10 09:30 UTC");
  });

  it("is an Error when the newest Safepay event failed processing", () => {
    const failed = event("FAILED", "2026-10-11T08:00:00.000Z");
    const state = deriveSafepayIntegrationState({
      safepay: configured,
      recentEvents: [failed],
      recentFailures: [failed],
    });
    expect(state).toMatchObject({ label: "Error", tone: "down" });
    expect(state.detail).toContain("last processing failure 2026-10-11 08:00 UTC");
  });

  it("recovers to ok once a later event processes, keeping the old failure visible", () => {
    const state = deriveSafepayIntegrationState({
      safepay: configured,
      recentEvents: [event("PROCESSED", "2026-10-11T09:00:00.000Z")],
      recentFailures: [event("FAILED", "2026-10-11T08:00:00.000Z")],
    });
    expect(state.tone).toBe("ok");
    expect(state.detail).toContain("last processing failure");
  });

  it("ignores another provider's events", () => {
    expect(
      deriveSafepayIntegrationState({
        safepay: configured,
        recentEvents: [event("FAILED", undefined, "PAYPRO")],
        recentFailures: [],
      }).tone,
    ).toBe("warn");
  });
});

describe("missingSafepaySettings", () => {
  it("is empty for a fully configured gateway", () => {
    expect(missingSafepaySettings(configured)).toEqual([]);
  });
});
