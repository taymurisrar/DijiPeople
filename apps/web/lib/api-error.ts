export type StandardApiError = {
  success: false;
  traceId: string;
  timestamp: string;
  statusCode: number;
  errorCode: string;
  message: string;
  description: string;
  path?: string;
  method?: string;
  details?: unknown;
  fieldErrors?: Array<{ field: string; message: string }>;
  stack?: string;
  componentStack?: string;
  browserInfo?: string;
  support?: {
    reference: string;
    message: string;
  };
};

export const CLIENT_ERROR_CATALOG: Record<
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
  LOCATION_PERMISSION_DENIED: {
    statusCode: 403,
    message: "Location permission denied",
    description:
      "Location permission is required for attendance. Enable location access for this site and try again.",
  },
  LOCATION_CAPTURE_REQUIRED: {
    statusCode: 422,
    message: "Location required",
    description:
      "Attendance location is required by tenant policy. Capture your location or request a manual exception if allowed.",
  },
  VALIDATION_FAILED: {
    statusCode: 400,
    message: "Validation failed",
    description: "Review the highlighted fields and submit again.",
  },
  DATABASE_RECORD_NOT_FOUND: {
    statusCode: 404,
    message: "Record not found",
    description: "The requested record could not be found.",
  },
  /*
   * BUG-1955 — a 404 carrying no error envelope is a routing or gateway
   * failure, not a record lookup. Reporting it as DATABASE_RECORD_NOT_FOUND
   * told the user the wrong thing and filed the wrong class in the client
   * error log, where it then misled whoever read it back.
   */
  REQUEST_ROUTE_NOT_FOUND: {
    statusCode: 404,
    message: "Request could not be completed",
    description:
      "The address this request was sent to does not exist. Quote the reference id if you contact support.",
  },
  NETWORK_ERROR: {
    statusCode: 503,
    message: "Network error",
    description: "The system could not reach the server.",
  },
  LOOKUP_REQUEST_FAILED: {
    statusCode: 500,
    message: "Lookup request failed",
    description: "A lookup field could not load its options.",
  },
  SYSTEM_UNEXPECTED_ERROR: {
    statusCode: 500,
    message: "Unexpected error",
    description: "An unexpected system error occurred.",
  },
};

export class AppApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly description: string;
  readonly traceId: string;
  readonly timestamp: string;
  readonly details?: unknown;
  readonly path?: string;
  readonly method?: string;

  constructor(error: StandardApiError) {
    super(error.message);
    this.name = "AppApiError";
    this.stack = error.stack ?? this.stack;
    this.statusCode = error.statusCode;
    this.errorCode = error.errorCode;
    this.description = error.description;
    this.traceId = error.traceId;
    this.timestamp = error.timestamp;
    this.details = error.details;
    this.path = error.path;
    this.method = error.method;
  }
}

