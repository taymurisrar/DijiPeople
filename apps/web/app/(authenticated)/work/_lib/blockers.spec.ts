import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BLOCKED_TIME_NOTE,
  BLOCKER_CATEGORIES,
  BLOCKER_CATEGORY_LABELS,
  BLOCKER_CAUSES,
  BLOCKER_CAUSE_LABELS,
  BLOCKER_STATUSES,
  CAUSE_SUMMARY_NOTES,
  HOURS_RECONCILIATIONS,
  MAX_ESCALATION_LEVEL,
  blockerName,
  buildBlockerSummaryQuery,
  buildBlockersQuery,
  buildCausePayload,
  buildCloseBlockerPayload,
  buildEscalatePayload,
  buildRaiseBlockerPayload,
  buildUpdateBlockerPayload,
  canEscalate,
  causeLabel,
  causeTone,
  defaultBlockerPeriod,
  escalationLabel,
  formatBlockedDuration,
  hoursGapLabel,
  hoursGapTone,
  openBlockerCountLabel,
  openBlockerCounts,
  orderedCauseRows,
  reportedLabel,
} from "./blockers";

const API = path.resolve(
  __dirname,
  "../../../../../../services/api/src/modules/work-items",
);

function apiSource(file: string): string {
  return readFileSync(path.join(API, file), "utf8").replace(/\r\n/g, "\n");
}

