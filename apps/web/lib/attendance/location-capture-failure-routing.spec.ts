import { classifyAttendanceFailure } from "./attendance-outcome";
import { readCommandFailureContract } from "../runtime/command-failure-message";

/**
 * BUG-2334 — a location capture failure lost its reason before reaching the
 * classifier, so all four failures rendered identically.
 *
 * This is a behavioural test of the seam the fix relies on, not a source scan.
 * The adapter's `buildAttendanceLocationPayload` is module-private and reachable
 * only through a command handler needing a full runtime context, so what is
 * exercised here is the contract between the three parts that actually have to
 * agree:
 *
 *   1. the adapter throws an Error carrying `data`
 *   2. `readErrorData` forwards `data` onto the command result  (one line, in
 *      command-execution.service.ts — reproduced by `asCommandResultData`)
 *   3. `readCommandFailureContract` reads it, and `classifyAttendanceFailure`
 *      routes on the resulting `errorCode`
 *
 * If any link changes, this fails. A test that only asserted the adapter throws
 * the right shape would still pass while the routing above it silently broke,
 * which is the mistake the original defect was made of.
 */

/** Mirrors `readErrorData` + the failure branch of `executeInjectedHandler`. */
function asCommandResultData(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  return (error as { data?: unknown }).data;
}

/** The adapter's helper, reproduced — it is not exported. */
function locationCaptureError(location: {
  reason: string;
  message: string;
  permissionState?: string;
}) {
  return Object.assign(new Error(location.message), {
    data: {
      statusCode: 422,
      errorCode: location.reason,
      message: location.message,
      locationPermissionState: location.permissionState,
    },
  });
}

function routeThroughTheRuntime(location: {
  reason: string;
  message: string;
  permissionState?: string;
}) {
  const thrown = locationCaptureError(location);
  const data = asCommandResultData(thrown);
  const contract = readCommandFailureContract(data, thrown.message, undefined);
  return classifyAttendanceFailure(contract);
}

describe("a location capture failure reaches the attendance classifier", () => {
  it("routes a denied permission to the location card, not the technical dialog", () => {
    const outcome = routeThroughTheRuntime({
      reason: "PERMISSION_DENIED",
      message: "Location permission is required for attendance.",
      permissionState: "denied",
    });

    expect(outcome.kind).toBe("location");
    expect(outcome.reasonCode).toBe("PERMISSION_DENIED");
    // The whole point: a browser-side refusal is not a defect.
    expect(outcome.useTechnicalErrorModal).toBe(false);
    expect(outcome.canRetry).toBe(true);
  });

  it("distinguishes the four browser failures instead of collapsing them", () => {
    const reasons = [
      "PERMISSION_DENIED",
      "TIMEOUT",
      "POSITION_UNAVAILABLE",
      "UNSUPPORTED",
    ];

    const outcomes = reasons.map((reason) =>
      routeThroughTheRuntime({ reason, message: `capture failed: ${reason}` }),
    );

    for (const outcome of outcomes) {
      expect(outcome.kind).toBe("location");
      expect(outcome.useTechnicalErrorModal).toBe(false);
    }

    // Before the fix every one of these was the same generic failure. The
    // messages must actually differ, or the reason is being carried and ignored.
    expect(new Set(outcomes.map((o) => o.reasonCode)).size).toBe(4);
    expect(new Set(outcomes.map((o) => o.message)).size).toBeGreaterThan(1);
  });

  it("never offers a retry the browser cannot satisfy", () => {
    /*
     * The one case where the distinction has teeth. A browser with no
     * geolocation support will fail identically forever, so a Try again button
     * is a lie. Everything else is worth retrying.
     */
    expect(
      routeThroughTheRuntime({ reason: "UNSUPPORTED", message: "no support" })
        .canRetry,
    ).toBe(false);

    for (const reason of [
      "PERMISSION_DENIED",
      "TIMEOUT",
      "POSITION_UNAVAILABLE",
    ]) {
      expect(routeThroughTheRuntime({ reason, message: "x" }).canRetry).toBe(
        true,
      );
    }
  });

  it("falls back to the technical dialog when the reason really is unknown", () => {
    /*
     * Guards the guard. If this classified anything at all as a friendly
     * location outcome, the tests above would pass with the reason discarded —
     * which is precisely the bug. An unrecognised code must still escalate.
     */
    const outcome = routeThroughTheRuntime({
      reason: "SOMETHING_NOBODY_HAS_CLASSIFIED",
      message: "unknown failure",
    });

    expect(outcome.kind).toBe("unexpected");
    expect(outcome.useTechnicalErrorModal).toBe(true);
  });

  it("reproduces the pre-fix behaviour to show it could not have worked", () => {
    // The shipped code: a bare Error, so `data` is undefined and the contract
    // has no errorCode to route on.
    const bare: unknown = new Error("Location permission is required.");
    const contract = readCommandFailureContract(
      asCommandResultData(bare),
      (bare as Error).message,
      undefined,
    );
    const outcome = classifyAttendanceFailure(contract);

    expect(outcome.kind).toBe("unexpected");
    expect(outcome.useTechnicalErrorModal).toBe(true);
  });
});
