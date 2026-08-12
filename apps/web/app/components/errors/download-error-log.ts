import type { DisplayableError } from "./types";
import { enrichClientError, persistClientError } from "./client-error-log";

export async function downloadErrorLog(error: DisplayableError) {
  const enrichedError = enrichClientError(error);
  const persisted = await persistClientError(enrichedError);
  const response = persisted
    ? await fetch(
        `/api/error-logs/${encodeURIComponent(enrichedError.traceId)}/download`,
        { credentials: "include" },
      )
    : null;

  const text = response?.ok
    ? await response.text()
    : buildClientFallbackLog(enrichedError);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dijipeople-error-${sanitizeFilename(enrichedError.traceId)}.txt`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildClientFallbackLog(error: DisplayableError) {
  return [
    "DijiPeople HRM Error Log",
    "========================",
    "",
    "Reference ID:",
    error.traceId,
    "",
    "Timestamp:",
    error.timestamp,
    "",
    "Error Code:",
    error.errorCode,
    "",
    "Status Code:",
    String(error.statusCode),
    "",
    "Message:",
    error.message,
    "",
    "Description:",
    error.description,
    "",
    "Request:",
    `${error.method ?? "CLIENT"} ${error.path ?? "N/A"}`,
    "",
    "Browser Info:",
    error.browserInfo ?? "N/A",
    "",
    "Details:",
    safeJson(error.details),
    "",
    "Stack Trace:",
    error.stack ?? "Stack trace was not captured by the browser.",
    "",
    "Component Stack:",
    error.componentStack ?? "Component stack was not provided by React.",
    "",
    "--- End of error log ---",
    "",
  ].join("\n");
}

function safeJson(value: unknown) {
  if (value === undefined || value === null) {
    return "No diagnostic details were provided.";
  }
  try {
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      return "No diagnostic details were provided.";
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return "Diagnostic details could not be serialized.";
  }
}

function sanitizeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 160);
}
