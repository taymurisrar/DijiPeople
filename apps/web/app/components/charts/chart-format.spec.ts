import { setDefaultFormattingContext } from "@/lib/formatting-context";
import {
  formatChartValue,
  formatShare,
  formatTimeBucketLabel,
  MISSING_VALUE_TEXT,
  pointAccessibleLabel,
  pointActionAccessibleLabel,
  summarizeChartShape,
} from "./chart-format";

/*
 * BUG-2010 — the dashboard rendered raw values through the *visiting browser's*
 * locale and timezone instead of the tenant's configured settings, because a
 * component called `toLocaleString` directly. Charts are the surface with the
 * most numbers per square inch on it, so the same defect here would be the most
 * visible version of it.
 *
 * These tests set a tenant formatting context and assert that the chart obeys
 * it. They pass on any machine precisely because nothing here consults the
 * machine.
 */

describe("chart value formatting", () => {
  afterEach(() => {
    setDefaultFormattingContext(null);
  });

  it("formats a plain number in the tenant's locale, not the machine's", () => {
    setDefaultFormattingContext({ locale: "en-US", timezone: "UTC" });
    expect(formatChartValue(1234567, "number")).toBe("1,234,567");

    // A locale that groups differently proves the setting is actually read.
    setDefaultFormattingContext({ locale: "de-DE", timezone: "UTC" });
    expect(formatChartValue(1234567, "number")).toBe("1.234.567");
  });

  it("formats currency with the code the caller passes", () => {
    setDefaultFormattingContext({ locale: "en-US", currency: "USD" });

    expect(formatChartValue(1200, "currency", { currencyCode: "QAR" })).toContain(
      "1,200",
    );
    expect(formatChartValue(1200, "currency", { currencyCode: "QAR" })).not.toBe(
      formatChartValue(1200, "currency", { currencyCode: "USD" }),
    );
  });

  it("falls back to the tenant currency when none is passed", () => {
    setDefaultFormattingContext({ locale: "en-US", currency: "USD" });
    expect(formatChartValue(50, "currency")).toBe("$50.00");
  });

  it("formats a duration as work hours", () => {
    setDefaultFormattingContext({ locale: "en-US" });
    expect(formatChartValue(7.5, "duration")).toBe("7.5 h");
    expect(formatChartValue(8, "duration")).toBe("8 h");
  });

  it("formats a percentage with a unit", () => {
    setDefaultFormattingContext({ locale: "en-US" });
    expect(formatChartValue(42.5, "percent")).toBe("42.5%");
  });

  it("defaults to plain number formatting", () => {
    setDefaultFormattingContext({ locale: "en-US" });
    expect(formatChartValue(10)).toBe("10");
  });

  it("renders zero as zero, never as missing", () => {
    /*
     * Zero is a measurement. Showing "-" for a department with no open
     * requisitions tells the reader the number is unknown when it is known.
     */
    setDefaultFormattingContext({ locale: "en-US" });
    expect(formatChartValue(0, "number")).toBe("0");
    expect(formatChartValue(0, "percent")).toBe("0%");
    expect(formatChartValue(0, "duration")).toBe("0 h");
  });

  it("renders a genuinely missing number as a dash", () => {
    expect(formatChartValue(null)).toBe(MISSING_VALUE_TEXT);
    expect(formatChartValue(undefined)).toBe(MISSING_VALUE_TEXT);
    expect(formatChartValue(Number.NaN)).toBe(MISSING_VALUE_TEXT);
    expect(formatChartValue(Number.POSITIVE_INFINITY)).toBe(MISSING_VALUE_TEXT);
  });

  it("formats negatives rather than dropping the sign", () => {
    setDefaultFormattingContext({ locale: "en-US" });
    expect(formatChartValue(-12, "number")).toBe("-12");
  });
});

describe("formatShare", () => {
  afterEach(() => {
    setDefaultFormattingContext(null);
  });

  it("keeps a decimal for small shares so a visible slice is never labelled 0%", () => {
    setDefaultFormattingContext({ locale: "en-US" });
    expect(formatShare(3.42)).toBe("3.4%");
    expect(formatShare(0.6)).toBe("0.6%");
  });

  it("drops the decimal once the share is large enough not to need it", () => {
    setDefaultFormattingContext({ locale: "en-US" });
    expect(formatShare(23.4)).toBe("23%");
    expect(formatShare(100)).toBe("100%");
  });

  it("handles a missing share", () => {
    expect(formatShare(null)).toBe(MISSING_VALUE_TEXT);
    expect(formatShare(Number.NaN)).toBe(MISSING_VALUE_TEXT);
  });
});

