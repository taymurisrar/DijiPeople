import type { DisplayableError } from "./types";

export function enrichClientError(error: DisplayableError): DisplayableError {
  if (!error.traceId.startsWith("client_")) return error;

  return {
    ...error,
    path:
      error.path ??
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    method: error.method ?? "CLIENT",
    browserInfo: error.browserInfo ?? navigator.userAgent,
  };
}

export async function persistClientError(error: DisplayableError) {
  if (!error.traceId.startsWith("client_")) return true;

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
