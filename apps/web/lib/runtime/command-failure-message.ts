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