describe("pointAccessibleLabel", () => {
  /*
   * BUG-2148 — a widget's state reached sighted users as a colour and reached
   * everyone else not at all. In a chart the equivalent is a series encoded
   * only as a hue and a category encoded only as a position. Every chart in
   * this directory names its points through this function.
   */

  it("names the series, the category and the value", () => {
    expect(
      pointAccessibleLabel({
        seriesLabel: "Approved",
        pointLabel: "Engineering",
        valueText: "42",
      }),
    ).toBe("Approved, Engineering: 42");
  });

  it("omits the series in a single-series chart rather than repeating it", () => {
    // Otherwise a twelve-point line reads as the same word twelve times.
    expect(
      pointAccessibleLabel({ pointLabel: "Engineering", valueText: "42" }),
    ).toBe("Engineering: 42");
  });

  it("includes the share when the chart shows proportions", () => {
    expect(
      pointAccessibleLabel({
        pointLabel: "Engineering",
        valueText: "42",
        shareText: "18%",
      }),
    ).toBe("Engineering: 42 (18%)");
  });

  it("marks a comparison overlay so two identical values are distinguishable", () => {
    expect(
      pointAccessibleLabel({
        seriesLabel: "Headcount",
        pointLabel: "August",
        valueText: "61",
        qualifier: "previous period",
      }),
    ).toBe("Headcount, August: 61, previous period");
  });

  it("produces a distinct name for every point of a series", () => {
    const names = ["Engineering", "Sales", "Support"].map((label) =>
      pointAccessibleLabel({ pointLabel: label, valueText: "1" }),
    );

    expect(new Set(names).size).toBe(3);
  });
});

describe("pointActionAccessibleLabel", () => {
  it("never leaves an interactive target named by its verb alone", () => {
    /*
     * BUG-2149 — six links whose accessible name was the constant "Open", so a
     * screen reader's link list read "Open, Open, Open, Open, Open, Open". A
     * drill-down chart has forty targets and the same failure waiting.
     */
    const first = pointActionAccessibleLabel("Engineering: 42");
    const second = pointActionAccessibleLabel("Sales: 17");

    expect(first).toBe("View details for Engineering: 42");
    expect(first).not.toBe(second);
    expect(first).not.toBe("View details for");
  });

  it("accepts a different verb for a different action", () => {
    expect(pointActionAccessibleLabel("August", "Filter to")).toBe(
      "Filter to August",
    );
  });
});

describe("formatTimeBucketLabel", () => {
  afterEach(() => {
    setDefaultFormattingContext(null);
  });

  it("renders a day bucket in the tenant's date format", () => {
    setDefaultFormattingContext({
      dateFormat: "dd/MM/yyyy",
      timezone: "UTC",
      locale: "en-GB",
    });

    expect(
      formatTimeBucketLabel(
        { start: "2026-08-31", end: "2026-08-31", label: "2026-08-31" },
        "day",
      ),
    ).toBe("31/08/2026");
  });

  it("renders a week bucket as a range in the tenant's format", () => {
    setDefaultFormattingContext({
      dateFormat: "MM/dd/yyyy",
      timezone: "UTC",
      locale: "en-US",
    });

    expect(
      formatTimeBucketLabel(
        { start: "2026-08-30", end: "2026-09-05", label: "2026-08-30/2026-09-05" },
        "week",
      ),
    ).toBe("08/30/2026 - 09/05/2026");
  });

  it("keeps the locale-free token for month and quarter", () => {
    /*
     * `formatDate` can only render a whole date, so an August bucket would
     * print as "08/01/2026" and read as the first of the month.
     */
    setDefaultFormattingContext({ dateFormat: "MM/dd/yyyy", locale: "en-US" });

    expect(
      formatTimeBucketLabel(
        { start: "2026-08-01", end: "2026-08-31", label: "2026-08" },
        "month",
      ),
    ).toBe("2026-08");
    expect(
      formatTimeBucketLabel(
        { start: "2026-07-01", end: "2026-09-30", label: "2026-Q3" },
        "quarter",
      ),
    ).toBe("2026-Q3");
  });

  it("falls back to the raw token if a date cannot be formatted", () => {
    expect(
      formatTimeBucketLabel({ start: "nonsense", end: "nonsense", label: "x" }, "day"),
    ).toBe("x");
  });
});

describe("summarizeChartShape", () => {
  it("describes a single-series chart without mentioning series", () => {
    expect(summarizeChartShape({ seriesCount: 1, pointCount: 6 })).toBe(
      "6 data points",
    );
  });

  it("singularises one point", () => {
    expect(summarizeChartShape({ seriesCount: 1, pointCount: 1 })).toBe(
      "1 data point",
    );
  });

  it("counts the series when there is more than one", () => {
    expect(summarizeChartShape({ seriesCount: 3, pointCount: 18 })).toBe(
      "3 series, 18 data points",
    );
  });
});
