import {
  buildAnalyticsQueryBody,
  buildAnalyticsRecordsBody,
  buildRunReportBody,
  clampPage,
  clampPageSize,
  DEFAULT_RECORD_PAGE_SIZE,
  MAX_RECORD_PAGE_SIZE,
  readPositiveInteger,
} from "./analytics-request";

/*
 * The API's global `ValidationPipe` runs with `forbidNonWhitelisted: true`, so
 * one key the DTO does not declare is a 400 rather than an ignored field. That
 * turns body construction from a formality into the thing most likely to break
 * every chart on a page at once, for a reason nobody remembers introducing.
 *
 * These assertions are therefore mostly about what is *absent* from the body.
 */

const KNOWN_QUERY_KEYS = [
  "sourceKey",
  "preset",
  "from",
  "to",
  "comparison",
  "filters",
  "metricKeys",
  "breakdown",
  "trendMetricKey",
  "granularity",
];

describe("buildAnalyticsQueryBody", () => {
  it("sends nothing but the source when nothing else is selected", () => {
    const body = buildAnalyticsQueryBody({
      sourceKey: "workforce",
      period: { preset: "last_30_days" },
    });

    expect(body).toEqual({ sourceKey: "workforce", preset: "last_30_days" });
  });

  it("omits empty collections rather than sending them", () => {
    const body = buildAnalyticsQueryBody({
      sourceKey: "workforce",
      period: { preset: "last_30_days" },
      filters: [],
      metricKeys: [],
      breakdown: null,
      trendMetricKey: null,
      granularity: null,
    });

    expect(Object.keys(body).sort()).toEqual(["preset", "sourceKey"]);
  });

  it("never emits a key the DTO does not declare", () => {
    const body = buildAnalyticsQueryBody({
      sourceKey: "attendance",
      period: { preset: "custom", from: "2026-08-01", to: "2026-08-31", comparison: "previous_period" },
      filters: [{ field: "attendance.status", operator: "eq", value: "PRESENT" }],
      metricKeys: ["attendance.attendance_rate"],
      breakdown: "attendance.status",
      trendMetricKey: "attendance.attendance_rate",
      granularity: "week",
    });

    for (const key of Object.keys(body)) {
      expect(KNOWN_QUERY_KEYS).toContain(key);
    }
  });

  it("sends a preset rather than dates, so the tenant timezone decides", () => {
    /*
     * Resolving "this month" in the browser and sending the dates puts the
     * server's answer and the screen's label a day apart for any tenant whose
     * midnight is not the server's — and nothing anywhere reports an error.
     */
    const body = buildAnalyticsQueryBody({
      sourceKey: "workforce",
      period: { preset: "this_month" },
    });

    expect(body.preset).toBe("this_month");
    expect(body.from).toBeUndefined();
    expect(body.to).toBeUndefined();
  });

  it("sends explicit dates only for a custom period", () => {
    const body = buildAnalyticsQueryBody({
      sourceKey: "workforce",
      period: { preset: "custom", from: "2026-08-01", to: "2026-08-31" },
    });

    expect(body).toMatchObject({
      preset: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("downgrades a half-filled custom range instead of sending it", () => {
    /*
     * The server throws "A custom period requires both from and to", and a
     * half-filled date picker is a normal thing for a user to have on screen
     * for a second while they pick the other end.
     */
    const body = buildAnalyticsQueryBody({
      sourceKey: "workforce",
      period: { preset: "custom", from: "2026-08-01" },
    });

    expect(body.preset).toBe("last_30_days");
    expect(body.from).toBeUndefined();
    expect(body.to).toBeUndefined();
  });

  it("omits a comparison of none rather than sending the word", () => {
    const body = buildAnalyticsQueryBody({
      sourceKey: "workforce",
      period: { preset: "last_30_days", comparison: "none" },
    });

    expect(body.comparison).toBeUndefined();
  });
});

describe("buildAnalyticsRecordsBody", () => {
  it("does not claim a comparison the records endpoint ignores", () => {
    const body = buildAnalyticsRecordsBody({
      sourceKey: "workforce",
      period: { preset: "last_30_days", comparison: "previous_period" },
    });

    expect(body.comparison).toBeUndefined();
  });

  it("always sends a page and a page size", () => {
    const body = buildAnalyticsRecordsBody({
      sourceKey: "workforce",
      period: { preset: "last_30_days" },
    });

    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(DEFAULT_RECORD_PAGE_SIZE);
  });

  it("sends a direction whenever it sends a sort field, and neither otherwise", () => {
    const sorted = buildAnalyticsRecordsBody({
      sourceKey: "workforce",
      period: { preset: "last_30_days" },
      sortField: "workforce.hire_date",
      sortDirection: "asc",
    });
    expect(sorted).toMatchObject({
      sortField: "workforce.hire_date",
      sortDirection: "asc",
    });

    const unsorted = buildAnalyticsRecordsBody({
      sourceKey: "workforce",
      period: { preset: "last_30_days" },
      sortDirection: "asc",
    });
    expect(unsorted.sortField).toBeUndefined();
    expect(unsorted.sortDirection).toBeUndefined();
  });
});

describe("buildRunReportBody", () => {
  it("sends only the target when the reader has chosen no period", () => {
    /*
     * A report definition carries its own default preset. Sending one here
     * would silently override the report's own default with this app's.
     */
    const body = buildRunReportBody({ targetKey: "std:headcount" });

    expect(body.preset).toBeUndefined();
    expect(body.targetKey).toBe("std:headcount");
  });

  it("omits recordView unless it is being turned off", () => {
    /*
     * `recordView` defaults to true server-side and is what records a recent
     * view. Sending `true` explicitly would be noise; sending `false` is a real
     * instruction.
     */
    expect(buildRunReportBody({ targetKey: "std:x" }).recordView).toBeUndefined();
    expect(
      buildRunReportBody({ targetKey: "std:x", recordView: false }).recordView,
    ).toBe(false);
  });
});

describe("paging bounds", () => {
  it("clamps a page size to what the DTO accepts", () => {
    /*
     * The server bounds this at 200 and *refuses* above it rather than
     * clamping, so anything larger is a 400 rather than a smaller page.
     */
    expect(clampPageSize(10_000)).toBe(MAX_RECORD_PAGE_SIZE);
    expect(clampPageSize(0)).toBe(DEFAULT_RECORD_PAGE_SIZE);
    expect(clampPageSize(undefined)).toBe(DEFAULT_RECORD_PAGE_SIZE);
    expect(clampPageSize(50)).toBe(50);
  });

  it("never sends a page below one", () => {
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-4)).toBe(1);
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage(7)).toBe(7);
  });

  it("reads a page out of a search parameter, array form included", () => {
    expect(readPositiveInteger("3", 1)).toBe(3);
    expect(readPositiveInteger(["3", "9"], 1)).toBe(3);
    expect(readPositiveInteger("nonsense", 1)).toBe(1);
    expect(readPositiveInteger(undefined, 1)).toBe(1);
    expect(readPositiveInteger("0", 1)).toBe(1);
  });
});