/** The members of an `export const NAME = [ ... ] as const;` list in an API source file. */
function parseList(source: string, name: string): string[] {
  const block = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`).exec(
    source,
  );
  expect(block).not.toBeNull();
  return [...(block as RegExpExecArray)[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
}

describe("client constants stay in step with the API", () => {
  const dto = apiSource("dto/work-blocker.dto.ts");

  it("has the API's categories", () => {
    const parsed = parseList(dto, "BLOCKER_CATEGORIES");
    expect(parsed.length).toBeGreaterThan(0);
    expect([...BLOCKER_CATEGORIES]).toEqual(parsed);
  });

  it("has the API's causes", () => {
    const parsed = parseList(dto, "BLOCKER_CAUSES");
    expect(parsed.length).toBeGreaterThan(0);
    expect([...BLOCKER_CAUSES]).toEqual(parsed);
  });

  it("has the API's statuses and escalation ceiling", () => {
    const statuses = /@IsIn\(\['OPEN', 'RESOLVED', 'CANCELLED'\]\)/.exec(dto);
    expect(statuses).not.toBeNull();
    expect([...BLOCKER_STATUSES]).toEqual(["OPEN", "RESOLVED", "CANCELLED"]);
    const service = apiSource("work-blockers.service.ts");
    const max = /export const MAX_ESCALATION_LEVEL = (\d+);/.exec(service);
    expect(max).not.toBeNull();
    expect(MAX_ESCALATION_LEVEL).toBe(Number((max as RegExpExecArray)[1]));
  });

  it("has the hours reconciliations the API can return", () => {
    const service = apiSource("work-items.service.ts");
    const block = /let reconciliation:([\s\S]*?);/.exec(service);
    expect(block).not.toBeNull();
    const parsed = [...(block as RegExpExecArray)[1].matchAll(/'([A-Z_]+)'/g)].map(
      (m) => m[1],
    );
    expect(parsed.length).toBeGreaterThan(0);
    expect([...HOURS_RECONCILIATIONS].sort()).toEqual([...parsed].sort());
  });

  it("labels every category and cause", () => {
    for (const category of BLOCKER_CATEGORIES) {
      expect(BLOCKER_CATEGORY_LABELS[category]).toBeTruthy();
    }
    for (const cause of BLOCKER_CAUSES) {
      expect(BLOCKER_CAUSE_LABELS[cause]).toBeTruthy();
      expect(CAUSE_SUMMARY_NOTES[cause]).toBeTruthy();
    }
  });
});

describe("cause wording", () => {
  it("shows an undetermined cause as such, distinct from a worker-controllable one", () => {
    expect(causeLabel("UNDETERMINED")).toBe("Cause not determined");
    expect(causeLabel("WORKER_CONTROLLABLE")).toBe("Worker-controllable");
    expect(causeTone("UNDETERMINED")).not.toBe(causeTone("WORKER_CONTROLLABLE"));
    expect(causeTone("UNDETERMINED")).toBe("warning");
    expect(causeTone("WORKER_CONTROLLABLE")).toBe("danger");
  });

  it("falls back to the raw value for something unknown", () => {
    expect(causeLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});

describe("durations and counts", () => {
  it("formats blocked time", () => {
    expect(formatBlockedDuration(0)).toBe("0m");
    expect(formatBlockedDuration(200)).toBe("3h 20m");
    expect(formatBlockedDuration(1440)).toBe("1d");
    expect(formatBlockedDuration(1440 + 240)).toBe("1d 4h");
    expect(formatBlockedDuration(null)).toBe("Not known");
  });

  it("names open blockers in the singular and plural", () => {
    expect(openBlockerCountLabel(1)).toBe("1 open blocker");
    expect(openBlockerCountLabel(3)).toBe("3 open blockers");
  });

  it("counts only open blockers per work item", () => {
    expect(
      openBlockerCounts([
        { workItemId: "a", status: "OPEN" },
        { workItemId: "a", status: "OPEN" },
        { workItemId: "a", status: "RESOLVED" },
        { workItemId: "b", status: "CANCELLED" },
        { workItemId: "c", status: "OPEN" },
      ]),
    ).toEqual({ a: 2, c: 1 });
  });

  it("offers escalation only to an open blocker below the ceiling", () => {
    expect(canEscalate({ status: "OPEN", escalationLevel: 0 })).toBe(true);
    expect(canEscalate({ status: "OPEN", escalationLevel: MAX_ESCALATION_LEVEL })).toBe(false);
    expect(canEscalate({ status: "RESOLVED", escalationLevel: 0 })).toBe(false);
    expect(escalationLabel(0)).toBe("Not escalated");
    expect(escalationLabel(2)).toBe(`Escalation level 2 of ${MAX_ESCALATION_LEVEL}`);
  });

  it("shortens a long reason for a control name", () => {
    expect(blockerName({ reason: "  short  " })).toBe("short");
    const long = blockerName({ reason: "x".repeat(100) });
    expect(long).toHaveLength(60);
    expect(long.endsWith("...")).toBe(true);
  });

  it("says that blocked time is never subtracted from effort", () => {
    expect(BLOCKED_TIME_NOTE).toContain("beside effort");
    expect(BLOCKED_TIME_NOTE).toContain("never subtracted");
  });

  it("keeps every cause in the summary, absent ones as zero", () => {
    const rows = orderedCauseRows({
      byCause: [{ cause: "WORKER_CONTROLLABLE", count: 2, open: 1, minutes: 90 }],
    });
    expect(rows.map((r) => r.cause)).toEqual([...BLOCKER_CAUSES]);
    expect(rows.find((r) => r.cause === "WORKER_CONTROLLABLE")).toMatchObject({
      count: 2,
      minutes: 90,
    });
    expect(rows.find((r) => r.cause === "UNDETERMINED")).toMatchObject({
      count: 0,
      minutes: 0,
    });
  });
});

describe("request bodies", () => {
  it("builds a raise body with only what was given", () => {
    const built = buildRaiseBlockerPayload({
      category: "DECISION_NEEDED",
      reason: "  Waiting for sign-off  ",
      ownerEmployeeId: "",
      dueDate: "",
      cause: "",
    });
    expect(built).toEqual({
      ok: true,
      body: { category: "DECISION_NEEDED", reason: "Waiting for sign-off" },
    });
  });

  it("includes owner, due date and a chosen cause", () => {
    const built = buildRaiseBlockerPayload({
      category: "OTHER",
      reason: "Pump is down",
      ownerEmployeeId: "emp-1",
      dueDate: "2026-03-05",
      cause: "EXTERNAL",
    });
    expect(built).toEqual({
      ok: true,
      body: {
        category: "OTHER",
        reason: "Pump is down",
        ownerEmployeeId: "emp-1",
        dueAt: "2026-03-05T00:00:00.000Z",
        cause: "EXTERNAL",
      },
    });
  });

  it("refuses a missing category or a reason under three characters", () => {
    expect(buildRaiseBlockerPayload({ category: "", reason: "long enough" }).ok).toBe(false);
    expect(buildRaiseBlockerPayload({ category: "OTHER", reason: "ab" }).ok).toBe(false);
    expect(buildRaiseBlockerPayload({ category: "NOPE", reason: "abc" }).ok).toBe(false);
  });

  it("drops a cause the API would reject", () => {
    const built = buildRaiseBlockerPayload({
      category: "OTHER",
      reason: "abc",
      cause: "WHATEVER",
    });
    expect(built).toEqual({ ok: true, body: { category: "OTHER", reason: "abc" } });
  });

  it("builds an update with only changed fields and refuses an empty one", () => {
    expect(buildUpdateBlockerPayload({})).toMatchObject({ ok: false });
    expect(buildUpdateBlockerPayload({ ownerEmployeeId: "e1" })).toEqual({
      ok: true,
      body: { ownerEmployeeId: "e1" },
    });
    expect(buildUpdateBlockerPayload({ dueDate: "2026-04-01" })).toEqual({
      ok: true,
      body: { dueAt: "2026-04-01T00:00:00.000Z" },
    });
  });

  it("builds a cause body, with an optional trimmed note", () => {
    expect(buildCausePayload({ cause: "MANAGEMENT", note: "  budget  " })).toEqual({
      ok: true,
      body: { cause: "MANAGEMENT", note: "budget" },
    });
    expect(buildCausePayload({ cause: "UNDETERMINED" })).toEqual({
      ok: true,
      body: { cause: "UNDETERMINED" },
    });
    expect(buildCausePayload({ cause: "" })).toMatchObject({ ok: false });
  });

  it("builds an escalate body, empty when there is no note", () => {
    expect(buildEscalatePayload("   ")).toEqual({});
    expect(buildEscalatePayload(undefined)).toEqual({});
    expect(buildEscalatePayload(" now ")).toEqual({ note: "now" });
  });

  it("requires a resolution of at least three characters to close", () => {
    expect(buildCloseBlockerPayload("ab")).toMatchObject({ ok: false });
    expect(buildCloseBlockerPayload("  fixed  ")).toEqual({
      ok: true,
      body: { resolution: "fixed" },
    });
  });
});

describe("queries", () => {
  it("builds a list query and caps take at the API's maximum", () => {
    const query = new URLSearchParams(
      buildBlockersQuery({
        status: "OPEN",
        mine: true,
        overdue: true,
        projectId: "p1",
        take: 500,
        skip: 100,
      }),
    );
    expect(query.get("status")).toBe("OPEN");
    expect(query.get("mine")).toBe("true");
    expect(query.get("overdue")).toBe("true");
    expect(query.get("projectId")).toBe("p1");
    expect(query.get("take")).toBe("100");
    expect(query.get("skip")).toBe("100");
  });

  it("leaves unset filters out", () => {
    const query = new URLSearchParams(buildBlockersQuery({ status: "" }));
    expect([...query.keys()]).toEqual(["take"]);
  });

  it("sends the summary period as a half-open range", () => {
    const query = new URLSearchParams(
      buildBlockerSummaryQuery({ from: "2026-03-01", to: "2026-03-31", projectId: "p1" }),
    );
    expect(query.get("from")).toBe("2026-03-01T00:00:00.000Z");
    expect(query.get("to")).toBe("2026-04-01T00:00:00.000Z");
    expect(query.get("projectId")).toBe("p1");
  });

  it("looks back 28 days for the default summary period", () => {
    const period = defaultBlockerPeriod(new Date(2026, 2, 28));
    expect(period.to).toBe("2026-03-28");
    expect(period.from).toBe("2026-03-01");
  });
});

describe("hours reconciliation wording", () => {
  it("shows reported time beside approved time and names the gap in words", () => {
    expect(hoursGapLabel({ reconciliation: "MATCHES", differenceMinutes: 0 })).toBe(
      "Reported time matches approved timesheets",
    );
    expect(
      hoursGapLabel({ reconciliation: "REPORTED_NOT_YET_APPROVED", differenceMinutes: 90 }),
    ).toBe("Reported 1h 30m more than is approved so far (not yet approved)");
    expect(
      hoursGapLabel({ reconciliation: "APPROVED_EXCEEDS_REPORTED", differenceMinutes: -30 }),
    ).toBe("Approved timesheets exceed the reported time by 30m");
    expect(
      hoursGapLabel({ reconciliation: "NO_ACTUAL_REPORTED", differenceMinutes: null }),
    ).toBe("No actual time reported; timesheet hours exist");
    expect(hoursGapLabel({ reconciliation: "NOTHING_BOOKED", differenceMinutes: null })).toBe(
      "Nothing reported or booked",
    );
  });

  it("words every reconciliation the API can return", () => {
    for (const reconciliation of HOURS_RECONCILIATIONS) {
      expect(hoursGapLabel({ reconciliation, differenceMinutes: 10 })).not.toBe(
        "Not reconciled",
      );
      expect(hoursGapTone(reconciliation)).toBeTruthy();
    }
  });

  it("never turns an unreported actual into zero", () => {
    expect(reportedLabel(null)).toBe("Not reported");
    expect(reportedLabel(0)).toBe("0m");
    expect(reportedLabel(120)).toBe("2h");
  });
});