export function normalizeApiError(
  input: unknown,
  fallbackStatus = 500,
): StandardApiError {
  if (isStandardApiError(input)) return withFallbacks(input);

  if (input instanceof Error) {
    const embeddedApiError = readEmbeddedApiError(input);
    if (embeddedApiError) {
      return withFallbacks(embeddedApiError);
    }

    if (isNetworkFailure(input)) {
      const catalog = CLIENT_ERROR_CATALOG.NETWORK_ERROR;

      return {
        success: false,
        traceId: createClientTraceId(),
        timestamp: new Date().toISOString(),
        statusCode: catalog.statusCode,
        errorCode: "NETWORK_ERROR",
        message: "Server unavailable",
        description: "The server could not be reached. Try again shortly.",
        stack: input.stack,
        details: { cause: input.message },
      };
    }

    const embeddedData = (input as Error & { data?: unknown }).data;
    if (isRecord(embeddedData)) {
      const embeddedStatus =
        readNumber(embeddedData.statusCode) ??
        readNumber(embeddedData.status) ??
        fallbackStatus;
      return normalizeApiError(
        {
          ...embeddedData,
          message: readString(embeddedData.message) ?? input.message,
          stack: input.stack,
          details: embeddedData.details ?? embeddedData,
        },
        embeddedStatus,
      );
    }

    const cause =
      input.cause instanceof Error
        ? {
            message: input.cause.message,
            stack: input.cause.stack,
          }
        : input.cause;
    const catalog = CLIENT_ERROR_CATALOG.SYSTEM_UNEXPECTED_ERROR;

    return {
      success: false,
      traceId: createClientTraceId(),
      timestamp: new Date().toISOString(),
      statusCode: fallbackStatus,
      errorCode: statusToCode(fallbackStatus),
      message: sanitizeUserFacingMessage(input.message) ?? catalog.message,
      description: catalog.description,
      stack: input.stack,
      details: {
        errorName: input.name || "Error",
        errorMessage: input.message || catalog.message,
        ...(cause ? { cause } : {}),
      },
    };
  }

  if (isRecord(input)) {
    const nested = isRecord(input.error) ? input.error : null;
    const statusCode =
      readNumber(input.statusCode) ??
      readNumber(input.status) ??
      readNumber(nested?.statusCode) ??
      readNumber(nested?.status) ??
      fallbackStatus;
    const errorCode =
      readString(input.errorCode) ??
      readString(input.code) ??
      readString(nested?.errorCode) ??
      readString(nested?.code) ??
      statusToCode(statusCode);
    const catalog =
      CLIENT_ERROR_CATALOG[errorCode] ??
      CLIENT_ERROR_CATALOG.SYSTEM_UNEXPECTED_ERROR;
    /*
     * BUG-1955 — an unparsed response body used to arrive here as `message`
     * and was rendered verbatim, so a gateway's HTML error page became the
     * text of a modal. The raw body stays in `details` for the log; only a
     * message that reads as a message reaches this field.
     */
    const message =
      sanitizeUserFacingMessage(readString(input.message)) ??
      sanitizeUserFacingMessage(readString(nested?.message)) ??
      catalog.message;
    const normalizationError = new Error(message);

    return {
      success: false,
      traceId:
        readString(input.traceId) ??
        readString(input.requestId) ??
        readString(nested?.traceId) ??
        createClientTraceId(),
      timestamp: readString(input.timestamp) ?? new Date().toISOString(),
      statusCode,
      errorCode,
      message,
      description:
        readString(input.description) ??
        readString(nested?.description) ??
        catalog.description,
      path: readString(input.path) ?? readString(nested?.path) ?? undefined,
      method:
        readString(input.method) ?? readString(nested?.method) ?? undefined,
      details:
        input.details ?? nested?.details ?? buildDiagnosticDetails(input),
      fieldErrors: readFieldErrors(
        input.fieldErrors ??
          nested?.fieldErrors ??
          readNestedFieldErrors(input.details) ??
          readNestedFieldErrors(nested?.details),
      ),
      stack:
        readString(input.stack) ??
        readString(nested?.stack) ??
        normalizationError.stack,
      componentStack:
        readString(input.componentStack) ??
        readString(nested?.componentStack) ??
        undefined,
      browserInfo:
        readString(input.browserInfo) ??
        readString(nested?.browserInfo) ??
        undefined,
      support: isRecord(input.support)
        ? {
            reference: readString(input.support.reference) ?? "",
            message: readString(input.support.message) ?? "",
          }
        : undefined,
    };
  }

  const catalog = CLIENT_ERROR_CATALOG.SYSTEM_UNEXPECTED_ERROR;
  const message = catalog.message;
  return {
    success: false,
    traceId: createClientTraceId(),
    timestamp: new Date().toISOString(),
    statusCode: fallbackStatus,
    errorCode: statusToCode(fallbackStatus),
    message,
    description: catalog.description,
    details: {
      inputType: typeof input,
      fallbackStatus,
      reason: "The error did not include a structured API payload.",
    },
    stack: new Error(message).stack,
  };
}

export function isSessionExpiredError(
  error: Pick<StandardApiError, "statusCode" | "errorCode">,
) {
  return (
    error.statusCode === 401 ||
    [
      "SESSION_EXPIRED",
      "SESSION_REVOKED",
      "AUTH_TOKEN_INVALID",
      "AUTH_REFRESH_TOKEN_INVALID",
      "AUTH_UNAUTHORIZED",
    ].includes(error.errorCode)
  );
}

export function apiErrorEventName() {
  return "dijipeople:api-error";
}

/**
 * Requests carrying this header opt out of the global error modal and handle
 * failures themselves. Use it for background/optional fetches: without it the
 * patched window.fetch escalates any 403 or 5xx into a blocking dialog, even
 * when the caller already degrades gracefully.
 */
export const API_ERROR_HANDLING_HEADER = "x-dijipeople-error-handling";

export const INLINE_ERROR_HANDLING_HEADERS: Readonly<Record<string, string>> = {
  [API_ERROR_HANDLING_HEADER]: "inline",
};

function withFallbacks(error: StandardApiError) {
  const catalog =
    CLIENT_ERROR_CATALOG[error.errorCode] ??
    CLIENT_ERROR_CATALOG.SYSTEM_UNEXPECTED_ERROR;
  const message = sanitizeUserFacingMessage(error.message) ?? catalog.message;
  const statusCode =
    typeof error.statusCode === "number" && Number.isFinite(error.statusCode)
      ? error.statusCode
      : catalog.statusCode;
  return {
    ...error,
    traceId:
      typeof error.traceId === "string" && error.traceId.trim()
        ? error.traceId
        : createClientTraceId(),
    timestamp:
      typeof error.timestamp === "string" && error.timestamp.trim()
        ? error.timestamp
        : new Date().toISOString(),
    statusCode,
    errorCode: error.errorCode || statusToCode(statusCode),
    message,
    description: error.description || catalog.description,
    details:
      error.details === undefined || isEmptyRecord(error.details)
        ? {
            statusCode,
            errorCode: error.errorCode || statusToCode(statusCode),
            message,
            path: error.path ?? null,
            method: error.method ?? null,
          }
        : error.details,
    stack: error.stack ?? new Error(message).stack,
  };
}

