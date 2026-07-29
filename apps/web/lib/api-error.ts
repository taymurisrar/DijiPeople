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
      message: input.message || catalog.message,
      description: catalog.description,
      stack: input.stack,
      details: cause ? { cause } : {},
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
    const message =
      readString(input.message) ??
      readString(nested?.message) ??
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
    details: {},
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

function withFallbacks(error: StandardApiError) {
  const catalog =
    CLIENT_ERROR_CATALOG[error.errorCode] ??
    CLIENT_ERROR_CATALOG.SYSTEM_UNEXPECTED_ERROR;
  const message = error.message || catalog.message;
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

function statusToCode(status: number) {
  if (status === 401) return "SESSION_EXPIRED";
  if (status === 403) return "ACCESS_DENIED";
  if (status === 404) return "DATABASE_RECORD_NOT_FOUND";
  if (status >= 500) return "SYSTEM_UNEXPECTED_ERROR";
  return "VALIDATION_FAILED";
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

function createClientTraceId() {
  return `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
