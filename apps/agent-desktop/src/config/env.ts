export const agentEnv = {
  appName: process.env.AGENT_APP_NAME || "DijiPeople Agent",
  apiBaseUrl: normalizeBaseUrl(
    process.env.AGENT_API_BASE_URL ||
      process.env.DIJIPEOPLE_AGENT_API_BASE_URL ||
      process.env.DIJIPEOPLE_API_BASE_URL ||
      process.env.API_BASE_URL ||
      "http://localhost:4000/api",
  ),
  apiOrigin:
    process.env.AGENT_API_ORIGIN ||
    process.env.API_ORIGIN ||
    "http://localhost:4000",
  deviceRegistrationEnabled: readBoolean(
    process.env.AGENT_DEVICE_REGISTRATION_ENABLED,
    true,
  ),
  heartbeatIntervalSeconds: readNumber(
    process.env.AGENT_HEARTBEAT_INTERVAL_SECONDS,
    60,
  ),
  heartbeatBatchSize: readNumber(process.env.AGENT_HEARTBEAT_BATCH_SIZE, 1000),
  offlineQueueEnabled: readBoolean(
    process.env.AGENT_OFFLINE_QUEUE_ENABLED,
    true,
  ),
  offlineQueueMaxItems: readNumber(
    process.env.AGENT_OFFLINE_QUEUE_MAX_ITEMS,
    5000,
  ),
};

export function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  const withApi = normalized.endsWith("/api") ? normalized : `${normalized}/api`;

  try {
    const url = new URL(withApi);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Invalid protocol.");
    }

    return withApi;
  } catch {
    throw new Error(
      "Invalid agent API base URL. Set AGENT_API_BASE_URL to a valid http(s) URL.",
    );
  }
}

function readBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
