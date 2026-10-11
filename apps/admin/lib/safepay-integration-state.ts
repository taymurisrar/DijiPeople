/**
 * The Safepay card on Monitoring > Integrations, as a pure function of what
 * the API reports, so every state can be tested without rendering the page.
 *
 * Two sources, both real signals rather than assertions:
 *
 * - `GET /super-admin/billing/payment-providers` — `PaymentGateways.describe()`:
 *   whether routing is switched on and which credentials are PRESENT. It never
 *   returns a key, and neither does anything derived here; a missing key is
 *   named by its environment variable only.
 * - `GET /super-admin/billing/provider-events` — every Safepay webhook that
 *   passed HMAC verification is recorded there, so the newest row is "the last
 *   verified webhook", and its processing status says whether DijiPeople could
 *   act on it.
 *
 * What it cannot see: a delivery REJECTED at signature verification is only
 * logged (`safepay.webhook.rejected`), never stored, so a wrong webhook secret
 * shows here as "no webhook received yet" rather than as an error.
 *
 * "Healthy" is never claimed on configuration alone. Enabled and configured
 * with no verified webhook yet is a warning, because nothing has proved the
 * secret matches Safepay's.
 */

export type SafepayDescription = {
  enabled: boolean;
  configured: boolean;
  environment: string | null;
  apiKeyConfigured: boolean;
  secretKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
};

export type ProviderEventSummary = {
  provider: string;
  eventType: string;
  processingStatus: "RECEIVED" | "PROCESSED" | "FAILED" | "IGNORED" | string;
  createdAt: string;
  processedAt?: string | null;
};

export type IntegrationTone = "ok" | "warn" | "down" | "unknown";

export type SafepayIntegrationState = {
  label: string;
  tone: IntegrationTone;
  detail: string;
};

/** The env vars `SafepayGateway.isConfigured()` requires, by name only. */
export function missingSafepaySettings(
  safepay: SafepayDescription,
): string[] {
  return [
    safepay.apiKeyConfigured ? null : "SAFEPAY_API_KEY",
    safepay.secretKeyConfigured ? null : "SAFEPAY_SECRET_KEY",
    safepay.webhookSecretConfigured ? null : "SAFEPAY_WEBHOOK_SECRET",
    safepay.environment ? null : "SAFEPAY_ENVIRONMENT",
  ].filter((value): value is string => value !== null);
}

function formatUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "an unknown time";
  // UTC and fixed-format on purpose: this renders on the server, and a
  // locale-dependent string would differ from what an operator's browser shows.
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function deriveSafepayIntegrationState(input: {
  /** Null when the providers endpoint could not be read. */
  safepay: SafepayDescription | null;
  /** Newest first, any provider; non-Safepay rows are ignored. */
  recentEvents: ProviderEventSummary[] | null;
  /** Newest first: FAILED rows only. */
  recentFailures: ProviderEventSummary[] | null;
}): SafepayIntegrationState {
  const { safepay } = input;
  if (!safepay) {
    return {
      label: "Unknown",
      tone: "unknown",
      detail: "The payment provider status could not be read.",
    };
  }

  const missing = missingSafepaySettings(safepay);
  if (missing.length > 0) {
    return {
      label: "Not configured",
      // Routing on with credentials absent refuses every PKR checkout.
      tone: safepay.enabled ? "down" : "warn",
      detail: `Missing: ${missing.join(", ")}${
        safepay.enabled ? " · routing is switched on" : ""
      }`,
    };
  }

  const environment = safepay.environment ?? "unknown";
  if (!safepay.enabled) {
    return {
      label: "Configured, routing off",
      tone: "unknown",
      detail: `${environment} credentials set · SAFEPAY_ENABLED is not "true", so PKR is not offered through Safepay`,
    };
  }

  const latest =
    input.recentEvents?.find((event) => event.provider === "SAFEPAY") ?? null;
  const lastFailure =
    input.recentFailures?.find((event) => event.provider === "SAFEPAY") ??
    null;

  const parts = [`${environment} environment`];
  if (input.recentEvents === null) {
    parts.push("webhook history could not be read");
  } else if (latest) {
    parts.push(`last verified webhook ${formatUtc(latest.createdAt)}`);
  } else {
    parts.push("no verified webhook received yet");
  }
  if (lastFailure) {
    parts.push(`last processing failure ${formatUtc(lastFailure.createdAt)}`);
  }
  const detail = parts.join(" · ");

  if (latest?.processingStatus === "FAILED") {
    return { label: "Error", tone: "down", detail };
  }
  if (!latest) {
    return { label: `Enabled (${environment})`, tone: "warn", detail };
  }
  return { label: `Enabled (${environment})`, tone: "ok", detail };
}
