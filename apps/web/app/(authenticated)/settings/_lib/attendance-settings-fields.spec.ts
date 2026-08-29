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
      "allowIpFallback",
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
