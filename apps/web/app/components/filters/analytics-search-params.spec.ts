import {
  activeAnalyticsFilterCount,
  analyticsFilterHref,
  ANALYTICS_FILTER_PARAMS,
  applyAnalyticsFilters,
  clearAnalyticsFilters,
  readAnalyticsFilters,
  resolveAnalyticsPeriod,
  SCOPE_FILTER_PARAMS,
} from "./analytics-search-params";
import { resolvePeriod } from "./period";

/*
 * The query string is the state, so these functions are the state machine of
 * every reporting screen. They are worth testing precisely because nothing
 * fails loudly when they are wrong: a filter that stops applying looks like
 * data that changed.
 */

describe("the parameter contract", () => {
  it("is exactly the agreed set of names", () => {
    /*
     * Pinned deliberately. These names appear in bookmarks, in saved report
     * definitions and in links pasted between people; renaming one breaks
     * every saved link silently, because the filter just stops applying.
     */
    expect([...ANALYTICS_FILTER_PARAMS]).toEqual([
      "from",
      "to",
      "preset",
      "compare",
      "org",
      "bu",
      "dept",
      "team",
      "location",
      "manager",
      "employmentType",
      "status",
      "groupBy",
    ]);
  });

  it("counts only the scope filters, all of which are real parameters", () => {
    for (const key of SCOPE_FILTER_PARAMS) {
      expect(ANALYTICS_FILTER_PARAMS).toContain(key);
    }

    expect(SCOPE_FILTER_PARAMS).not.toContain("from");
    expect(SCOPE_FILTER_PARAMS).not.toContain("preset");
    expect(SCOPE_FILTER_PARAMS).not.toContain("groupBy");
  });
});

describe("readAnalyticsFilters", () => {
  it("reads a query string", () => {
    expect(readAnalyticsFilters("dept=eng&status=ACTIVE")).toEqual({
      dept: "eng",
      status: "ACTIVE",
    });
  });

  it("reads URLSearchParams and Next's searchParams object alike", () => {
    const expected = { dept: "eng", team: "core" };

    expect(
      readAnalyticsFilters(new URLSearchParams("dept=eng&team=core")),
    ).toEqual(expected);
    expect(readAnalyticsFilters({ dept: "eng", team: "core" })).toEqual(expected);
  });

  it("takes the first value of a repeated parameter", () => {
    // `?status=ACTIVE&status=` is what a half-cleared form produces.
    expect(readAnalyticsFilters({ status: ["ACTIVE", ""] })).toEqual({
      status: "ACTIVE",
    });
  });

  it("treats an empty value as absent", () => {
    expect(readAnalyticsFilters("dept=&status=ACTIVE")).toEqual({
      status: "ACTIVE",
    });
    expect(readAnalyticsFilters("dept=%20%20")).toEqual({});
  });

  it("ignores parameters it does not own", () => {
    // A sort order or tab another component owns must survive untouched.
    expect(readAnalyticsFilters("dept=eng&orderBy=name%20asc&page=3")).toEqual({
      dept: "eng",
    });
  });

  it("rejects an unknown preset or comparison rather than passing it through", () => {
    /*
     * A hand-edited or stale query string must not put an unknown preset into
     * state, where two different call sites would resolve it two ways.
     */
    expect(readAnalyticsFilters("preset=last_45_days")).toEqual({});
    expect(readAnalyticsFilters("compare=previous_decade")).toEqual({});
    expect(readAnalyticsFilters("preset=previous_month")).toEqual({
      preset: "previous_month",
    });
  });

  it("rejects a malformed date", () => {
    expect(readAnalyticsFilters("from=31/08/2026&to=2026-08-31")).toEqual({
      to: "2026-08-31",
    });
    expect(readAnalyticsFilters("from=2026-02-30")).toEqual({});
  });

  it("returns an empty state for nothing at all", () => {
    expect(readAnalyticsFilters(null)).toEqual({});
    expect(readAnalyticsFilters(undefined)).toEqual({});
    expect(readAnalyticsFilters("")).toEqual({});
  });
});

describe("applyAnalyticsFilters", () => {
  it("sets a value", () => {
    expect(applyAnalyticsFilters("", { dept: "eng" }).toString()).toBe("dept=eng");
  });

  it("always returns to the first page", () => {
    /*
     * The behaviour copied deliberately from the attendance exception filters:
     * staying on page 4 of a narrower result set shows nothing, which reads as
     * a broken filter rather than as being past the end.
     */
    const next = applyAnalyticsFilters("dept=eng&page=4", { status: "ACTIVE" });

    expect(next.has("page")).toBe(false);
  });

  it("drops page even when the change itself is a clear", () => {
    expect(applyAnalyticsFilters("dept=eng&page=4", { dept: null }).has("page")).toBe(
      false,
    );
  });

  it("clears a filter given an empty, null or undefined value", () => {
    for (const value of ["", "   ", null, undefined]) {
      const next = applyAnalyticsFilters("dept=eng&team=core", { dept: value });

      expect(next.has("dept")).toBe(false);
      expect(next.get("team")).toBe("core");
    }
  });

  it("preserves parameters it does not own", () => {
    // Dropping another component's sort order would be a cross-component bug.
    const next = applyAnalyticsFilters("orderBy=name%20asc&tab=summary", {
      dept: "eng",
    });

    expect(next.get("orderBy")).toBe("name asc");
    expect(next.get("tab")).toBe("summary");
  });

  it("applies several changes at once", () => {
    const next = applyAnalyticsFilters("preset=this_month", {
      preset: "custom",
      from: "2026-01-01",
      to: "2026-01-31",
    });

    expect(next.get("preset")).toBe("custom");
    expect(next.get("from")).toBe("2026-01-01");
    expect(next.get("to")).toBe("2026-01-31");
  });

  it("trims a value rather than storing whitespace", () => {
    expect(applyAnalyticsFilters("", { dept: "  eng  " }).get("dept")).toBe("eng");
  });

  it("does not mutate the input", () => {
    const original = new URLSearchParams("dept=eng");
    applyAnalyticsFilters(original, { dept: "sales" });

    expect(original.get("dept")).toBe("eng");
  });
});

