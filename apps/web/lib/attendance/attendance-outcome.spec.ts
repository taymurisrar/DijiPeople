import {
  classifyAttendanceFailure,
  classifyLocationCaptureFailure,
} from "./attendance-outcome";

/**
 * The line between "the system is working and here is what to do" and "the
 * system broke".
 *
 * The defect these lock down: a device-required refusal was routed into the
 * platform's technical dialog, so an employee standing in their own office got
 * "ERROR VALIDATION_FAILED", a reference id and a "Download log" button.
 */

describe("business validation stays out of the technical error modal", () => {
  it("explains a device-required work site", () => {
    const outcome = classifyAttendanceFailure({
      statusCode: 422,
      errorCode: "WORK_SITE_REQUIRES_DEVICE",
      message:
        "You are currently within Karachi Office. Please use an attendance device to check in.",
      workSite: "Karachi Office",
    });

    expect(outcome.kind).toBe("policy");
    expect(outcome.useTechnicalErrorModal).toBe(false);
    expect(outcome.title).toBe("You're at Karachi Office");
    expect(outcome.canRetry).toBe(false);
    expect(outcome.fallbackAvailable).toBe(false);
  });

  it("offers the fallback only when the server says one exists", () => {
    const outcome = classifyAttendanceFailure({
      statusCode: 422,
      errorCode: "WORK_SITE_REQUIRES_DEVICE_FALLBACK_AVAILABLE",
      workSite: "Karachi Office",
      fallbackAvailable: true,
    });

    expect(outcome.fallbackAvailable).toBe(true);
    expect(outcome.useTechnicalErrorModal).toBe(false);
  });

  it("explains an office-only work arrangement", () => {
    const outcome = classifyAttendanceFailure({
      statusCode: 422,
      errorCode: "WORK_MODE_DISALLOWS_REMOTE",
    });

    expect(outcome.kind).toBe("policy");
    expect(outcome.message).toContain("office work only");
    expect(outcome.useTechnicalErrorModal).toBe(false);
  });

  it("explains a work site that does not accept this method", () => {
    const outcome = classifyAttendanceFailure({
      statusCode: 422,
      errorCode: "METHOD_NOT_ALLOWED",
      workSite: "Karachi Office",
      message: "Karachi Office accepts attendance only through an attendance device.",
    });

    expect(outcome.kind).toBe("policy");
    expect(outcome.useTechnicalErrorModal).toBe(false);
    expect(outcome.message).toContain("attendance device");
  });

  it("explains an open session without offering a retry", () => {
    const outcome = classifyAttendanceFailure({
      statusCode: 409,
      errorCode: "OPEN_SESSION_EXISTS",
    });

    expect(outcome.kind).toBe("policy");
    expect(outcome.canRetry).toBe(false);
    expect(outcome.useTechnicalErrorModal).toBe(false);
  });

  it("answers a bare 409 with the server's own sentence", () => {
    const outcome = classifyAttendanceFailure({
      statusCode: 409,
      message: "Already checked in today.",
    });

    expect(outcome.useTechnicalErrorModal).toBe(false);
    expect(outcome.message).toBe("Already checked in today.");
  });
});

describe("location failures", () => {
  it("states both accuracy numbers when the server sent them", () => {
    const outcome = classifyAttendanceFailure({
      statusCode: 422,
      errorCode: "ACCURACY_TOO_LOW",
      accuracyMeters: 1240,
      requiredAccuracyMeters: 100,
    });

    expect(outcome.kind).toBe("location");
    expect(outcome.useTechnicalErrorModal).toBe(false);
    expect(outcome.canRetry).toBe(true);
    expect(outcome.message).toContain("1,240 m");
    expect(outcome.message).toContain("100 m");
  });

  /* "Required: 0 m" from a missing field would be worse than saying nothing. */
  it("omits the numbers rather than printing a partial pair", () => {
    const outcome = classifyAttendanceFailure({
      statusCode: 422,
      errorCode: "ACCURACY_TOO_LOW",
      accuracyMeters: 1240,
    });

    expect(outcome.message).not.toContain("1,240 m");
    expect(outcome.message).toContain("Precise Location");
  });

  it("asks for browser permission rather than falling back to IP", () => {
    const outcome = classifyLocationCaptureFailure({
      reason: "PERMISSION_DENIED",
      message: "Location permission is required for attendance.",
    });

    expect(outcome.kind).toBe("location");
    expect(outcome.useTechnicalErrorModal).toBe(false);
    expect(outcome.title).toBe("Location access is required");
    expect(outcome.canRetry).toBe(true);
  });

  it("offers a retry on timeout", () => {
    const outcome = classifyLocationCaptureFailure({ reason: "TIMEOUT" });

    expect(outcome.kind).toBe("location");
    expect(outcome.canRetry).toBe(true);
    expect(outcome.useTechnicalErrorModal).toBe(false);
  });

  it("does not offer a retry the browser cannot satisfy", () => {
    const outcome = classifyLocationCaptureFailure({ reason: "UNSUPPORTED" });

    expect(outcome.canRetry).toBe(false);
    expect(outcome.useTechnicalErrorModal).toBe(false);
  });
});

describe("real defects still reach the technical error modal", () => {
  it("escalates a 500", () => {
    const outcome = classifyAttendanceFailure({
      statusCode: 500,
      errorCode: "SYSTEM_UNEXPECTED_ERROR",
    });

    expect(outcome.kind).toBe("unexpected");
    expect(outcome.useTechnicalErrorModal).toBe(true);
  });

  /* A server fault does not become a policy answer by carrying a familiar code. */
  it("escalates a known code returned with a server-fault status", () => {
    const outcome = classifyAttendanceFailure({
      statusCode: 500,
      errorCode: "WORK_SITE_REQUIRES_DEVICE",
    });

    expect(outcome.useTechnicalErrorModal).toBe(true);
  });

  it("escalates an unclassified code rather than guessing at a friendly message", () => {
    const outcome = classifyAttendanceFailure({
      statusCode: 422,
      errorCode: "SOMETHING_NOBODY_CLASSIFIED",
    });

    expect(outcome.kind).toBe("unexpected");
    expect(outcome.useTechnicalErrorModal).toBe(true);
  });

  it("escalates an empty payload", () => {
    expect(classifyAttendanceFailure(null).useTechnicalErrorModal).toBe(true);
  });
});
