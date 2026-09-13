import {
  resolveUserFacingMessage,
  statusToCode,
  type StandardApiError,
} from "@/lib/api-error";

/**
 * What a failed runtime command means, read out of whatever the adapter threw.
 *
 * BUG-1963 — the runtime showed the user the API's developer-facing `message`
 * with the HTTP method and endpoint appended, so a failed save on the leave
 * policy assignments dialog read
 * "leavePolicyId must be a UUID (POST /api/leave-policies/assignments)".
 *
 * The standard error contract already separates the two audiences: `message`
 * is for a developer, `description` is written for the person at the screen.
 * Everything here is about reading that contract out of the several shapes the
 * runtime's adapters wrap it in, and then letting `resolveUserFacingMessage`
 * decide which half the user reads.
 */

export type CommandFailureContract = Pick<
  StandardApiError,
  "errorCode" | "statusCode" | "message" | "description"
> & {
  readonly fieldErrors?: StandardApiError["fieldErrors"];
  readonly details: unknown;
};

export function readCommandFailureContract(
  data: unknown,
  fallbackMessage?: string | null,
  errors?: readonly string[],
): CommandFailureContract {
  const dataRecord = asRecord(data) ?? {};
  const record = asRecord(dataRecord.response) ?? dataRecord;

  const statusCode =
    numberValue(record.statusCode) ?? numberValue(record.status) ?? 500;

  const errorCode =
    stringValue(record.errorCode) ??
    stringValue(record.code) ??
    statusToCode(statusCode);

  return {
    errorCode,
    statusCode,
    message:
      stringValue(record.message) ??
      stringValue(fallbackMessage) ??
      "Command failed",
    description:
      stringValue(record.description) ??
      (errors?.length ? errors.join(" ") : null) ??
      "The requested action could not be completed.",
    fieldErrors: readFieldErrors(record),
    details: record.details ?? dataRecord,
  };
}

/**
 * An adapter's failed request, carrying the response it failed with.
 *
 * BUG-3497 — an employee account action threw `new Error(message)` on a
 * non-OK response. `executeInjectedHandler` reads `error.data` for the failure
 * contract, a bare `Error` has none, and `readCommandFailureContract` then
 * defaults the status to 500. So the API's deliberate 400 ("a password reset
 * link can only be sent to an employee with a linked user account") was shown
 * as nothing and written to the production client error log as
 * `SYSTEM_UNEXPECTED_ERROR`.
 *
 * `data.response` is the shape `readCommandFailureContract` already unwraps,
 * so the real status, `errorCode` and messages reach `classifyCommandFailure`
 * and a 4xx is answered in place while a 5xx still goes to the technical path.
 */
export class CommandRequestError extends Error {
  readonly data: { readonly response: Readonly<Record<string, unknown>> };

  constructor(
    message: string,
    data: { readonly response: Readonly<Record<string, unknown>> },
  ) {
    super(message);
    this.name = "CommandRequestError";
    this.data = data;
  }
}

export function buildCommandRequestError(
  status: number,
  payload: unknown,
): CommandRequestError {
  const body = asRecord(payload) ?? {};
  const serverMessage = Array.isArray(body.message)
    ? body.message.filter((item) => typeof item === "string").join(", ")
    : stringValue(body.message);

  /*
   * No sentence from the server means this is not the API's envelope — an
   * HTML error page from a proxy, or an empty body. "Command failed" is the
   * sentinel `classifyCommandFailure` refuses to treat as a business answer,
   * so such a failure stays loud instead of becoming a calm toast.
   */
  return new CommandRequestError(serverMessage || "Command failed", {
    response: {
      ...body,
      ...(serverMessage ? { message: serverMessage } : {}),
      status,
      statusCode: numberValue(body.statusCode) ?? status,
    },
  });
}

/** The one line a user reads when a runtime command fails. */
export function resolveCommandFailureMessage(
  data: unknown,
  fallbackMessage?: string | null,
  errors?: readonly string[],
): string {
  return resolveUserFacingMessage(
    readCommandFailureContract(data, fallbackMessage, errors),
  );
}

function readFieldErrors(record: Record<string, unknown>) {
  const details = asRecord(record.details);
  const candidate =
    record.fieldErrors ??
    record.fields ??
    details?.fieldErrors ??
    details?.fields;

  if (!Array.isArray(candidate)) return undefined;

  const entries = candidate.flatMap((item) => {
    const entry = asRecord(item);
    const field = entry ? stringValue(entry.field) : null;
    const message = entry ? stringValue(entry.message) : null;
    return field && message ? [{ field, message }] : [];
  });

  return entries.length ? entries : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
