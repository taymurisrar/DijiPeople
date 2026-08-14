import {
  CORRECTION_TYPE_OPTIONS,
  MAX_OVERTIME_MINUTES,
  REQUESTABLE_WORK_MODES,
  correctionStatusLabel,
  correctionTypeLabel,
  fieldsFor,
  showsField,
  validateDraft,
  type CorrectionDraft,
  type CorrectionType,
} from "./correction-form-fields";

/**
 * The correction form's rules.
 *
 * These are the ones that decide what an employee is asked for, and getting them
 * wrong is not a cosmetic problem: a field that should not appear invites data
 * the server will ignore, and a missing one produces a request a manager cannot
 * act on.
 */

const draft = (overrides: Partial<CorrectionDraft> = {}): CorrectionDraft => ({
  correctionType: "MISSED_CHECK_IN",
  attendanceDate: "2026-08-14",
  requestedCheckInAtUtc: "2026-08-14T09:00",
  reason: "The reader was down when I arrived.",
  ...overrides,
});

const ALL_TYPES: CorrectionType[] = CORRECTION_TYPE_OPTIONS.map(
  (option) => option.value,
);

describe("correction form fields", () => {
  describe("which fields a type asks for", () => {
    it("never offers HYBRID as a mode a person can request", () => {
      // HYBRID describes a whole day assembled from sessions of different modes.
      // Offering it for one work period would let someone submit a request the
      // server refuses, and learning that from a validation error is a poor way
      // to discover the concept.
      expect(REQUESTABLE_WORK_MODES).toEqual(["OFFICE", "REMOTE", "FIELD"]);
      expect(REQUESTABLE_WORK_MODES).not.toContain("HYBRID");
    });

    it("asks every type for the day and the reason", () => {
      for (const type of ALL_TYPES) {
        expect(showsField(type, "attendanceDate")).toBe(true);
        expect(showsField(type, "reason")).toBe(true);
      }
    });

    it("asks for overtime minutes only when overtime is being requested", () => {
      for (const type of ALL_TYPES) {
        expect(showsField(type, "requestedOvertimeMinutes")).toBe(
          type === "OVERTIME_APPROVAL",
        );
      }
    });

    it("does not ask for times when approving overtime", () => {
      // Approving overtime decides whether time already worked is payable. It
      // does not move when the work happened.
      expect(fieldsFor("OVERTIME_APPROVAL").sort()).toEqual(
        ["attendanceDate", "reason", "requestedOvertimeMinutes"].sort(),
      );
    });

    it("asks only for a time when a recorded time is wrong", () => {
      // Correcting a recorded arrival does not change where or how the work
      // happened, so mode and site are not asked for.
      expect(showsField("LATE_CHECK_IN", "requestedCheckInAtUtc")).toBe(true);
      expect(showsField("LATE_CHECK_IN", "requestedWorkMode")).toBe(false);
      expect(showsField("LATE_CHECK_IN", "requestedWorkSiteId")).toBe(false);
      expect(showsField("EARLY_CHECK_OUT", "requestedCheckOutAtUtc")).toBe(true);
      expect(showsField("EARLY_CHECK_OUT", "requestedWorkMode")).toBe(false);
    });

    it("asks why the device could not be used, only for the device case", () => {
      for (const type of ALL_TYPES) {
        expect(showsField(type, "fallbackReason")).toBe(
          type === "MANUAL_CORRECTION",
        );
      }
    });

    it("asks a mode-or-location correction for mode and site but no time", () => {
      expect(showsField("TIME_ADJUSTMENT", "requestedWorkMode")).toBe(true);
      expect(showsField("TIME_ADJUSTMENT", "requestedWorkSiteId")).toBe(true);
      expect(showsField("TIME_ADJUSTMENT", "requestedCheckInAtUtc")).toBe(false);
      expect(showsField("TIME_ADJUSTMENT", "requestedCheckOutAtUtc")).toBe(false);
    });
  });

  describe("validation", () => {
    it("accepts a complete request", () => {
      expect(validateDraft(draft())).toEqual([]);
    });

    it("requires a reason from every type", () => {
      for (const type of ALL_TYPES) {
        const issues = validateDraft(
          draft({ correctionType: type, reason: "   " }),
        );
        expect(issues.map((issue) => issue.field)).toContain("reason");
      }
    });

    it("requires the day the correction is about", () => {
      const issues = validateDraft(draft({ attendanceDate: "" }));
      expect(issues.map((issue) => issue.field)).toContain("attendanceDate");
    });

    it("requires at least one time when the type is about timing", () => {
      const issues = validateDraft(
        draft({ requestedCheckInAtUtc: undefined }),
      );
      expect(issues.map((issue) => issue.field)).toContain(
        "requestedCheckInAtUtc",
      );
    });

    it("does not demand a time from a mode-only correction", () => {
      const issues = validateDraft(
        draft({
          correctionType: "TIME_ADJUSTMENT",
          requestedCheckInAtUtc: undefined,
          requestedWorkMode: "REMOTE",
        }),
      );
      expect(issues).toEqual([]);
    });

    it("refuses a check-out earlier than the check-in", () => {
      const issues = validateDraft(
        draft({
          correctionType: "MANUAL_CORRECTION",
          requestedCheckInAtUtc: "2026-08-14T17:00",
          requestedCheckOutAtUtc: "2026-08-14T09:00",
          fallbackReason: "Reader was offline all day.",
        }),
      );
      expect(issues.map((issue) => issue.field)).toContain(
        "requestedCheckOutAtUtc",
      );
    });

    it("allows an overnight period, where check-out is the following morning", () => {
      // The comparison is on instants, not clock faces. A 21:00–06:00 shift is
      // ordinary in this product and must not read as reversed.
      const issues = validateDraft(
        draft({
          correctionType: "MANUAL_CORRECTION",
          requestedCheckInAtUtc: "2026-08-14T21:00",
          requestedCheckOutAtUtc: "2026-08-15T06:00",
          fallbackReason: "Reader was offline on the night shift.",
        }),
      );
      expect(issues).toEqual([]);
    });

    it("insists on knowing why the device could not be used", () => {
      const issues = validateDraft(
        draft({
          correctionType: "MANUAL_CORRECTION",
          requestedCheckInAtUtc: "2026-08-14T09:00",
        }),
      );
      expect(issues.map((issue) => issue.field)).toContain("fallbackReason");
    });

    describe("overtime minutes", () => {
      const overtime = (minutes?: string) =>
        validateDraft(
          draft({
            correctionType: "OVERTIME_APPROVAL",
            requestedCheckInAtUtc: undefined,
            requestedOvertimeMinutes: minutes,
          }),
        ).map((issue) => issue.field);

      it("requires a number", () => {
        expect(overtime(undefined)).toContain("requestedOvertimeMinutes");
        expect(overtime("not a number")).toContain("requestedOvertimeMinutes");
      });

      it("refuses zero and negatives", () => {
        expect(overtime("0")).toContain("requestedOvertimeMinutes");
        expect(overtime("-30")).toContain("requestedOvertimeMinutes");
      });

      it("refuses more than a day, which is a typo rather than overtime", () => {
        expect(overtime(String(MAX_OVERTIME_MINUTES + 1))).toContain(
          "requestedOvertimeMinutes",
        );
        expect(overtime(String(MAX_OVERTIME_MINUTES))).toEqual([]);
      });

      it("accepts an ordinary request", () => {
        expect(overtime("90")).toEqual([]);
      });
    });

    it("rejects HYBRID even if it arrives from a stale form", () => {
      const issues = validateDraft(
        draft({
          correctionType: "TIME_ADJUSTMENT",
          requestedCheckInAtUtc: undefined,
          requestedWorkMode: "HYBRID",
        }),
      );
      expect(issues.map((issue) => issue.field)).toContain("requestedWorkMode");
    });
  });

  describe("wording", () => {
    it("never shows an enum name to an employee", () => {
      for (const option of CORRECTION_TYPE_OPTIONS) {
        expect(option.label).not.toMatch(/^[A-Z_]+$/);
        expect(correctionTypeLabel(option.value)).toBe(option.label);
        expect(option.hint.length).toBeGreaterThan(0);
      }

      for (const status of [
        "PENDING_APPROVAL",
        "APPROVED",
        "REJECTED",
        "CANCELLED",
        "RETURNED",
        "DRAFT",
      ]) {
        expect(correctionStatusLabel(status)).not.toMatch(/^[A-Z_]+$/);
      }
    });
  });
});
