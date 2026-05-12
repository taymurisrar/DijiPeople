import type { DisplayableError } from "./types";

export async function downloadErrorLog(error: DisplayableError) {
  const response = await fetch(`/api/error-logs/${encodeURIComponent(error.traceId)}/download`, {
    credentials: "include",
  });

  const text = response.ok ? await response.text() : buildClientFallbackLog(error);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dijipeople-error-${sanitizeFilename(error.traceId)}.txt`;
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
    "Details:",
    safeJson(error.details),
    "",
    "Stack Trace:",
    "Stack trace is not available.",
    "",
  ].join("\n");
}

function safeJson(value: unknown) {
  if (value === undefined || value === null) return "N/A";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "N/A";
  }
}

function sanitizeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 160);
}
