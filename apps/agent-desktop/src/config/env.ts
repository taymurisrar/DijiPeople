const apiBaseUrl = normalizeBaseUrl(
  process.env.AGENT_API_BASE_URL ||
  process.env.DIJIPEOPLE_AGENT_API_BASE_URL ||
  process.env.DIJIPEOPLE_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "https://dijipeople.onrender.com/api",);

export const agentEnv = {
  appName: process.env.AGENT_APP_NAME || "DijiPeople Agent",

  apiBaseUrl,

  apiOrigin:
    process.env.AGENT_API_ORIGIN ||
    process.env.API_ORIGIN ||
    getOriginFromBaseUrl(apiBaseUrl),

  appVersion: process.env.AGENT_APP_VERSION || "1.0.0",

  deviceRegistrationEnabled: readBoolean(
    process.env.AGENT_DEVICE_REGISTRATION_ENABLED,
    true,
  ),

  accessTokenTtl: process.env.AGENT_ACCESS_TOKEN_TTL || "15m",

  refreshTokenTtl: process.env.AGENT_REFRESH_TOKEN_TTL || "30d",

  sessionIdleTimeoutSeconds: readNumber(
    process.env.AGENT_SESSION_IDLE_TIMEOUT_SECONDS,
    43200,
  ),

  sessionAbsoluteTimeoutSeconds: readNumber(
    process.env.AGENT_SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    2592000,
  ),

  sessionRefreshThresholdSeconds: readNumber(
    process.env.AGENT_SESSION_REFRESH_THRESHOLD_SECONDS,
    300,
  ),

  heartbeatIntervalSeconds: readNumber(
    process.env.AGENT_HEARTBEAT_INTERVAL_SECONDS,
    60,
  ),

  heartbeatBatchSize: readNumber(
    process.env.AGENT_HEARTBEAT_BATCH_SIZE,
    1000,
  ),

  offlineQueueEnabled: readBoolean(
    process.env.AGENT_OFFLINE_QUEUE_ENABLED,
    true,
  ),

  offlineQueueMaxItems: readNumber(
    process.env.AGENT_OFFLINE_QUEUE_MAX_ITEMS,
    5000,
  ),

  activeAppTrackingEnabled: readBoolean(
    process.env.AGENT_ACTIVE_APP_TRACKING_ENABLED,
    true,
  ),

  windowTitleTrackingEnabled: readBoolean(
    process.env.AGENT_WINDOW_TITLE_TRACKING_ENABLED,
    true,
  ),

  trayStatusEnabled: readBoolean(
    process.env.AGENT_TRAY_STATUS_ENABLED,
    true,
  ),

  updateUrl:
    process.env.DIJIPEOPLE_AGENT_UPDATE_URL ||
    `${apiBaseUrl}/agent/updates`,

  autoUpdateEnabled: readBoolean(
    process.env.AGENT_AUTO_UPDATE_ENABLED,
    true,
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

function getOriginFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "https://dijipeople.onrender.com";
  }
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}