export type StandardApiError = {
  success: false;
  traceId: string;
  timestamp: string;
  statusCode: number;
  errorCode: string;
  message: string;
  description: string;
  details?: unknown;
  path?: string;
  method?: string;
};

const DEFAULTS: Record<
  string,
  Pick<StandardApiError, "statusCode" | "message" | "description">
> = {
  SESSION_EXPIRED: {
    statusCode: 401,
    message: "Session expired",
    description: "Your session has expired. Please sign in again.",
  },
  AUTH_TOKEN_INVALID: {
    statusCode: 401,
    message: "Session expired",
    description: "Your session has expired. Please sign in again.",
  },
  ACCESS_DENIED: {
    statusCode: 403,
    message: "Access denied",
    description: "You do not have permission to perform this action.",
  },
  DATABASE_RECORD_NOT_FOUND: {
    statusCode: 404,
    message: "Record not found",
    description: "The requested record could not be found.",
  },
  DATABASE_TIMEOUT: {
    statusCode: 504,
    message: "Database timeout",
    description: "The database took too long to respond.",
  },
  INTEGRATION_FAILED: {
    statusCode: 502,
    message: "Integration failed",
    description: "The external integration request failed.",
  },
  INTEGRATION_TIMEOUT: {
    statusCode: 504,
    message: "Integration timeout",
    description: "The external integration took too long to respond.",
  },
  INTEGRATION_UNAVAILABLE: {
    statusCode: 503,
    message: "Integration unavailable",
    description: "The external integration is currently unavailable.",
  },
  SYSTEM_UNEXPECTED_ERROR: {
    statusCode: 500,
    message: "Unexpected error",
    description: "An unexpected system error occurred.",
  },
};

export function normalizeApiError(
  input: unknown,
  status = 500,
): StandardApiError {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    const nested =
      record.error && typeof record.error === "object"
        ? (record.error as Record<string, unknown>)
        : {};
    const errorCode =
      readString(record.errorCode) ??
      readString(record.code) ??
      readString(nested.code) ??
      statusToCode(status);
    const defaults = DEFAULTS[errorCode] ?? DEFAULTS.SYSTEM_UNEXPECTED_ERROR;
    const message =
      readString(record.message) ??
      readString(nested.message) ??
      defaults.message;
    return {
      success: false,
      traceId:
        readString(record.traceId) ??
        readString(nested.traceId) ??
        `client_${Date.now()}`,
      timestamp: readString(record.timestamp) ?? new Date().toISOString(),
      statusCode:
        typeof record.statusCode === "number" ? record.statusCode : status,
      errorCode,
      message,
      description: withoutPhantomFieldHint(
        readString(record.description) ??
          readString(nested.description) ??
          defaults.description,
        { errorCode, message, fieldErrors: record.fieldErrors },
      ),
      details: record.details ?? nested.details,
      path: readString(record.path) ?? readString(nested.path) ?? undefined,
      method:
        readString(record.method) ?? readString(nested.method) ?? undefined,
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

export function isSessionExpiredError(
  error: Pick<StandardApiError, "statusCode" | "errorCode">,
) {
  return (
    error.statusCode === 401 ||
    ["SESSION_EXPIRED", "AUTH_TOKEN_INVALID", "AUTH_UNAUTHORIZED"].includes(
      error.errorCode,
    )
  );
}

/**
 * The catalog's generic VALIDATION_FAILED description promises highlighted
 * fields. The API attaches it to every `BadRequestException`, including domain
 * refusals that name no field at all — "Action reject-partner is not available
 * for partners.", "The immutable partner application submission was not
 * found." — so the dialog told the operator to review fields that were not
 * there, under a heading that already said what was wrong.
 *
 * When the API sent a message of its own and no `fieldErrors`, that message is
 * the whole story: the misleading line is dropped and the dialog shows the
 * domain message alone. A genuine DTO rejection carries `fieldErrors` and keeps
 * the description, because there the fields really are highlighted.
 */
const GENERIC_VALIDATION_MESSAGE = "Validation failed";
const GENERIC_VALIDATION_DESCRIPTION =
  "Review the highlighted fields and submit again.";

function withoutPhantomFieldHint(
  description: string,
  context: { errorCode: string; message: string; fieldErrors: unknown },
) {
  const hasFieldErrors =
    Array.isArray(context.fieldErrors) && context.fieldErrors.length > 0;
  if (
    context.errorCode === "VALIDATION_FAILED" &&
    description === GENERIC_VALIDATION_DESCRIPTION &&
    !hasFieldErrors &&
    context.message !== GENERIC_VALIDATION_MESSAGE
  )
    return "";
  return description;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function statusToCode(status: number) {
  if (status === 401) return "SESSION_EXPIRED";
  if (status === 403) return "ACCESS_DENIED";
  if (status === 404) return "DATABASE_RECORD_NOT_FOUND";
  if (status === 502) return "INTEGRATION_FAILED";
  if (status === 503) return "INTEGRATION_UNAVAILABLE";
  if (status === 504) return "INTEGRATION_TIMEOUT";
  return status >= 500 ? "SYSTEM_UNEXPECTED_ERROR" : "VALIDATION_FAILED";
}
