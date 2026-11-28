import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CADENCES,
  DAILY_UPDATE_SECTIONS,
  MAX_ESCALATE_AFTER_MINUTES,
  buildDraftPayload,
  buildPolicyPayload,
  buildSavePayload,
  buildScopePolicyPayload,
  buildUpdatesQuery,
  dateInputFor,
  deadlineLabel,
  escalationLabel,
  escalationRows,
  flattenSections,
  groupBySection,
  isCorrection,
  isEvidenceBacked,
  minutesToTime,
  scopeTargetOf,
  statusTone,
  timeToMinutes,
  validatePolicy,
  validateScopePolicy,
  validateUpdate,
  workingDaysLabel,
  type DailyUpdateItem,
} from "./daily-updates";

describe("sections mirror the API", () => {
  it("lists the same sections in the same order", () => {
    const source = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../../services/api/src/modules/daily-updates/dto/daily-update.dto.ts",
      ),
      "utf8",
    ).replace(/\r/g, "");
    const block = /DAILY_UPDATE_SECTIONS = \[([\s\S]*?)\] as const/.exec(source);
    expect(block).not.toBeNull();
    const parsed = [
      ...(block as RegExpExecArray)[1].matchAll(/'([A-Z_]+)'/g),
    ].map((m) => m[1]);
    expect([...DAILY_UPDATE_SECTIONS]).toEqual(parsed);
  });
});

const ITEMS: DailyUpdateItem[] = [
  { section: "NEXT", text: "Plan release" },
  { section: "COMPLETED", text: "Fixed bug", contributionEntryId: "c1" },
  { section: "COMPLETED", text: "Reviewed PR", workItemId: "w1" },
  { section: "BLOCKER", text: "  " },
];

describe("grouping", () => {
  it("groups by section keeping order within a section", () => {
    const grouped = groupBySection(ITEMS);
    expect(grouped.COMPLETED.map((i) => i.text)).toEqual([
      "Fixed bug",
      "Reviewed PR",
    ]);
    expect(grouped.IN_PROGRESS).toEqual([]);
    expect(flattenSections(grouped).map((i) => i.section)).toEqual([
      "COMPLETED",
      "COMPLETED",
      "NEXT",
      "BLOCKER",
    ]);
  });

  it("marks lines backed by the person's own records", () => {
    expect(isEvidenceBacked(ITEMS[1])).toBe(true);
    expect(isEvidenceBacked(ITEMS[2])).toBe(true);
    expect(isEvidenceBacked(ITEMS[0])).toBe(false);
  });
});

describe("save payload", () => {
  it("drops blank lines, trims, and keeps evidence links", () => {
    expect(buildSavePayload({ summary: " Good day ", items: ITEMS })).toEqual({
      summary: "Good day",
      items: [
        { section: "NEXT", text: "Plan release" },
        { section: "COMPLETED", text: "Fixed bug", contributionEntryId: "c1" },
        { section: "COMPLETED", text: "Reviewed PR", workItemId: "w1" },
      ],
    });
  });

  it("omits an empty summary and never sends the origin", () => {
    const body = buildSavePayload({
      summary: " ",
      items: [{ section: "NEXT", text: "x", origin: "DRAFTED" }],
    });
    expect(body).not.toHaveProperty("summary");
    expect(body.items[0]).not.toHaveProperty("origin");
  });

  it("sends the loaded version so a stale save is refused, and omits it when unknown", () => {
    expect(
      buildSavePayload({ summary: "", items: [], expectedVersion: 3 }),
    ).toEqual({ expectedVersion: 3, items: [] });
    expect(buildSavePayload({ summary: "", items: [] })).not.toHaveProperty(
      "expectedVersion",
    );
  });

  it("rejects an over-long line", () => {
    expect(
      validateUpdate({
        summary: "",
        items: [{ section: "NEXT", text: "a".repeat(501) }],
      }),
    ).not.toBeNull();
    expect(validateUpdate({ summary: "", items: [] })).toBeNull();
  });
});

describe("status", () => {
  it("treats anything past draft as a correction", () => {
    expect(isCorrection("DRAFT")).toBe(false);
    expect(isCorrection("SUBMITTED")).toBe(true);
    expect(isCorrection("ACKNOWLEDGED")).toBe(true);
    expect(statusTone("ACKNOWLEDGED")).toBe("good");
  });
});

