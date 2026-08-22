import { NextResponse } from "next/server";
import { isApiRequestError } from "@/lib/server-api";

/**
 * Forward the API's error, instead of flattening it to a 500.
 *
 * `apps/web/AGENTS.md` requires route handlers to "forward the API's error
 * contract through rather than flattening it", and 134 `catch` blocks across
 * 123 handlers did the opposite: `{ status: 500 }`, hardcoded, with the message
 * string and nothing else. Every upstream failure — 400, 403, 404, 409, 422,
 * 429, 503 — arrived at the browser as a generic server error. ITEM-0035.
 *
 * Three things were lost each time, and each has a visible cost:
 *
 * - **The status.** A 403 renders "something went wrong" instead of the
 *   access-denied state the app already has, and a 422 looks like an outage.
 * - **`fieldErrors`.** A validation failure could not highlight the field it was
 *   about, because the shape carrying that never reached the form.
 * - **`traceId`.** A user-reported error could not be correlated with the API's
 *   error log — the one mechanism the platform has for doing that.
 *
 * `proxyApiJsonResponse` always did the right thing; the defect was in the
 * `catch` blocks around it, where a thrown `ApiRequestError` was treated as an
 * unknown crash.
 *
 * A genuine crash — a bug in the handler, a `TypeError` — still becomes a 500,
 * because that is what it is. The distinction this draws is between "the API
 * refused" and "this handler broke", which the flattened form erased.
 */
export function proxyErrorResponse(error: unknown, fallbackMessage: string) {
  if (isApiRequestError(error)) {
    return NextResponse.json(
      {
        success: false,
        message: error.message || fallbackMessage,
        // Only present when the API sent them. An `errorCode: undefined` in the
        // body is noise; an absent key is the honest representation of "the API
        // did not say".
        ...(error.errorCode ? { errorCode: error.errorCode } : {}),
        ...(error.traceId ? { traceId: error.traceId } : {}),
        ...(error.description ? { description: error.description } : {}),
        ...(error.details !== undefined ? { details: error.details } : {}),
        ...readFieldErrors(error.body),
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      success: false,
      message: error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 500 },
  );
}

/**
 * `fieldErrors` off the parsed upstream body, when it is there.
 *
 * `ApiRequestError` promotes `traceId`, `errorCode` and `description` to its own
 * properties but leaves the rest of the contract in `body`. This is the one
 * remaining field a form actually needs.
 */
function readFieldErrors(body: unknown) {
  if (!body || typeof body !== "object") return {};
  const fieldErrors = (body as { fieldErrors?: unknown }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") return {};
  return { fieldErrors };
}
