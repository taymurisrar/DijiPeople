import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DAILY_UPDATE_SECTIONS,
  buildDraftPayload,
  buildPolicyPayload,
  buildSavePayload,
  buildUpdatesQuery,
  dateInputFor,
  flattenSections,
  groupBySection,
  isCorrection,
  isEvidenceBacked,
  minutesToTime,
  statusTone,
  timeToMinutes,
  validatePolicy,
  validateUpdate,
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