describe("dates and queries", () => {
  it("formats a local date", () => {
    expect(dateInputFor(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(buildDraftPayload("")).toEqual({});
    expect(buildDraftPayload("2026-01-05")).toEqual({ date: "2026-01-05" });
  });

  it("builds the list query", () => {
    expect(buildUpdatesQuery({ status: "SUBMITTED", from: "2026-01-01" })).toBe(
      "from=2026-01-01&status=SUBMITTED&take=100",
    );
  });
});

describe("policy", () => {
  it("converts the deadline both ways", () => {
    expect(minutesToTime(1080)).toBe("18:00");
    expect(timeToMinutes("18:30")).toBe(1110);
    expect(timeToMinutes("25:00")).toBeNull();
    expect(timeToMinutes("")).toBeNull();
  });

  it("validates and builds the payload", () => {
    expect(
      validatePolicy({ workingDays: [], deadlineTime: "18:00", timezone: "UTC" }),
    ).not.toBeNull();
    expect(
      validatePolicy({ workingDays: [1], deadlineTime: "", timezone: "UTC" }),
    ).not.toBeNull();
    expect(
      validatePolicy({ workingDays: [1], deadlineTime: "18:00", timezone: " " }),
    ).not.toBeNull();
    expect(
      buildPolicyPayload({
        enabled: true,
        workingDays: [5, 1, 1, 3],
        deadlineTime: "18:00",
        timezone: " Asia/Karachi ",
        requireAcknowledgement: false,
      }),
    ).toEqual({
      enabled: true,
      workingDays: [1, 3, 5],
      deadlineMinutes: 1080,
      timezone: "Asia/Karachi",
      requireAcknowledgement: false,
    });
  });
});

describe("scoped policies and escalation", () => {
  const base = {
    targetKind: "TEAM" as const,
    targetId: "t1",
    enabled: true,
    cadence: "WORKING_DAYS" as const,
    workingDays: [5, 1, 1, 3],
    deadlineTime: "17:30",
    deadlineMinutes: "60",
    timezone: " Asia/Karachi ",
    requireAcknowledgement: true,
    escalateAfter: "45",
  };

  it("names exactly one target and sends only that id", () => {
    expect(buildScopePolicyPayload(base)).toMatchObject({ teamId: "t1" });
    expect(buildScopePolicyPayload(base)).not.toHaveProperty("businessUnitId");
    const unit = buildScopePolicyPayload({
      ...base,
      targetKind: "BUSINESS_UNIT",
      targetId: "b1",
    });
    expect(unit).toMatchObject({ businessUnitId: "b1" });
    expect(unit).not.toHaveProperty("teamId");
  });

  it("reads the deadline as a time of day for working days and as minutes per shift", () => {
    expect(buildScopePolicyPayload(base).deadlineMinutes).toBe(17 * 60 + 30);
    expect(
      buildScopePolicyPayload({ ...base, cadence: "PER_SHIFT" })
        .deadlineMinutes,
    ).toBe(60);
  });

  it("sorts and dedupes the days, trims the zone, and turns a blank escalation into null", () => {
    const payload = buildScopePolicyPayload({ ...base, escalateAfter: " " });
    expect(payload.workingDays).toEqual([1, 3, 5]);
    expect(payload.timezone).toBe("Asia/Karachi");
    expect(payload.escalateAfterMinutes).toBeNull();
    expect(buildScopePolicyPayload(base).escalateAfterMinutes).toBe(45);
  });

  it("validates the scope, the days, the deadline, the zone and the escalation", () => {
    expect(validateScopePolicy(base)).toBeNull();
    expect(validateScopePolicy({ ...base, targetId: "" })).toMatch(/team/i);
    expect(
      validateScopePolicy({ ...base, targetKind: "BUSINESS_UNIT", targetId: "" }),
    ).toMatch(/business unit/i);
    expect(validateScopePolicy({ ...base, workingDays: [] })).toMatch(
      /working day/i,
    );
    expect(validateScopePolicy({ ...base, deadlineTime: "" })).toMatch(
      /deadline/i,
    );
    expect(
      validateScopePolicy({
        ...base,
        cadence: "PER_SHIFT",
        deadlineMinutes: "1440",
      }),
    ).toMatch(/minutes/i);
    expect(
      validateScopePolicy({ ...base, cadence: "PER_SHIFT", workingDays: [] }),
    ).toBeNull();
    expect(validateScopePolicy({ ...base, timezone: " " })).toMatch(
      /time zone/i,
    );
    for (const bad of ["-1", "10081", "1.5"]) {
      expect(validateScopePolicy({ ...base, escalateAfter: bad })).toMatch(
        /escalation/i,
      );
    }
  });

  it("labels policies", () => {
    expect(escalationLabel(null)).toBe("No escalation");
    expect(escalationLabel(0)).toBe("Escalates at the deadline");
    expect(escalationLabel(30)).toBe("Escalates after 30 min");
    expect(deadlineLabel({ cadence: "PER_SHIFT", deadlineMinutes: 15 })).toBe(
      "15 min after the shift",
    );
    expect(
      deadlineLabel({ cadence: "WORKING_DAYS", deadlineMinutes: 1080 }),
    ).toBe("18:00");
    expect(workingDaysLabel([3, 1])).toBe("Mon, Wed");
    expect(scopeTargetOf({ teamId: "t", businessUnitId: null })).toEqual({
      kind: "TEAM",
      id: "t",
    });
    expect(scopeTargetOf({ teamId: null, businessUnitId: null })).toBeNull();
  });

  it("reports every count the API returns, in order", () => {
    expect(
      escalationRows({
        evaluated: 4,
        escalated: 2,
        alreadyEscalated: 1,
        noManager: 1,
        failed: 0,
      }),
    ).toEqual([
      { label: "Evaluated", value: 4 },
      { label: "Escalated", value: 2 },
      { label: "Already escalated", value: 1 },
      { label: "No manager", value: 1 },
      { label: "Failed", value: 0 },
    ]);
  });

  it("keeps the API's cadences and escalation bound", () => {
    const dto = readFileSync(
      path.resolve(
        __dirname,
        "../../../../../../services/api/src/modules/daily-updates/dto/daily-update.dto.ts",
      ),
      "utf8",
    );
    expect(dto).toContain("@IsIn(['WORKING_DAYS', 'PER_SHIFT'])");
    expect(dto).toContain(`@Max(${MAX_ESCALATE_AFTER_MINUTES})`);
    expect([...CADENCES]).toEqual(["WORKING_DAYS", "PER_SHIFT"]);
  });
});
