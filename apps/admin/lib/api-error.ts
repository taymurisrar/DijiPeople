export type StandardApiError = {
  success: false;
  traceId: string;
  timestamp: string;
  statusCode: number;
  errorCode: string;
  message: string;
  description: string;
  details?: unknown;
};

const DEFAULTS: Record<string, Pick<StandardApiError, "statusCode" | "message" | "description">> = {
  SESSION_EXPIRED: { statusCode: 401, message: "Session expired", description: "Your session has expired. Please sign in again." },
  AUTH_TOKEN_INVALID: { statusCode: 401, message: "Session expired", description: "Your session has expired. Please sign in again." },
  ACCESS_DENIED: { statusCode: 403, message: "Access denied", description: "You do not have permission to perform this action." },
  DATABASE_RECORD_NOT_FOUND: { statusCode: 404, message: "Record not found", description: "The requested record could not be found." },
  SYSTEM_UNEXPECTED_ERROR: { statusCode: 500, message: "Unexpected error", description: "An unexpected system error occurred." },
};

export function normalizeApiError(input: unknown, status = 500): StandardApiError {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    const nested = record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : {};
    const errorCode = readString(record.errorCode) ?? readString(record.code) ?? readString(nested.code) ?? statusToCode(status);
    const defaults = DEFAULTS[errorCode] ?? DEFAULTS.SYSTEM_UNEXPECTED_ERROR;
    return {
      success: false,
      traceId: readString(record.traceId) ?? readString(nested.traceId) ?? `client_${Date.now()}`,
      timestamp: readString(record.timestamp) ?? new Date().toISOString(),
      statusCode: typeof record.statusCode === "number" ? record.statusCode : status,
      errorCode,
      message: readString(record.message) ?? readString(nested.message) ?? defaults.message,
      description: readString(record.description) ?? readString(nested.description) ?? defaults.description,
      details: record.details ?? nested.details,
    };
  }
  const defaults = DEFAULTS.SYSTEM_UNEXPECTED_ERROR;
  return {
    success: false,
    traceId: `client_${Date.now()}`,
    timestamp: new Date().toISOString(),
    statusCode: status,
    errorCode: statusToCode(status),
    message: input instanceof Error ? input.message : defaults.message,
    description: defaults.description,
  };
}

export function apiErrorEventName() {
  return "dijipeople:api-error";
}

export function isSessionExpiredError(error: Pick<StandardApiError, "statusCode" | "errorCode">) {
  return error.statusCode === 401 || ["SESSION_EXPIRED", "AUTH_TOKEN_INVALID", "AUTH_UNAUTHORIZED"].includes(error.errorCode);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function statusToCode(status: number) {
  if (status === 401) return "SESSION_EXPIRED";
  if (status === 403) return "ACCESS_DENIED";
  if (status === 404) return "DATABASE_RECORD_NOT_FOUND";
  return status >= 500 ? "SYSTEM_UNEXPECTED_ERROR" : "VALIDATION_FAILED";
}