function isStandardApiError(value: unknown): value is StandardApiError {
  return (
    isRecord(value) &&
    value.success === false &&
    typeof value.errorCode === "string"
  );
}

function readEmbeddedApiError(error: Error): StandardApiError | null {
  const data = (error as Error & { data?: unknown }).data;
  if (!isRecord(data)) return null;

  for (const candidate of [data.response, data.body, data]) {
    if (isStandardApiError(candidate)) return candidate;
  }

  return null;
}

function isNetworkFailure(error: Error) {
  const message = error.message.toLowerCase();
  return (
    error.name === "TypeError" &&
    (message.includes("failed to fetch") ||
      message.includes("fetch failed") ||
      message.includes("networkerror") ||
      message.includes("load failed"))
  );
}

/**
 * The error code implied by a transport status when the response carried no
 * error envelope of its own. Exported so the runtime command handler maps a
 * status the same way rather than keeping a second copy of the table.
 */
export function statusToCode(status: number) {
  if (status === 401) return "SESSION_EXPIRED";
  if (status === 403) return "ACCESS_DENIED";
  if (status === 404) return "REQUEST_ROUTE_NOT_FOUND";
  if (status >= 500) return "SYSTEM_UNEXPECTED_ERROR";
  return "VALIDATION_FAILED";
}

/* Longer than any message the error contract produces; a body, not a message. */
const MAX_DISPLAYABLE_MESSAGE_LENGTH = 300;

/**
 * BUG-1963 / BUG-1955 — nothing the user reads may be a response body, a
 * markup document, or a message with the HTTP method and endpoint appended.
 *
 * Returns the message when it is safe to show and `null` when it is not, so
 * the caller substitutes a written string. The rejected text is never
 * discarded: callers keep it in `details` for the log and the console.
 */
export function sanitizeUserFacingMessage(
  message: string | null | undefined,
): string | null {
  if (typeof message !== "string") return null;

  // "leavePolicyId must be a UUID (POST /api/leave-policies/assignments)"
  const withoutTransportContext = message
    .replace(/\s*\((GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[^)]*\)\s*$/i, "")
    .trim();

  if (!withoutTransportContext) return null;
  if (withoutTransportContext.length > MAX_DISPLAYABLE_MESSAGE_LENGTH) {
    return null;
  }
  // An HTML or XML error page reaching the modal is BUG-1955 exactly.
  if (/^\s*<(?:!doctype|html|\?xml)/i.test(withoutTransportContext)) return null;
  if (/<\/[a-z][^>]*>/i.test(withoutTransportContext)) return null;

  return withoutTransportContext;
}

/**
 * The single line the user reads for a failure.
 *
 * BUG-1963 — the standard error contract writes `message` for a developer and
 * `description` for a customer. A validation failure's message names DTO
 * properties, so the description wins there unconditionally; every other code
 * keeps its message when the message is safe to show, because a domain refusal
 * ("An attendance entry already exists for this employee on this date.") is
 * more useful than the catalog's generic sentence.
 */
export function resolveUserFacingMessage(
  error: Pick<
    StandardApiError,
    "errorCode" | "message" | "description" | "statusCode"
  > & { fieldErrors?: StandardApiError["fieldErrors"] },
): string {
  const catalog =
    CLIENT_ERROR_CATALOG[error.errorCode] ??
    CLIENT_ERROR_CATALOG[statusToCode(error.statusCode)] ??
    CLIENT_ERROR_CATALOG.SYSTEM_UNEXPECTED_ERROR;

  const isFieldLevelFailure =
    error.errorCode === "VALIDATION_FAILED" ||
    Boolean(error.fieldErrors?.length);

  if (isFieldLevelFailure) {
    return sanitizeUserFacingMessage(error.description) ?? catalog.description;
  }

  return (
    sanitizeUserFacingMessage(error.message) ??
    sanitizeUserFacingMessage(error.description) ??
    catalog.message
  );
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readFieldErrors(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const errors = value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const field = readString(item.field);
    const message = readString(item.message);
    return field && message ? [{ field, message }] : [];
  });
  return errors.length ? errors : undefined;
}

function readNestedFieldErrors(value: unknown) {
  if (!isRecord(value)) return undefined;
  return value.fieldErrors ?? value.fields;
}

function buildDiagnosticDetails(value: Record<string, unknown>) {
  const omitted = new Set([
    "success",
    "traceId",
    "requestId",
    "timestamp",
    "status",
    "statusCode",
    "errorCode",
    "code",
    "message",
    "description",
    "path",
    "method",
    "stack",
    "componentStack",
    "browserInfo",
    "support",
    "fieldErrors",
  ]);
  const details = Object.fromEntries(
    Object.entries(value).filter(([key]) => !omitted.has(key)),
  );
  return Object.keys(details).length ? details : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmptyRecord(value: unknown) {
  return isRecord(value) && Object.keys(value).length === 0;
}

function createClientTraceId() {
  return `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
