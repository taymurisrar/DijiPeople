import { classifyCommandFailure } from "./command-failure-classification";
import { readCommandFailureContract } from "./command-failure-message";

/*
 * Which failures are the product refusing, and which are the product breaking.
 *
 * The case that prompted this: pressing Approve on your own attendance
 * correction raised the platform's fatal-error dialog — `ERROR ACCESS_DENIED`,
 * a reference id, a timestamp and a Download log button — for a rule the
 * product had just enforced correctly. That dialog is for defects.
 *
 * The risk in the fix is the opposite mistake: a real defect shown as a calm
 * toast that nobody investigates. Most of these guard that direction.
 */

/** The envelope `HttpExceptionFilter` actually emits, as captured from production. */
function apiError(overrides: Record<string, unknown> = {}) {
  return {
    success: false,
    traceId: "req_5a7134a0-1582-4c9e-bae9-4db4cbdea936",
    timestamp: "2026-09-08T20:39:17.479Z",
    statusCode: 403,
    errorCode: "ACCESS_DENIED",
    message: "You cannot approve or reject your own attendance correction request.",
    description: "You do not have permission to perform this action.",
    path: "/api/approvals/2381aba5/approve",
    method: "POST",
    ...overrides,
  };
}

function classify(data: unknown, fallback?: string) {
  return classifyCommandFailure(readCommandFailureContract(data, fallback));
}

describe("business refusals", () => {
  it("treats the self-approval refusal as business, not a defect", () => {
    const result = classify(apiError());

    expect(result.kind).toBe("business");
    expect(result.title).toBe(
      "You cannot approve or reject your own attendance correction request.",
    );
    expect(result.errorCode).toBe("ACCESS_DENIED");
  });

  it("drops the generic description that repeats nothing useful", () => {
    // The headline already says which action and why. "You do not have
    // permission to perform this action." underneath makes it read like
    // boilerplate.
    expect(classify(apiError()).description).toBeUndefined();
  });

  it("keeps a description that adds something", () => {
    const result = classify(
      apiError({ description: "Ask your manager to action this request." }),
    );

    expect(result.description).toBe(
      "Ask your manager to action this request.",
    );
  });

  it.each([
    [400, "VALIDATION_FAILED", "Start date must be before end date."],
    [403, "ACCESS_DENIED", "You cannot approve your own request."],
    [409, "APPROVAL_ALREADY_DECIDED", "This request is already approved."],
    [422, "WORK_SITE_REQUIRES_DEVICE", "This site requires the wall reader."],
  ])("treats %i %s as business", (statusCode, errorCode, message) => {
    expect(classify(apiError({ statusCode, errorCode, message })).kind).toBe(
      "business",
    );
  });
});

describe("genuine defects still reach the technical dialog", () => {
  it.each([500, 502, 503, 504])("treats %i as unexpected", (statusCode) => {
    expect(
      classify(apiError({ statusCode, errorCode: "INTERNAL_ERROR" })).kind,
    ).toBe("unexpected");
  });

  it("leaves 401 to the dialog, which is the only place that can offer Sign in", () => {
    // A toast cannot restore a session. Re-routing this would strand the user
    // on a page whose every action fails.
    expect(
      classify(apiError({ statusCode: 401, errorCode: "AUTH_TOKEN_MISSING" }))
        .kind,
    ).toBe("unexpected");
  });

  it("leaves 404 to the dialog, because a dead route must stay loud", () => {
    expect(
      classify(apiError({ statusCode: 404, errorCode: "NOT_FOUND" })).kind,
    ).toBe("unexpected");
  });

  it("refuses to call an HTML body a business refusal", () => {
    // A proxy or WAF can answer 403 with a page. Status alone is not enough.
    const result = classify({
      statusCode: 403,
      errorCode: "ACCESS_DENIED",
      message: "<html><body>Forbidden</body></html>",
    });

    expect(result.kind).toBe("unexpected");
  });

  it("refuses when the server sent no message of its own", () => {
    // `readCommandFailureContract` fills in "Command failed"; that is the
    // reader's fallback, not something a server wrote for a person.
    expect(classify({ statusCode: 400 }).kind).toBe("unexpected");
  });

  it("refuses a multi-line body such as a stack trace", () => {
    const result = classify(
      apiError({ message: "Error: boom\n    at handler (/app/main.js:1:1)" }),
    );

    expect(result.kind).toBe("unexpected");
  });

  it("treats a network failure with no envelope as unexpected", () => {
    // No status, no code — `readCommandFailureContract` defaults to 500.
    expect(classify(null, "Failed to fetch").kind).toBe("unexpected");
  });
});
