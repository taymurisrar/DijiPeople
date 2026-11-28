import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DECISION_STATUSES,
  MEETING_STATUSES,
  agendaLocked,
  attendeeSummary,
  buildActionPayload,
  buildAttendancePayload,
  buildCancelPayload,
  buildCreateDecisionPayload,
  buildCreateMeetingPayload,
  buildDecisionsQuery,
  buildHoldPayload,
  buildMeetingsQuery,
  buildOpenActionsQuery,
  buildReversePayload,
  buildSupersedePayload,
  buildUpdateMeetingPayload,
  canAddAction,
  canConfirm,
  canEditMeeting,
  canHoldOrCancel,
  canRecordAttendance,
  canRecordDecision,
  canReverse,
  canSupersede,
  chainEntries,
  decisionTone,
  describePage,
  hasChain,
  isHiddenStep,
  reversalNote,
  toLocalMoment,
  validateAction,
  validateDecisionInput,
  validateMeeting,
  validateReason,
  validateSupersede,
  validateTitle,
  type Decision,
  type DecisionDetail,
} from "./decisions";

const API = path.resolve(
  __dirname,
  "../../../../../../services/api/src/modules/work-items",
);

function apiSource(file: string): string {
  return readFileSync(path.join(API, file), "utf8").replace(/\r\n/g, "\n");
}

function parseConst(source: string, name: string): string[] {
  const block = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(source);
  expect(block).not.toBeNull();
  return [...(block as RegExpExecArray)[1].matchAll(/'([A-Z_]+)'/g)].map(
    (m) => m[1],
  );
}

function decision(over: Partial<Decision> = {}): Decision {
  return {
    id: "d1",
    title: "Adopt vendor",
    context: null,
    decision: "Go with vendor A",
    status: "DECIDED",
    ownerEmployeeId: "e1",
    decidedAt: "2027-01-01T10:00:00.000Z",
    meetingId: null,
    workItemId: null,
    blockerId: null,
    projectId: null,
    supersedesId: null,
    reversedReason: null,
    reversedAt: null,
    ...over,
  };
}

describe("client constants stay in step with the API", () => {
  const dto = apiSource("dto/work-decision.dto.ts");

  it("has the API's meeting statuses", () => {
    expect([...MEETING_STATUSES]).toEqual(parseConst(dto, "MEETING_STATUSES"));
  });

  it("has the API's decision statuses", () => {
    expect([...DECISION_STATUSES]).toEqual(
      parseConst(dto, "DECISION_STATUSES"),
    );
  });
});

describe("what each status offers", () => {
  it("holds or cancels only a planned meeting", () => {
    expect(canHoldOrCancel({ status: "PLANNED" })).toBe(true);
    expect(canHoldOrCancel({ status: "HELD" })).toBe(false);
    expect(canHoldOrCancel({ status: "CANCELLED" })).toBe(false);
  });

  it("locks a held meeting's agenda and freezes a cancelled one", () => {
    expect(agendaLocked({ status: "HELD" })).toBe(true);
    expect(agendaLocked({ status: "PLANNED" })).toBe(false);
    expect(canEditMeeting({ status: "CANCELLED" })).toBe(false);
    expect(canEditMeeting({ status: "HELD" })).toBe(true);
  });

  it("records attendance only once held, and decisions unless cancelled", () => {
    expect(canRecordAttendance({ status: "HELD" })).toBe(true);
    expect(canRecordAttendance({ status: "PLANNED" })).toBe(false);
    expect(canRecordDecision({ status: "CANCELLED" })).toBe(false);
    expect(canRecordDecision({ status: "PLANNED" })).toBe(true);
  });

  it("confirms a proposal and supersedes, reverses or adds actions to a decided decision only", () => {
    expect(canConfirm({ status: "PROPOSED" })).toBe(true);
    expect(canConfirm({ status: "DECIDED" })).toBe(false);
    for (const check of [canSupersede, canReverse, canAddAction]) {
      expect(check({ status: "DECIDED" })).toBe(true);
      for (const status of ["PROPOSED", "SUPERSEDED", "REVERSED"] as const) {
        expect(check({ status })).toBe(false);
      }
    }
  });

  it("tones every status", () => {
    expect(decisionTone("DECIDED")).toBe("good");
    expect(decisionTone("REVERSED")).toBe("danger");
    expect(decisionTone("SUPERSEDED")).toBe("muted");
    expect(decisionTone("PROPOSED")).toBe("info");
  });
});

