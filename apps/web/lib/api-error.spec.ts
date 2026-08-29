import {
  normalizeApiError,
  resolveUserFacingMessage,
  sanitizeUserFacingMessage,
  statusToCode,
} from "./api-error";
import { resolveCommandFailureMessage } from "./runtime/command-failure-message";

/**
 * BUG-1955 — a 404 with no error envelope was reported to the user as
 * `DATABASE_RECORD_NOT_FOUND` with the raw HTML 404 page as its message.
 */
describe("BUG-1955 — a transport failure is not a record lookup", () => {
  it("maps a bare 404 to a routing code, not a database one", () => {
    expect(statusToCode(404)).toBe("REQUEST_ROUTE_NOT_FOUND");
    expect(statusToCode(404)).not.toBe("DATABASE_RECORD_NOT_FOUND");
  });

  it("still honours a DATABASE_RECORD_NOT_FOUND the API actually sent", () => {
    const error = normalizeApiError({
      success: false,
      statusCode: 404,
      errorCode: "DATABASE_RECORD_NOT_FOUND",
      message: "Record not found",
      description: "The requested record could not be found.",
    });

    expect(error.errorCode).toBe("DATABASE_RECORD_NOT_FOUND");
  });

  it("never renders a response body as the message", () => {
    const htmlBody =
      '<!DOCTYPE html><html lang="en"><head><title>404</title></head><body>Not found</body></html>';

    const error = normalizeApiError(
      { statusCode: 404, message: htmlBody, details: { responseText: htmlBody } },
      404,
    );

    expect(error.message).not.toContain("<!DOCTYPE");
    expect(error.message).toBe("Request could not be completed");
    expect(resolveUserFacingMessage(error)).not.toContain("<");
  });

  it("keeps the raw body in details, where the log reads it", () => {
    const htmlBody = "<html><body>gateway timeout</body></html>";
    const error = normalizeApiError(
      { statusCode: 504, message: htmlBody, details: { responseText: htmlBody } },
      504,
    );

    expect(error.details).toEqual({ responseText: htmlBody });
  });

  it("keeps the traceId support relies on", () => {
    const error = normalizeApiError({ statusCode: 502, details: {} }, 502);
    expect(typeof error.traceId).toBe("string");
    expect(error.traceId.length).toBeGreaterThan(0);
  });
});

/**
 * BUG-1963 — runtime dialogs showed the API's developer-facing `message` with
 * the HTTP method and endpoint appended.
 */
describe("BUG-1963 — no method, path or DTO property reaches the user", () => {
  it("strips a trailing method and path from a message", () => {
    expect(
      sanitizeUserFacingMessage(
        "leavePolicyId must be a UUID (POST /api/leave-policies/assignments)",
      ),
    ).toBe("leavePolicyId must be a UUID");
  });

  it("rejects a message that is really a response body", () => {
    expect(sanitizeUserFacingMessage("<!DOCTYPE html><html></html>")).toBeNull();
    expect(sanitizeUserFacingMessage("a".repeat(4000))).toBeNull();
    expect(sanitizeUserFacingMessage("   ")).toBeNull();
  });

  it("shows the contract description for a validation failure", () => {
    const message = resolveUserFacingMessage({
      errorCode: "VALIDATION_FAILED",
      statusCode: 400,
      message:
        "leavePolicyId must be a UUID, effectiveFrom must be a valid ISO 8601 date string",
      description: "Review the highlighted fields and submit again.",
    });

    expect(message).toBe("Review the highlighted fields and submit again.");
    expect(message).not.toContain("leavePolicyId");
    expect(message).not.toContain("/api/");
  });

  it("shows the contract description whenever field reasons are present", () => {
    const message = resolveUserFacingMessage({
      errorCode: "LEAVE_REQUEST_INVALID",
      statusCode: 400,
      message: "ownerId should not exist",
      description: "Review the highlighted fields and submit again.",
      fieldErrors: [{ field: "ownerId", message: "should not exist" }],
    });

    expect(message).toBe("Review the highlighted fields and submit again.");
  });

  it("keeps a domain refusal, which is the useful half", () => {
    const message = resolveUserFacingMessage({
      errorCode: "ATTENDANCE_DUPLICATE_ENTRY",
      statusCode: 409,
      message:
        "An attendance entry already exists for this employee on this date.",
      description: "The action could not be completed.",
    });

    expect(message).toBe(
      "An attendance entry already exists for this employee on this date.",
    );
  });
});

describe("resolveCommandFailureMessage", () => {
  it("reads the contract out of what the data adapter throws", () => {
    const thrown = {
      success: false,
      statusCode: 400,
      errorCode: "VALIDATION_FAILED",
      message: "leavePolicyId must be a UUID",
      description: "Review the highlighted fields and submit again.",
      path: "/api/leave-policies/assignments",
      method: "POST",
    };

    expect(resolveCommandFailureMessage(thrown, "ignored")).toBe(
      "Review the highlighted fields and submit again.",
    );
  });

  it("falls back to the command's own message when there is no contract", () => {
    expect(
      resolveCommandFailureMessage(undefined, "Owner assignment is not supported."),
    ).toBe("Owner assignment is not supported.");
  });

  it("never returns a message carrying the method and path", () => {
    expect(
      resolveCommandFailureMessage(
        undefined,
        "Request failed with 500. (POST /api/leaves)",
      ),
    ).not.toContain("/api/leaves");
  });
});
