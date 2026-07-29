import type { DisplayableError } from "./types";

const errorCooldownMs = 60_000;
const errorFingerprintTimestamps = new Map<string, number>();

export function enrichClientError(error: DisplayableError): DisplayableError {
  if (!isClientTraceId(error.traceId)) return error;

  return {
    ...error,
    path:
      error.path ??
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    method: error.method ?? "CLIENT",
    browserInfo: error.browserInfo ?? navigator.userAgent,
  };
}

export function shouldReportClientError(error: DisplayableError) {
  const fingerprint = clientErrorFingerprint(error);
  const now = Date.now();
  const lastReportedAt = errorFingerprintTimestamps.get(fingerprint) ?? 0;

  if (now - lastReportedAt < errorCooldownMs) {
    return false;
  }

  errorFingerprintTimestamps.set(fingerprint, now);
  pruneErrorFingerprints(now);
  return true;
}

export async function persistClientError(error: DisplayableError) {
  if (!isClientTraceId(error.traceId)) return true;

  try {
    const response = await fetch("/api/error-logs/client", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceId: error.traceId,
        timestamp: error.timestamp,
        severity: error.statusCode >= 500 ? "ERROR" : "WARNING",
        errorCode: error.errorCode,
        statusCode: error.statusCode,
        message: error.message,
        description: error.description,
        method: error.method,
        path: error.path,
        details: error.details,
        stack: error.stack,
        componentStack: error.componentStack,
        browserInfo: error.browserInfo,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

function isClientTraceId(traceId: unknown) {
  return typeof traceId === "string" && traceId.startsWith("client_");
}

function clientErrorFingerprint(error: DisplayableError) {
  const path = normalizePath(error.path);
  const message =
    error.errorCode === "NETWORK_ERROR" ||
    error.message.toLowerCase().includes("failed to fetch") ||
    error.message.toLowerCase().includes("request failed")
      ? "server-unavailable"
      : error.message;

  return [
    error.errorCode,
    error.statusCode,
    error.method ?? "CLIENT",
    path,
    message,
  ].join("|");
}

function normalizePath(path?: string | null) {
  if (!path) return "";

  return path.split("?")[0]?.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "/:id",
  ) ?? "";
}

function pruneErrorFingerprints(now: number) {
  for (const [fingerprint, timestamp] of errorFingerprintTimestamps) {
    if (now - timestamp > errorCooldownMs * 5) {
      errorFingerprintTimestamps.delete(fingerprint);
    }
  }
}
