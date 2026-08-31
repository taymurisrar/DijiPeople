import {
  COMPARISON_MODE_OPTIONS,
  DEFAULT_WEEK_STARTS_ON,
  formatPeriodLabel,
  isComparisonMode,
  isPeriodPreset,
  normalizeRange,
  PERIOD_PRESET_OPTIONS,
  PERIOD_PRESETS,
  periodLengthInDays,
  resolveComparison,
  resolvePeriod,
  startOfWeek,
  suggestedGranularity,
  tenantToday,
  type DateRange,
} from "./period";
import { setDefaultFormattingContext } from "@/lib/formatting-context";

/*
 * Date arithmetic is the part of a reporting screen that is invisibly wrong.
 * On a developer's machine the server, the browser and the tenant are all in
 * one timezone, the current month has 31 days, and no leap year is in sight —
 * so every one of the defects below survives manual testing and reaches a
 * customer as "the numbers are off by a day".
 *
 * Every test therefore pins `referenceDate` and `timezone` explicitly. A test
 * that reads the wall clock would pass on the machine that wrote it and fail
 * somewhere else at 02:00, which is worse than no test.
 */

const utc = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe("tenantToday", () => {
  it("uses the tenant's timezone, not the server's", () => {
    /*
     * The defect this exists for. At 22:30 UTC on 31 August it is already
     * 01:30 on 1 September in Doha (UTC+3). A report run then must be dated
     * the 1st for a Qatari tenant, whatever the Render instance thinks.
     */
    const instant = new Date("2026-08-31T22:30:00.000Z");

    expect(tenantToday({ referenceDate: instant, timezone: "UTC" })).toBe(
      "2026-08-31",
    );
    expect(tenantToday({ referenceDate: instant, timezone: "Asia/Qatar" })).toBe(
      "2026-09-01",
    );
  });

  it("goes backwards across the date line too", () => {
    // 00:30 UTC on 1 September is still 20:30 on 31 August in New York.
    const instant = new Date("2026-09-01T00:30:00.000Z");

    expect(
      tenantToday({ referenceDate: instant, timezone: "America/New_York" }),
    ).toBe("2026-08-31");
  });

  it("defaults to UTC when the tenant has no timezone configured", () => {
    expect(
      tenantToday({ referenceDate: new Date("2026-08-31T22:30:00.000Z") }),
    ).toBe("2026-08-31");
  });

  it("accepts a string reference date", () => {
    expect(
      tenantToday({ referenceDate: "2026-03-14T08:00:00.000Z", timezone: "UTC" }),
    ).toBe("2026-03-14");
  });

  it("falls back to now rather than throwing on an unparseable reference", () => {
    expect(tenantToday({ referenceDate: "nonsense" })).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("preset and mode guards", () => {
  it("recognises every declared preset and rejects anything else", () => {
    for (const preset of PERIOD_PRESETS) {
      expect(isPeriodPreset(preset)).toBe(true);
    }

    expect(isPeriodPreset("last_45_days")).toBe(false);
    expect(isPeriodPreset("")).toBe(false);
    expect(isPeriodPreset(null)).toBe(false);
    expect(isPeriodPreset(7)).toBe(false);
  });

  it("recognises every comparison mode", () => {
    expect(isComparisonMode("previous_period")).toBe(true);
    expect(isComparisonMode("previous_decade")).toBe(false);
  });

  it("offers every preset and mode in the dropdowns, with no duplicates", () => {
    // A preset that exists but is unreachable in the UI is a dead branch.
    expect(PERIOD_PRESET_OPTIONS.map((option) => option.value).sort()).toEqual(
      [...PERIOD_PRESETS].sort(),
    );
    expect(new Set(COMPARISON_MODE_OPTIONS.map((option) => option.label)).size).toBe(
      COMPARISON_MODE_OPTIONS.length,
    );
  });
});

describe("resolvePeriod", () => {
  const options = { referenceDate: utc("2026-08-31"), timezone: "UTC" };

  it("resolves today and yesterday", () => {
    expect(resolvePeriod("today", options)).toEqual({
      from: "2026-08-31",
      to: "2026-08-31",
    });
    expect(resolvePeriod("yesterday", options)).toEqual({
      from: "2026-08-30",
      to: "2026-08-30",
    });
  });

  it("counts today as one of the last 7 days", () => {
    /*
     * The off-by-one that produces an eight-day week whose totals never
     * reconcile with anything else on the page.
     */
    const period = resolvePeriod("last_7_days", options);

    expect(period).toEqual({ from: "2026-08-25", to: "2026-08-31" });
    expect(periodLengthInDays(period)).toBe(7);
  });

  it("counts today as one of the last 30 days", () => {
    const period = resolvePeriod("last_30_days", options);

    expect(period).toEqual({ from: "2026-08-02", to: "2026-08-31" });
    expect(periodLengthInDays(period)).toBe(30);
  });

  it("runs a rolling window back across a month boundary", () => {
    const period = resolvePeriod("last_7_days", {
      referenceDate: utc("2026-03-03"),
      timezone: "UTC",
    });

    expect(period).toEqual({ from: "2026-02-25", to: "2026-03-03" });
    expect(periodLengthInDays(period)).toBe(7);
  });

  it("makes this_month a month-to-date, ending today", () => {
    expect(resolvePeriod("this_month", options)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(
      resolvePeriod("this_month", { referenceDate: utc("2026-08-14"), timezone: "UTC" }),
    ).toEqual({ from: "2026-08-01", to: "2026-08-14" });
  });

  it("makes previous_month a whole calendar month", () => {
    expect(resolvePeriod("previous_month", options)).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("ends previous_month on the real last day, 30-day months included", () => {
    expect(
      resolvePeriod("previous_month", {
        referenceDate: utc("2026-05-15"),
        timezone: "UTC",
      }),
    ).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  it("handles February, in both a common and a leap year", () => {
    expect(
      resolvePeriod("previous_month", {
        referenceDate: utc("2026-03-10"),
        timezone: "UTC",
      }),
    ).toEqual({ from: "2026-02-01", to: "2026-02-28" });

    // 2028 is a leap year; 2100 will not be one, but 2028 is the live case.
    expect(
      resolvePeriod("previous_month", {
        referenceDate: utc("2028-03-10"),
        timezone: "UTC",
      }),
    ).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("crosses the year boundary going back a month", () => {
    expect(
      resolvePeriod("previous_month", {
        referenceDate: utc("2026-01-15"),
        timezone: "UTC",
      }),
    ).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("puts each quarter boundary in the right place", () => {
    const quarters: Array<[string, DateRange]> = [
      ["2026-01-01", { from: "2026-01-01", to: "2026-01-01" }],
      ["2026-03-31", { from: "2026-01-01", to: "2026-03-31" }],
      ["2026-04-01", { from: "2026-04-01", to: "2026-04-01" }],
      ["2026-07-15", { from: "2026-07-01", to: "2026-07-15" }],
      ["2026-12-31", { from: "2026-10-01", to: "2026-12-31" }],
    ];

    for (const [today, expected] of quarters) {
      expect(
        resolvePeriod("this_quarter", { referenceDate: utc(today), timezone: "UTC" }),
      ).toEqual(expected);
    }
  });

  it("makes previous_quarter a whole calendar quarter", () => {
    expect(
      resolvePeriod("previous_quarter", {
        referenceDate: utc("2026-08-31"),
        timezone: "UTC",
      }),
    ).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });

  it("rolls previous_quarter back into the prior year from Q1", () => {
    expect(
      resolvePeriod("previous_quarter", {
        referenceDate: utc("2026-02-10"),
        timezone: "UTC",
      }),
    ).toEqual({ from: "2025-10-01", to: "2025-12-31" });
  });

  it("resolves year to date and the previous whole year", () => {
    expect(resolvePeriod("year_to_date", options)).toEqual({
      from: "2026-01-01",
      to: "2026-08-31",
    });
    expect(resolvePeriod("previous_year", options)).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("resolves every preset to a well-ordered, valid range", () => {
    for (const preset of PERIOD_PRESETS) {
      const period = resolvePeriod(preset, {
        ...options,
        custom: { from: "2026-01-05", to: "2026-02-05" },
      });

      expect(period.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(period.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(period.from <= period.to).toBe(true);
    }
  });

  it("uses the tenant timezone when deciding what 'today' means", () => {
    const instant = new Date("2026-08-31T22:30:00.000Z");

    expect(resolvePeriod("today", { referenceDate: instant, timezone: "UTC" })).toEqual(
      { from: "2026-08-31", to: "2026-08-31" },
    );
    expect(
      resolvePeriod("today", { referenceDate: instant, timezone: "Asia/Qatar" }),
    ).toEqual({ from: "2026-09-01", to: "2026-09-01" });
  });

  it("takes a custom range as given", () => {
    expect(
      resolvePeriod("custom", {
        ...options,
        custom: { from: "2026-02-01", to: "2026-02-14" },
      }),
    ).toEqual({ from: "2026-02-01", to: "2026-02-14" });
  });

  it("swaps a backwards custom range instead of returning an empty one", () => {
    // Picking the end date first is normal; an empty result set is not an error.
    expect(
      resolvePeriod("custom", {
        ...options,
        custom: { from: "2026-02-14", to: "2026-02-01" },
      }),
    ).toEqual({ from: "2026-02-01", to: "2026-02-14" });
  });

  it("falls back rather than throwing on a half-filled or malformed custom range", () => {
    const fallback = resolvePeriod("last_30_days", options);

    expect(resolvePeriod("custom", { ...options, custom: { from: "2026-02-01" } })).toEqual(
      fallback,
    );
    expect(resolvePeriod("custom", options)).toEqual(fallback);
    expect(
      resolvePeriod("custom", {
        ...options,
        custom: { from: "2026-02-30", to: "2026-03-01" },
      }),
    ).toEqual(fallback);
  });

  it("falls back for an unrecognised preset from a hand-edited query string", () => {
    expect(resolvePeriod("last_45_days", options)).toEqual(
      resolvePeriod("last_30_days", options),
    );
    expect(resolvePeriod(null, options)).toEqual(resolvePeriod("last_30_days", options));
  });
});

describe("periodLengthInDays", () => {
  it("counts inclusively, so one day is one", () => {
    expect(periodLengthInDays({ from: "2026-08-31", to: "2026-08-31" })).toBe(1);
    expect(periodLengthInDays({ from: "2026-08-01", to: "2026-08-31" })).toBe(31);
  });

  it("counts across a leap day", () => {
    expect(periodLengthInDays({ from: "2028-02-01", to: "2028-03-01" })).toBe(30);
    expect(periodLengthInDays({ from: "2026-02-01", to: "2026-03-01" })).toBe(29);
  });

  it("is not confused by a DST transition", () => {
    /*
     * Calendar arithmetic, not milliseconds. March 2026 in Europe contains a
     * 23-hour day; dividing an elapsed millisecond count by 86,400,000 loses
     * it and reports one day fewer.
     */
    expect(periodLengthInDays({ from: "2026-03-01", to: "2026-03-31" })).toBe(31);
  });

  it("returns zero for a malformed range", () => {
    expect(periodLengthInDays({ from: "", to: "2026-08-31" })).toBe(0);
  });
});

describe("resolveComparison", () => {
  it("returns nothing for 'none' or an unrecognised mode", () => {
    const period = { from: "2026-08-01", to: "2026-08-31" };

    expect(resolveComparison(period, "none")).toBeNull();
    expect(resolveComparison(period, "nonsense")).toBeNull();
    expect(resolveComparison(period, null)).toBeNull();
  });

  it("slides previous_period back by exactly its own length", () => {
    const period = { from: "2026-08-01", to: "2026-08-31" };
    const comparison = resolveComparison(period, "previous_period");

    expect(comparison).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(periodLengthInDays(comparison as DateRange)).toBe(
      periodLengthInDays(period),
    );
  });

  it("keeps previous_period the same length even when it lands on a shorter month", () => {
    /*
     * The case that separates the two families of comparison. October is 31
     * days; the 31 days immediately before it run back into August, because
     * September only has thirty. A like-for-like comparison must preserve the
     * *length*, not the calendar alignment.
     */
    const period = { from: "2026-10-01", to: "2026-10-31" };
    const comparison = resolveComparison(period, "previous_period");

    expect(comparison).toEqual({ from: "2026-08-31", to: "2026-09-30" });
    expect(periodLengthInDays(comparison as DateRange)).toBe(31);
  });

  it("ends previous_period the day before the period starts, with no overlap or gap", () => {
    const period = { from: "2026-08-15", to: "2026-08-21" };
    const comparison = resolveComparison(period, "previous_period") as DateRange;

    expect(comparison.to).toBe("2026-08-14");
    expect(periodLengthInDays(comparison)).toBe(7);
  });

  it("slides a single day back one day", () => {
    expect(
      resolveComparison({ from: "2026-01-01", to: "2026-01-01" }, "previous_period"),
    ).toEqual({ from: "2025-12-31", to: "2025-12-31" });
  });

  it("aligns previous_month to the calendar, which does not preserve length", () => {
    /*
     * The other family. 1–31 October against the previous month is 1–30
     * September: thirty days, because September has thirty. Reading a
     * "-3.2% vs last month" off this without knowing which mode produced it is
     * how a month-length artefact becomes a trend.
     */
    const period = { from: "2026-10-01", to: "2026-10-31" };
    const comparison = resolveComparison(period, "previous_month") as DateRange;

    expect(comparison).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodLengthInDays(comparison)).toBe(30);
    expect(periodLengthInDays(comparison)).not.toBe(periodLengthInDays(period));
  });

  it("clamps a month shift onto February rather than rolling into March", () => {
    // 31 March minus one month has no correct answer; 3 March is the wrong one.
    expect(
      resolveComparison({ from: "2026-03-01", to: "2026-03-31" }, "previous_month"),
    ).toEqual({ from: "2026-02-01", to: "2026-02-28" });

    expect(
      resolveComparison({ from: "2028-03-01", to: "2028-03-31" }, "previous_month"),
    ).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("crosses the year boundary going back a month", () => {
    expect(
      resolveComparison({ from: "2026-01-05", to: "2026-01-20" }, "previous_month"),
    ).toEqual({ from: "2025-12-05", to: "2025-12-20" });
  });

  it("shifts previous_quarter back three months", () => {
    expect(
      resolveComparison({ from: "2026-07-01", to: "2026-09-30" }, "previous_quarter"),
    ).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });

  it("crosses the year boundary going back a quarter", () => {
    expect(
      resolveComparison({ from: "2026-01-01", to: "2026-03-31" }, "previous_quarter"),
    ).toEqual({ from: "2025-10-01", to: "2025-12-31" });
  });

  it("shifts previous_year back twelve months", () => {
    expect(
      resolveComparison({ from: "2026-08-01", to: "2026-08-31" }, "previous_year"),
    ).toEqual({ from: "2025-08-01", to: "2025-08-31" });
  });

  it("clamps a leap day back onto 28 February", () => {
    // 29 February 2028 has no counterpart in 2027.
    expect(
      resolveComparison({ from: "2028-02-01", to: "2028-02-29" }, "previous_year"),
    ).toEqual({ from: "2027-02-01", to: "2027-02-28" });
  });

  it("returns nothing for a malformed period", () => {
    expect(resolveComparison({ from: "", to: "" }, "previous_period")).toBeNull();
  });

  it("never returns an inverted comparison range", () => {
    const period = { from: "2026-05-10", to: "2026-06-20" };

    for (const mode of [
      "previous_period",
      "previous_month",
      "previous_quarter",
      "previous_year",
    ] as const) {
      const comparison = resolveComparison(period, mode) as DateRange;
      expect(comparison.from <= comparison.to).toBe(true);
    }
  });
});

describe("normalizeRange", () => {
  it("swaps a backwards pair", () => {
    expect(normalizeRange("2026-08-31", "2026-08-01")).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("leaves a correct pair alone", () => {
    expect(normalizeRange("2026-08-01", "2026-08-31")).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("rejects a partial or impossible date", () => {
    expect(normalizeRange("2026-08-01", null)).toBeNull();
    expect(normalizeRange("2026-02-30", "2026-08-01")).toBeNull();
    expect(normalizeRange("31/08/2026", "2026-08-01")).toBeNull();
  });
});

describe("startOfWeek", () => {
  it("starts the week on Sunday by default, because the weekend here is Fri/Sat", () => {
    /*
     * This product's default weekend is Friday/Saturday, so the working week
     * begins on Sunday. Defaulting to Monday — the reflex — would put the
     * boundary in the middle of the weekend.
     */
    expect(DEFAULT_WEEK_STARTS_ON).toBe(0);

    // 2026-08-31 is a Monday.
    expect(startOfWeek("2026-08-31")).toBe("2026-08-30");
    // 2026-08-30 is itself a Sunday.
    expect(startOfWeek("2026-08-30")).toBe("2026-08-30");
    // 2026-09-05 is the Saturday that ends that week.
    expect(startOfWeek("2026-09-05")).toBe("2026-08-30");
  });

  it("honours a configured week start", () => {
    expect(startOfWeek("2026-08-31", 1)).toBe("2026-08-31");
    expect(startOfWeek("2026-09-05", 1)).toBe("2026-08-31");
  });

  it("crosses a month boundary", () => {
    expect(startOfWeek("2026-09-01")).toBe("2026-08-30");
  });

  it("returns nothing for a malformed date", () => {
    expect(startOfWeek("nonsense")).toBeNull();
  });
});

describe("suggestedGranularity", () => {
  it("keeps short ranges daily and long ranges coarse", () => {
    expect(suggestedGranularity({ from: "2026-08-01", to: "2026-08-31" })).toBe("day");
    expect(suggestedGranularity({ from: "2026-01-01", to: "2026-06-30" })).toBe("week");
    expect(suggestedGranularity({ from: "2025-01-01", to: "2026-12-31" })).toBe("month");
    expect(suggestedGranularity({ from: "2020-01-01", to: "2026-12-31" })).toBe(
      "quarter",
    );
  });

  it("never suggests hundreds of buckets", () => {
    // 730 daily columns is not a chart.
    expect(suggestedGranularity({ from: "2025-01-01", to: "2026-12-31" })).not.toBe(
      "day",
    );
  });

  it("copes with a malformed range", () => {
    expect(suggestedGranularity({ from: "", to: "" })).toBe("day");
  });
});

describe("formatPeriodLabel", () => {
  afterEach(() => {
    setDefaultFormattingContext(null);
  });

  it("writes the period in the tenant's date format", () => {
    setDefaultFormattingContext({
      dateFormat: "dd/MM/yyyy",
      timezone: "UTC",
      locale: "en-GB",
    });

    expect(formatPeriodLabel({ from: "2026-08-01", to: "2026-08-31" })).toBe(
      "01/08/2026 - 31/08/2026",
    );
  });

  it("collapses a single-day period to one date", () => {
    setDefaultFormattingContext({
      dateFormat: "yyyy-MM-dd",
      timezone: "UTC",
      locale: "en-US",
    });

    expect(formatPeriodLabel({ from: "2026-08-31", to: "2026-08-31" })).toBe(
      "2026-08-31",
    );
  });

  it("returns nothing for a malformed period", () => {
    expect(formatPeriodLabel({ from: "", to: "" })).toBe("");
  });
});