describe("the decision chain", () => {
  const detail = (over: Partial<DecisionDetail> = {}): DecisionDetail => ({
    ...decision({ id: "mid", title: "Mid" }),
    meeting: null,
    actions: [],
    previous: [],
    next: [],
    ...over,
  });

  it("lists oldest first with the current decision marked", () => {
    const entries = chainEntries(
      detail({
        previous: [
          decision({ id: "p1", title: "Near" }),
          decision({ id: "p2", title: "Origin" }),
        ],
        next: [decision({ id: "n1", title: "Later" })],
      }),
    );
    expect(
      entries.map((e) =>
        e.kind === "decision"
          ? `${e.decision.id}${e.current ? "*" : ""}`
          : "hidden",
      ),
    ).toEqual(["p2", "p1", "mid*", "n1"]);
  });

  it("keeps a step the caller cannot see in place as hidden", () => {
    const entries = chainEntries(
      detail({
        previous: [{ id: null, link: "HIDDEN_LINK" }, decision({ id: "p2" })],
        next: [{ id: null, link: "HIDDEN_LINK" }],
      }),
    );
    expect(entries.map((e) => e.kind)).toEqual([
      "decision",
      "hidden",
      "decision",
      "hidden",
    ]);
    expect(isHiddenStep({ id: null, link: "HIDDEN_LINK" })).toBe(true);
  });

  it("has a chain only when something comes before or after", () => {
    expect(hasChain(detail())).toBe(false);
    expect(hasChain(detail({ next: [decision({ id: "n" })] }))).toBe(true);
  });

  it("shows a reversal reason only for a reversed decision, as stored", () => {
    expect(
      reversalNote(
        decision({ status: "REVERSED", reversedReason: "Vendor withdrew" }),
      ),
    ).toBe("Vendor withdrew");
    expect(
      reversalNote(decision({ status: "DECIDED", reversedReason: "stale" })),
    ).toBeNull();
  });
});

describe("validation", () => {
  it("bounds titles", () => {
    expect(validateTitle("a")).not.toBeNull();
    expect(validateTitle("ab")).toBeNull();
    expect(validateTitle("x".repeat(201))).not.toBeNull();
  });

  it("needs a title, a time, and bounded text for a meeting", () => {
    const ok = {
      title: "Weekly",
      agenda: "",
      scheduledAt: "2027-01-05T09:00",
      attendeeIds: [] as string[],
    };
    expect(validateMeeting(ok)).toBeNull();
    expect(validateMeeting({ ...ok, title: "" })).not.toBeNull();
    expect(validateMeeting({ ...ok, scheduledAt: "" })).not.toBeNull();
    expect(validateMeeting({ ...ok, agenda: "x".repeat(5001) })).not.toBeNull();
    expect(
      validateMeeting({
        ...ok,
        attendeeIds: Array.from({ length: 101 }, (_, i) => String(i)),
      }),
    ).not.toBeNull();
  });

  it("needs a decision text and bounded context", () => {
    expect(
      validateDecisionInput({ title: "Adopt", decision: "", context: "" }),
    ).not.toBeNull();
    expect(
      validateDecisionInput({ title: "Adopt", decision: "Yes", context: "" }),
    ).toBeNull();
    expect(
      validateDecisionInput({
        title: "Adopt",
        decision: "Yes",
        context: "x".repeat(5001),
      }),
    ).not.toBeNull();
    expect(validateSupersede({ decision: " " })).not.toBeNull();
    expect(validateSupersede({ decision: "New" })).toBeNull();
  });

  it("requires a reversal reason of at least three characters", () => {
    expect(validateReason("  ")).not.toBeNull();
    expect(validateReason("no")).not.toBeNull();
    expect(validateReason("Vendor withdrew")).toBeNull();
    expect(validateReason("x".repeat(1001))).not.toBeNull();
  });

  it("needs an action title, an owner and a due time", () => {
    const ok = {
      title: "Sign",
      ownerEmployeeId: "e1",
      dueAt: "2027-01-09T12:00",
    };
    expect(validateAction(ok)).toBeNull();
    expect(validateAction({ ...ok, title: " " })).not.toBeNull();
    expect(validateAction({ ...ok, ownerEmployeeId: "" })).not.toBeNull();
    expect(validateAction({ ...ok, dueAt: "" })).not.toBeNull();
  });
});