describe("clearAnalyticsFilters", () => {
  it("removes every filter it owns and the page", () => {
    const next = clearAnalyticsFilters(
      "from=2026-01-01&to=2026-01-31&dept=eng&status=ACTIVE&page=3",
    );

    expect(next.toString()).toBe("");
  });

  it("keeps what it does not own", () => {
    const next = clearAnalyticsFilters("dept=eng&tab=summary&orderBy=name%20asc");

    expect(next.get("tab")).toBe("summary");
    expect(next.get("orderBy")).toBe("name asc");
    expect(next.has("dept")).toBe(false);
  });
});

describe("activeAnalyticsFilterCount", () => {
  it("counts scope filters only", () => {
    expect(
      activeAnalyticsFilterCount({ dept: "eng", team: "core", status: "ACTIVE" }),
    ).toBe(3);
  });

  it("does not count the period, which is always present", () => {
    /*
     * Counting the period would mean the bar could never read "no filters
     * applied" and Clear could never be correctly disabled.
     */
    expect(
      activeAnalyticsFilterCount({
        preset: "this_month",
        from: "2026-01-01",
        to: "2026-01-31",
        compare: "previous_period",
        groupBy: "department",
      }),
    ).toBe(0);
  });

  it("counts nothing for an empty state", () => {
    expect(activeAnalyticsFilterCount({})).toBe(0);
  });
});

describe("analyticsFilterHref", () => {
  it("omits a trailing question mark when there is no query", () => {
    expect(analyticsFilterHref("/reports/attendance", new URLSearchParams())).toBe(
      "/reports/attendance",
    );
  });

  it("appends the query when there is one", () => {
    expect(
      analyticsFilterHref("/reports/attendance", new URLSearchParams("dept=eng")),
    ).toBe("/reports/attendance?dept=eng");
  });
});

describe("resolveAnalyticsPeriod", () => {
  const options = { referenceDate: new Date("2026-08-31T12:00:00Z"), timezone: "UTC" };

  it("falls back to the default preset for an empty URL", () => {
    const resolved = resolveAnalyticsPeriod({}, options);

    expect(resolved.preset).toBe("last_30_days");
    expect(resolved.compare).toBe("none");
    expect(resolved.comparison).toBeNull();
    expect(resolved.period).toEqual(resolvePeriod("last_30_days", options));
  });

  it("honours a named preset", () => {
    expect(resolveAnalyticsPeriod({ preset: "previous_month" }, options).period).toEqual(
      { from: "2026-07-01", to: "2026-07-31" },
    );
  });

  it("lets an explicit range win over a stale preset", () => {
    /*
     * The dates are the more specific statement and are what a pasted link is
     * carrying. A link with both must not silently resolve to the preset.
     */
    const resolved = resolveAnalyticsPeriod(
      { preset: "this_month", from: "2026-03-01", to: "2026-03-15" },
      options,
    );

    expect(resolved.preset).toBe("custom");
    expect(resolved.period).toEqual({ from: "2026-03-01", to: "2026-03-15" });
  });

  it("ignores a half-specified range and keeps the preset", () => {
    const resolved = resolveAnalyticsPeriod(
      { preset: "previous_month", from: "2026-03-01" },
      options,
    );

    expect(resolved.preset).toBe("previous_month");
    expect(resolved.period).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("resolves the comparison window alongside the period", () => {
    const resolved = resolveAnalyticsPeriod(
      { preset: "previous_month", compare: "previous_period" },
      options,
    );

    expect(resolved.period).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(resolved.comparison).toEqual({ from: "2026-05-31", to: "2026-06-30" });
  });

  it("gives the same answer to the bar and to the loader", () => {
    /*
     * The reason this function exists. Two call sites each resolving the query
     * string themselves is how a legend reading "previous month" ends up above
     * numbers fetched for the previous 31 days, with no error anywhere.
     */
    const state = { preset: "this_quarter", compare: "previous_year" } as const;

    expect(resolveAnalyticsPeriod(state, options)).toEqual(
      resolveAnalyticsPeriod(state, options),
    );
  });

  it("resolves a URL end to end", () => {
    const state = readAnalyticsFilters(
      "from=2026-10-01&to=2026-10-31&compare=previous_month&dept=eng&page=2",
    );
    const resolved = resolveAnalyticsPeriod(state, options);

    expect(state.dept).toBe("eng");
    expect(resolved.period).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    // A calendar-aligned comparison of a 31-day range onto a 30-day month.
    expect(resolved.comparison).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("uses the tenant timezone for a relative preset", () => {
    const instant = new Date("2026-08-31T22:30:00.000Z");

    expect(
      resolveAnalyticsPeriod({ preset: "today" }, { referenceDate: instant, timezone: "Asia/Qatar" })
        .period,
    ).toEqual({ from: "2026-09-01", to: "2026-09-01" });
  });
});
