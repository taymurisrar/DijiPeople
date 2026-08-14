import {
  dayStatusLabel,
  dayStatusTone,
  formatDuration,
  formatMinutesOrDash,
  formatWorkedMinutes,
  shiftDateKey,
  workModeLabel,
} from "./format";
import {
  TEAM_DAY_VIEWS,
  TEAM_DAY_VIEW_KEYS,
  isTeamDayView,
  teamDayViewDescription,
  teamDayViewLabel,
} from "./views";

/**
 * The manager review's view definitions and wording.
 *
 * The list below is duplicated deliberately: it mirrors the `@IsIn` on the API's
 * TeamDayQueryDto. If either side gains or loses a view without the other, this
 * fails — which is the cheapest available substitute for a shared enum across two
 * separately-built packages. A tab that silently returns everything because the
 * server rejected the parameter is the failure this prevents.
 */
const API_ACCEPTED_VIEWS = [
  "ALL",
  "NEEDS_REVIEW",
  "PENDING_RECONCILIATION",
  "MISSING_PUNCHES",
  "HYBRID",
  "PENDING_CORRECTIONS",
  "LOCKED",
  "LOCKED_WITH_NEW_EVIDENCE",
  "ATTENDANCE_DURING_LEAVE",
  "UNAUTHORIZED_WORK_SITE",
];

describe("team day views", () => {
  it("offers exactly the views the API accepts", () => {
    expect([...TEAM_DAY_VIEW_KEYS].sort()).toEqual([...API_ACCEPTED_VIEWS].sort());
  });

  it("gives every view a human label and an explanation", () => {
    for (const view of TEAM_DAY_VIEWS) {
      // No enum names on screen: LOCKED_WITH_NEW_EVIDENCE means something here
      // and nothing to a manager.
      expect(view.label).not.toMatch(/^[A-Z_]+$/);
      expect(view.label.length).toBeGreaterThan(2);
      expect(view.description.length).toBeGreaterThan(10);
      expect(teamDayViewLabel(view.key)).toBe(view.label);
      expect(teamDayViewDescription(view.key)).toBe(view.description);
    }
  });

  it("says plainly that finalised attendance was not changed", () => {
    // The one view where a wrong impression has a payroll consequence: a punch
    // arriving after lock is evidence, not a revision.
    expect(teamDayViewDescription("LOCKED_WITH_NEW_EVIDENCE")).toContain(
      "NOT changed",
    );
  });

  it("describes hybrid as a derived result, not a configured arrangement", () => {
    expect(teamDayViewDescription("HYBRID")).toContain("derived");
  });

  it("recognises its own keys and rejects anything else", () => {
    expect(isTeamDayView("NEEDS_REVIEW")).toBe(true);
    expect(isTeamDayView("needs_review")).toBe(false);
    expect(isTeamDayView("DROP TABLE")).toBe(false);
    expect(isTeamDayView("")).toBe(false);
  });

  it("falls back to the key rather than crashing on an unknown one", () => {
    expect(teamDayViewLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(teamDayViewDescription("SOMETHING_NEW")).toBeNull();
  });
});

describe("day wording", () => {
  it("translates every status a reconciled day can hold", () => {
    for (const status of [
      "PRESENT",
      "PARTIAL",
      "ABSENT",
      "ON_LEAVE",
      "HOLIDAY",
      "WEEKEND",
      "OFF_DAY",
      "NEEDS_REVIEW",
      "PENDING",
    ]) {
      expect(dayStatusLabel(status)).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it("describes an unrecognised status honestly instead of guessing", () => {
    // A status from a newer API must not be printed raw, and must not be
    // mistaken for a result.
    expect(dayStatusLabel("SOMETHING_ELSE")).toBe("Processing");
    expect(dayStatusTone("SOMETHING_ELSE")).toBe("muted");
  });

  it("names hybrid as a derived mode but nothing outside the known set", () => {
    expect(workModeLabel("HYBRID")).toBe("Hybrid");
    expect(workModeLabel("OFFICE")).toBe("Office");
    expect(workModeLabel(null)).toBe("—");
    expect(workModeLabel("SOMETHING")).toBe("—");
  });
});

describe("durations", () => {
  it("reads as hours and minutes", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(510)).toBe("8h 30m");
  });

  it("shows a dash rather than a zero in a dense grid", () => {
    expect(formatMinutesOrDash(0)).toBe("—");
    expect(formatMinutesOrDash(15)).toBe("15m");
  });

  it("withholds the worked total while reconciliation is outstanding", () => {
    // THE POINT OF THE FLAG. An unreconciled day may still hold minutes from a
    // previous run, and a manager approving a timesheet from them would be
    // approving a superseded figure.
    expect(formatWorkedMinutes(510, true)).toBe("—");
    expect(formatWorkedMinutes(510, false)).toBe("8h 30m");
    expect(formatWorkedMinutes(0, true)).toBe("—");
  });
});

describe("date window", () => {
  it("steps backwards across a month boundary", () => {
    expect(shiftDateKey("2026-08-14", -13)).toBe("2026-08-01");
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateKey("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("returns a malformed key untouched rather than inventing a date", () => {
    expect(shiftDateKey("not-a-date", -13)).toBe("not-a-date");
  });
});
