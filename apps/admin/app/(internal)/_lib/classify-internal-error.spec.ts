import {
  describeInternalError,
  isServerComponentPlaceholder,
} from "./classify-internal-error";

describe("describeInternalError", () => {
  it("maps a 401 to a session message, ignoring any message text", () => {
    const result = describeInternalError({ status: 401, message: "boom" });
    expect(result.title).toBe("Your session is no longer valid.");
  });

  it("maps a 403 to an access-denied message", () => {
    const result = describeInternalError({ statusCode: 403 });
    expect(result.title).toBe("You do not have access to this page.");
  });

  it("maps a 404 to a not-found message", () => {
    const result = describeInternalError({ status: 404 });
    expect(result.title).toBe(
      "The requested page or record could not be found.",
    );
  });

  it("treats any 5xx as a service outage rather than guessing the cause", () => {
    const result = describeInternalError({ status: 503 });
    expect(result.title).toBe(
      "The system could not load this page right now.",
    );
  });

  it("carries the traceId as the reference id when present", () => {
    const result = describeInternalError({
      status: 500,
      traceId: "trace-123",
    });
    expect(result.referenceId).toBe("trace-123");
  });

  it("falls back to the digest when there is no traceId", () => {
    const result = describeInternalError({ digest: "digest-456" });
    expect(result.referenceId).toBe("digest-456");
  });

  it("shows a genuine client-side error message rather than a generic one", () => {
    const result = describeInternalError({
      message: "Database constraint failed",
    });
    // humanizeErrorMessage rewrites this internal-detail message (BUG-1549).
    expect(result.description).not.toBe("Database constraint failed");
    expect(result.description.length).toBeGreaterThan(0);
  });

  it("does not surface the React server-component placeholder as the message", () => {
    const result = describeInternalError({
      message: "Minified React error #441; visit ... for the full message",
    });
    expect(result.description).not.toContain("Minified React error");
  });
});

describe("isServerComponentPlaceholder", () => {
  it("recognises the minified production form", () => {
    expect(isServerComponentPlaceholder("Minified React error #441; foo")).toBe(
      true,
    );
  });

  it("recognises the spelled-out development form", () => {
    expect(
      isServerComponentPlaceholder(
        "An error occurred in the Server Components render.",
      ),
    ).toBe(true);
  });

  it("does not misclassify an ordinary message", () => {
    expect(isServerComponentPlaceholder("Unable to load the record.")).toBe(
      false,
    );
  });
});
