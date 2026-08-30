import {
  CORRECTION_TYPE_OPTIONS,
  MAX_OVERTIME_MINUTES,
  REQUESTABLE_WORK_MODES,
  correctionChanges,
  correctionStatusLabel,
  correctionTypeLabel,
  fieldsFor,
  hasRequestedChange,
  inferCorrectionType,
  seedDraftFromEntry,
  showsField,
  toLocalDateTimeInput,
  validateDraft,
  workModeLabel,
  type AttendanceEntrySeed,
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

    it("asks a mode-or-location correction for mode, site AND the period", () => {
      // This test used to assert the opposite of its last two lines, and passed
      // while the option it described could not be submitted at all: the server
      // requires a timestamp on every type except OVERTIME_APPROVAL, so every
      // TIME_ADJUSTMENT reached the API and came back "A requested check-in or
      // check-out timestamp is required." The rule was asserted from the form's
      // side only, and the form was the side that was wrong. See BUG-2505.
      expect(showsField("TIME_ADJUSTMENT", "requestedWorkMode")).toBe(true);
      expect(showsField("TIME_ADJUSTMENT", "requestedWorkSiteId")).toBe(true);
      expect(showsField("TIME_ADJUSTMENT", "requestedCheckInAtUtc")).toBe(true);
      expect(showsField("TIME_ADJUSTMENT", "requestedCheckOutAtUtc")).toBe(true);
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

    it("demands a time from a mode correction too, because the server does", () => {
      // Inverted with the rule above. Letting this one through client-side did
      // not spare the employee the question — it moved it to a 400 they could do
      // nothing about.
      const issues = validateDraft(
        draft({
          correctionType: "TIME_ADJUSTMENT",
          requestedCheckInAtUtc: undefined,
          requestedCheckOutAtUtc: undefined,
          requestedWorkMode: "REMOTE",
        }),
      );
      expect(issues.map((issue) => issue.field)).toContain(
        "requestedCheckInAtUtc",
      );

      const withPeriod = validateDraft(
        draft({
          correctionType: "TIME_ADJUSTMENT",
          requestedCheckInAtUtc: "2026-08-14T09:00",
          requestedWorkMode: "REMOTE",
        }),
      );
      expect(withPeriod).toEqual([]);
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

describe("seeding a correction from the record being viewed", () => {
  const entry = (overrides: Partial<AttendanceEntrySeed> = {}): AttendanceEntrySeed => ({
    id: "entry-1",
    date: "2026-08-28T00:00:00.000Z",
    checkInAt: "2026-08-28T06:45:00.000Z",
    checkOutAt: "2026-08-28T15:02:00.000Z",
    attendanceMode: "OFFICE",
    officeLocationId: "loc-1",
    status: "PRESENT",
    ...overrides,
  });

  describe("toLocalDateTimeInput", () => {
    it("round-trips an instant through the input and back", () => {
      // The form converts back with `new Date(value).toISOString()`. Both
      // directions run through the viewer's own zone, so the instant must
      // survive whatever zone the suite happens to run in — which is why this
      // asserts a round trip rather than a literal string.
      const iso = "2026-08-28T06:45:00.000Z";
      const back = new Date(toLocalDateTimeInput(iso)).toISOString();
      expect(back).toBe(iso);
    });

    it("is empty for a missing or unparseable value", () => {
      expect(toLocalDateTimeInput(null)).toBe("");
      expect(toLocalDateTimeInput(undefined)).toBe("");
      expect(toLocalDateTimeInput("")).toBe("");
      expect(toLocalDateTimeInput("not a date")).toBe("");
    });
  });

  describe("inferCorrectionType", () => {
    it("offers the check-out when one was never recorded", () => {
      expect(inferCorrectionType(entry({ checkOutAt: null }))).toBe(
        "MISSED_CHECK_OUT",
      );
      expect(inferCorrectionType(entry({ status: "MISSED_CHECK_OUT" }))).toBe(
        "MISSED_CHECK_OUT",
      );
    });

    it("offers the check-in when only a check-out exists", () => {
      expect(inferCorrectionType(entry({ checkInAt: null }))).toBe(
        "MISSED_CHECK_IN",
      );
    });

    it("treats a day with no times, or one marked absent, as the day being wrong", () => {
      expect(
        inferCorrectionType(entry({ checkInAt: null, checkOutAt: null })),
      ).toBe("ABSENCE_CORRECTION");
      expect(inferCorrectionType(entry({ status: "ABSENT" }))).toBe(
        "ABSENCE_CORRECTION",
      );
    });

    it("assumes a time is wrong when both are present", () => {
      expect(inferCorrectionType(entry())).toBe("LATE_CHECK_IN");
    });
  });

  describe("seedDraftFromEntry", () => {
    it("opens showing what the record already says", () => {
      const seeded = seedDraftFromEntry(entry());
      expect(seeded.attendanceDate).toBe("2026-08-28");
      expect(new Date(seeded.requestedCheckInAtUtc!).toISOString()).toBe(
        "2026-08-28T06:45:00.000Z",
      );
      expect(new Date(seeded.requestedCheckOutAtUtc!).toISOString()).toBe(
        "2026-08-28T15:02:00.000Z",
      );
      expect(seeded.requestedWorkSiteId).toBe("loc-1");
      expect(seeded.requestedWorkMode).toBe("OFFICE");
    });

    it("leaves the reason empty, because only the employee can supply it", () => {
      expect(seedDraftFromEntry(entry()).reason).toBe("");
    });

    it("does not seed a mode the selector cannot offer", () => {
      // MACHINE and MANUAL describe how the punch arrived, not where the person
      // was. Seeding either would put a value in the selector that the selector
      // does not list and the server refuses.
      for (const mode of ["MACHINE", "MANUAL", "HYBRID"]) {
        expect(seedDraftFromEntry(entry({ attendanceMode: mode })).requestedWorkMode).toBe(
          "",
        );
      }
      for (const mode of REQUESTABLE_WORK_MODES) {
        expect(seedDraftFromEntry(entry({ attendanceMode: mode })).requestedWorkMode).toBe(
          mode,
        );
      }
    });

    it("takes the day from the record's own date, not from its check-in", () => {
      // An overnight shift checks in on one day and out on the next. The
      // correction is about the former, which is the day the record is keyed on.
      const overnight = entry({
        date: "2026-08-28T00:00:00.000Z",
        checkInAt: "2026-08-28T22:30:00.000Z",
        checkOutAt: "2026-08-29T06:30:00.000Z",
      });
      expect(seedDraftFromEntry(overnight).attendanceDate).toBe("2026-08-28");
    });

    it("produces a draft that its own validator accepts", () => {
      const seeded = seedDraftFromEntry(entry());
      // Only the reason is missing, because only the employee can write it.
      expect(validateDraft({ ...seeded, reason: "Reader was down." })).toEqual([]);
    });
  });

  describe("hasRequestedChange", () => {
    it("refuses a request that asks for exactly what the record says", () => {
      const seeded = seedDraftFromEntry(entry());
      expect(hasRequestedChange({ ...seeded, reason: "Because." }, entry())).toBe(
        false,
      );
    });

    it("sees a moved time", () => {
      // The seeded type for a day holding both times is LATE_CHECK_IN, which
      // shows the check-in only — so that is the field a change has to move.
      const seeded = seedDraftFromEntry(entry());
      expect(
        hasRequestedChange(
          { ...seeded, requestedCheckInAtUtc: "2026-08-28T08:15" },
          entry(),
        ),
      ).toBe(true);
    });

    it("sees a moved check-out on a type that shows one", () => {
      const open = entry({ checkOutAt: null });
      const seeded = seedDraftFromEntry(open);
      expect(seeded.correctionType).toBe("MISSED_CHECK_OUT");
      expect(
        hasRequestedChange(
          { ...seeded, requestedCheckOutAtUtc: "2026-08-28T19:30" },
          open,
        ),
      ).toBe(true);
    });

    it("ignores a field the chosen type does not show", () => {
      // LATE_CHECK_IN shows only the check-in. A value left behind in the
      // check-out field is never sent, so it is not a change.
      const seeded = seedDraftFromEntry(entry());
      expect(
        hasRequestedChange(
          {
            ...seeded,
            correctionType: "LATE_CHECK_IN",
            requestedCheckOutAtUtc: "2026-08-28T23:59",
          },
          entry(),
        ),
      ).toBe(false);
    });

    it("treats any positive overtime as a request, having nothing to compare against", () => {
      const seeded = seedDraftFromEntry(entry());
      const overtime = {
        ...seeded,
        correctionType: "OVERTIME_APPROVAL" as CorrectionType,
      };
      expect(hasRequestedChange({ ...overtime, requestedOvertimeMinutes: "90" }, entry())).toBe(
        true,
      );
      expect(hasRequestedChange({ ...overtime, requestedOvertimeMinutes: "0" }, entry())).toBe(
        false,
      );
    });
  });

  describe("TIME_ADJUSTMENT is submittable", () => {
    it("asks for a time, because the server requires one on every type but overtime", () => {
      // Without this the option could be chosen, filled in and submitted, and
      // the API returned "A requested check-in or check-out timestamp is
      // required" every single time. See BUG-2505.
      expect(showsField("TIME_ADJUSTMENT", "requestedCheckInAtUtc")).toBe(true);
      expect(showsField("TIME_ADJUSTMENT", "requestedCheckOutAtUtc")).toBe(true);
    });

    it("still asks what the mode and site should become", () => {
      expect(showsField("TIME_ADJUSTMENT", "requestedWorkMode")).toBe(true);
      expect(showsField("TIME_ADJUSTMENT", "requestedWorkSiteId")).toBe(true);
    });

    it("every type except overtime collects a timestamp the server will accept", () => {
      for (const option of CORRECTION_TYPE_OPTIONS) {
        if (option.value === "OVERTIME_APPROVAL") continue;
        const collectsATime =
          showsField(option.value, "requestedCheckInAtUtc") ||
          showsField(option.value, "requestedCheckOutAtUtc");
        expect(collectsATime).toBe(true);
      }
    });
  });

  describe("correctionChanges", () => {
    it("lists only what moved", () => {
      const changes = correctionChanges({
        originalCheckInAtUtc: "2026-08-28T06:45:00.000Z",
        originalCheckOutAtUtc: "2026-08-28T15:02:00.000Z",
        requestedCheckInAtUtc: "2026-08-28T06:45:00.000Z",
        requestedCheckOutAtUtc: "2026-08-28T17:30:00.000Z",
      });
      expect(changes.map((change) => change.field)).toEqual(["checkOut"]);
      expect(changes[0].from).toBe("2026-08-28T15:02:00.000Z");
      expect(changes[0].to).toBe("2026-08-28T17:30:00.000Z");
    });

    it("compares instants, not strings", () => {
      // The same moment written two ways is not a change.
      expect(
        correctionChanges({
          originalCheckInAtUtc: "2026-08-28T06:45:00.000Z",
          requestedCheckInAtUtc: "2026-08-28T06:45:00Z",
        }),
      ).toEqual([]);
    });

    it("reports a mode change against the entry, which is the only original there is", () => {
      const changes = correctionChanges({
        requestedWorkMode: "REMOTE",
        attendanceEntry: { attendanceMode: "OFFICE" },
      });
      expect(changes).toHaveLength(1);
      expect(changes[0].field).toBe("workMode");
      expect(changes[0].from).toBe("OFFICE");
      expect(changes[0].to).toBe("REMOTE");
    });

    it("says nothing about a mode that was not changed", () => {
      expect(
        correctionChanges({
          requestedWorkMode: "OFFICE",
          attendanceEntry: { attendanceMode: "OFFICE" },
        }),
      ).toEqual([]);
    });

    it("reports a site change, and overtime with no previous value", () => {
      const changes = correctionChanges({
        requestedWorkSiteId: "loc-2",
        requestedOvertimeMinutes: 90,
        attendanceEntry: { officeLocationId: "loc-1" },
      });
      expect(changes.map((change) => change.field)).toEqual([
        "workSite",
        "overtimeMinutes",
      ]);
      // The record holds no overtime at all, so striking a "0" through would
      // claim a previous value that never existed.
      expect(changes[1].from).toBeNull();
      expect(changes[1].to).toBe("90");
    });

    it("surfaces the fallback reason, which is why a manual punch was allowed", () => {
      const changes = correctionChanges({ fallbackReason: "Reader out of service" });
      expect(changes.map((change) => change.field)).toEqual(["fallbackReason"]);
    });

    it("is empty for a request that changes nothing", () => {
      expect(
        correctionChanges({
          originalCheckInAtUtc: "2026-08-28T06:45:00.000Z",
          requestedCheckInAtUtc: "2026-08-28T06:45:00.000Z",
        }),
      ).toEqual([]);
    });

    it("survives a request for a day that has no attendance entry", () => {
      // `attendanceEntryId` is nullable on purpose: a wholly missing day can
      // still be corrected, and there is then no entry to compare against.
      const changes = correctionChanges({
        requestedCheckInAtUtc: "2026-08-28T06:45:00.000Z",
        requestedCheckOutAtUtc: "2026-08-28T15:02:00.000Z",
        attendanceEntry: null,
      });
      expect(changes.map((change) => change.field)).toEqual([
        "checkIn",
        "checkOut",
      ]);
      expect(changes[0].from).toBeNull();
    });
  });

  describe("workModeLabel", () => {
    it("never shows an enum name", () => {
      for (const mode of [...REQUESTABLE_WORK_MODES, "HYBRID", "MACHINE", "MANUAL"]) {
        expect(workModeLabel(mode)).not.toMatch(/^[A-Z_]+$/);
      }
    });
  });
});