describe("request bodies", () => {
  it("creates a meeting with only what was given", () => {
    const body = buildCreateMeetingPayload({
      title: " Weekly ",
      agenda: "  ",
      scheduledAt: "2027-01-05T09:00",
      facilitatorEmployeeId: "",
      attendeeIds: ["a", "a", "b"],
      projectId: "",
      workItemId: "w1",
    });
    expect(body).toEqual({
      title: "Weekly",
      scheduledAt: new Date("2027-01-05T09:00").toISOString(),
      attendeeEmployeeIds: ["a", "b"],
      workItemId: "w1",
    });
  });

  it("sends only notes for a held meeting, and the plan for a planned one", () => {
    const input = {
      title: "T",
      agenda: "A",
      scheduledAt: "2027-01-05T09:00",
      facilitatorEmployeeId: "f1",
      attendeeIds: ["a"],
      notes: "N",
    };
    expect(buildUpdateMeetingPayload({ status: "HELD" }, input)).toEqual({
      notes: "N",
    });
    const planned = buildUpdateMeetingPayload({ status: "PLANNED" }, input);
    expect(planned).toMatchObject({
      title: "T",
      agenda: "A",
      facilitatorEmployeeId: "f1",
    });
    expect(planned).not.toHaveProperty("notes");
  });

  it("holds with optional notes and cancels with an optional reason", () => {
    expect(buildHoldPayload("  ")).toEqual({});
    expect(buildHoldPayload("Notes")).toEqual({ notes: "Notes" });
    expect(buildCancelPayload(" ")).toEqual({});
    expect(buildCancelPayload(" Clash ")).toEqual({ reason: "Clash" });
  });

  it("writes attendance for everyone invited", () => {
    expect(
      buildAttendancePayload(
        [
          { employeeId: "a", attended: false },
          { employeeId: "b", attended: false },
        ],
        new Set(["b"]),
      ),
    ).toEqual({
      entries: [
        { employeeId: "a", attended: false },
        { employeeId: "b", attended: true },
      ],
    });
  });

  it("records a decision without empty links", () => {
    expect(
      buildCreateDecisionPayload({
        title: " Adopt ",
        decision: " Yes ",
        context: "",
        status: "DECIDED",
        ownerEmployeeId: "",
        meetingId: "m1",
      }),
    ).toEqual({
      title: "Adopt",
      decision: "Yes",
      status: "DECIDED",
      meetingId: "m1",
    });
  });

  it("supersedes with the new text and only a changed title", () => {
    expect(
      buildSupersedePayload({
        decision: " New ",
        title: "Adopt vendor",
        original: { title: "Adopt vendor" },
      }),
    ).toEqual({ decision: "New" });
    expect(
      buildSupersedePayload({
        decision: "New",
        title: "Renamed",
        original: { title: "Adopt vendor" },
      }),
    ).toEqual({ decision: "New", title: "Renamed" });
  });

  it("trims the reversal reason and turns an action's due time into an instant", () => {
    expect(buildReversePayload("  Vendor withdrew ")).toEqual({
      reason: "Vendor withdrew",
    });
    expect(
      buildActionPayload({
        title: " Sign ",
        ownerEmployeeId: "e1",
        dueAt: "2027-01-09T12:00",
      }),
    ).toEqual({
      title: "Sign",
      ownerEmployeeId: "e1",
      dueAt: new Date("2027-01-09T12:00").toISOString(),
    });
  });

  it("round-trips a local moment", () => {
    expect(toLocalMoment(new Date("2027-01-05T09:30").toISOString())).toBe(
      "2027-01-05T09:30",
    );
    expect(toLocalMoment(null)).toBe("");
    expect(toLocalMoment("not a date")).toBe("");
  });
});

describe("queries and paging", () => {
  it("builds a meetings query", () => {
    expect(
      buildMeetingsQuery({ status: "HELD", skip: 10, projectId: "p" }),
    ).toBe("take=10&skip=10&status=HELD&projectId=p");
    expect(buildMeetingsQuery({})).toBe("take=10&skip=0");
  });

  it("builds a decisions query", () => {
    expect(
      buildDecisionsQuery({ status: "REVERSED", mine: true, meetingId: "m" }),
    ).toBe("take=10&skip=0&status=REVERSED&mine=true&meetingId=m");
    expect(buildDecisionsQuery({ take: 50, meetingId: "m" })).toBe(
      "take=50&skip=0&meetingId=m",
    );
  });

  it("never asks for a negative offset", () => {
    expect(buildOpenActionsQuery(-5)).toBe("take=10&skip=0");
  });

  it("describes a page", () => {
    expect(describePage(0, 10, 25, 10)).toEqual({
      label: "1-10 of 25",
      hasPrev: false,
      hasNext: true,
    });
    expect(describePage(20, 5, 25, 10)).toEqual({
      label: "21-25 of 25",
      hasPrev: true,
      hasNext: false,
    });
    expect(describePage(0, 0, 0, 10)).toEqual({
      label: "0 of 0",
      hasPrev: false,
      hasNext: false,
    });
  });

  it("summarises attendance", () => {
    const attendees = [
      { employeeId: "a", attended: true },
      { employeeId: "b", attended: false },
    ];
    expect(attendeeSummary({ status: "PLANNED", attendees })).toBe("2 invited");
    expect(attendeeSummary({ status: "HELD", attendees })).toBe(
      "1 of 2 attended",
    );
  });
});
