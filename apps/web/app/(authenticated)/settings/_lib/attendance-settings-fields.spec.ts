import type { SettingsFieldConfig } from "@/app/components/settings";

import { attendanceSettingsSections } from "./settings-page-config";

/**
 * What the attendance settings page is allowed to offer.
 *
 * Two defects were rendered as ordinary, enabled checkboxes on this page:
 *
 * - **BUG-1978** - "Allow off-day check-in" and "Allow holiday check-in" are
 *   `AttendancePolicy` columns, not tenant-settings catalog keys. The save path
 *   rejects any key the catalog does not know, so touching either one failed
 *   the whole PATCH with "Unsupported setting key" and discarded every other
 *   unsaved change in the same submission. They belong on the attendance policy
 *   screen, which writes the columns backing them.
 * - **BUG-1979** - seven keys are mandated by platform policy (ADR-0003) and
 *   locked on write. Rendered live, they invited input the server would always
 *   refuse.
 *
 * These assert the field catalog rather than any rendered output, because the
 * catalog is the thing that was wrong.
 */

const fields: SettingsFieldConfig[] = attendanceSettingsSections.flatMap(
  (section) => section.fields,
);

/** Locked on write by `enforceCriticalAttendanceSetting` in the API. */
const MANDATED_KEYS = [
  "requireRemoteLocationCapture",
  "locationCaptureRequired",
  "locationRequiredForModes",
  "captureLocationOnCheckIn",
  "captureLocationOnCheckOut",
  "allowManualLocationException",
  "highAccuracyLocation",
  /*
   * BUG-2335. Added 2026-08-30 by owner decision, and it is a change of
   * position rather than a correction of an error: this key was asserted below
   * as "genuinely configurable", and that assertion was right about the mandate
   * and wrong about the product. `allowIpFallback` was a live, saveable
   * checkbox for a capability that does not exist —
   * `captureIpFallbackLocation` cannot succeed on any input, and
   * `captureAttendanceLocation` never calls it — so an administrator enabling
   * it was promised a fallback that could not happen, in exactly the situation
   * where they most needed one.
   *
   * Locked off rather than implemented: an IP-derived position is far weaker
   * evidence than GPS, and location capture here is a mandatory integrity
   * control. Implementing it is a product decision needing an ExecPlan.
   */
  "allowIpFallback",
];

/** `AttendancePolicy` columns with no tenant-settings catalog key. */
const POLICY_ONLY_KEYS = ["allowOffDayCheckIn", "allowHolidayCheckIn"];

describe("attendance settings fields", () => {
  it("has fields to check at all", () => {
    // An it.each over an empty array is green, and so is a flatMap over a
    // renamed export. Assert the population before asserting about it.
    expect(fields.length).toBeGreaterThan(20);
  });

  it.each(POLICY_ONLY_KEYS)(
    "does not offer attendance.%s, which this page cannot save",
    (key) => {
      expect(fields.find((field) => field.key === key)).toBeUndefined();
    },
  );

  it.each(MANDATED_KEYS)("renders attendance.%s as disabled", (key) => {
    const field = fields.find((candidate) => candidate.key === key);

    expect(field).toBeDefined();
    expect(field?.disabled || field?.readOnly).toBe(true);
  });

  it.each(MANDATED_KEYS)("says why attendance.%s cannot be changed", (key) => {
    const field = fields.find((candidate) => candidate.key === key);

    // A disabled control with no explanation reads as a bug in the page.
    expect(field?.description).toMatch(/platform policy/i);
  });

  it("leaves the genuinely configurable location settings editable", () => {
    // The mandate covers location *capture*, not every location-adjacent
    // setting. Disabling these too would be a different defect in the same
    // place.
    for (const key of [
      // `allowIpFallback` was here until BUG-2335 and is now mandated off — not
      // because the capture mandate grew, but because it configured a
      // capability that does not exist. It is listed in MANDATED_KEYS above.
      "locationTimeoutSeconds",
      "locationRetryAttempts",
      "maxAllowedAccuracyMeters",
    ]) {
      const field = fields.find((candidate) => candidate.key === key);

      expect(field).toBeDefined();
      expect(field?.disabled ?? false).toBe(false);
    }
  });
});
