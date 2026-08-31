import {
  describeDelta,
  durationToHours,
  formatRecordCell,
  formatReportValue,
  metricTileAccessibleLabel,
  MISSING_VALUE_TEXT,
  resolveDurationUnit,
  toChartValue,
  toChartValueFormat,
} from "./report-format";
import type { AnalyticsMetricResult } from "./reporting-types";

/*
 * The three things that are wrong here are wrong *quietly*.
 *
 * A duration read in the wrong unit is off by sixty and looks like a plausible
 * number. A delta whose only signal of "worse" is a red pixel is invisible to a
 * screen reader and to a printout. A percentage change against a zero baseline
 * is undefined, and every convenient answer to it — 0%, 100%, infinity — is a
 * lie the reader will act on.
 */

function makeMetric(
  overrides: Partial<AnalyticsMetricResult> = {},
): AnalyticsMetricResult {
  return {
    key: "attendance.present_days",
    label: "Present days",
    description: "",
    value: 100,
    comparisonValue: 80,
    delta: 20,
    deltaPercent: 25,
    format: "plain",
    direction: "up_is_good",
    caveats: [],
    suppressed: false,
    ...overrides,
  };
}

describe("duration units", () => {
  /*
   * `/reporting/catalog` sends a metric's `format` but not its `valueType`, and
   * the server uses `format: "duration"` for both minutes and seconds. The unit
   * is only recoverable from the key.
   */

  it("reads seconds out of a metric key that says seconds", () => {
    expect(resolveDurationUnit("desktop.average_active_seconds")).toBe("seconds");
    expect(resolveDurationUnit("desktop.average_session_seconds")).toBe("seconds");
  });

  it("treats anything else as minutes, matching the server's exporter", () => {
    expect(resolveDurationUnit("attendance.average_worked_minutes")).toBe("minutes");
    expect(resolveDurationUnit("attendance.total_worked_minutes")).toBe("minutes");
    expect(resolveDurationUnit("something.unlabelled")).toBe("minutes");
  });

  it("converts each unit to the hours every chart primitive draws", () => {
    expect(durationToHours(480, "attendance.average_worked_minutes")).toBe(8);
    expect(durationToHours(28_800, "desktop.average_active_seconds")).toBe(8);
  });

  it("would be a sixtyfold error if the unit were guessed", () => {
    /* The regression this guards, stated as an assertion. */
    expect(
      durationToHours(28_800, "desktop.average_active_seconds") * 60,
    ).toBe(durationToHours(28_800, "desktop.average_active_minutes"));
  });
});

describe("toChartValue and toChartValueFormat", () => {
  it("maps the API's presentation formats onto the chart vocabulary", () => {
    expect(toChartValueFormat("currency")).toBe("currency");
    expect(toChartValueFormat("percent")).toBe("percent");
    expect(toChartValueFormat("duration")).toBe("duration");
    expect(toChartValueFormat("plain")).toBe("number");
    /* A date-formatted metric is not a measured value; the axis is not a date. */
    expect(toChartValueFormat("date")).toBe("number");
    expect(toChartValueFormat(undefined)).toBe("number");
  });

  it("converts durations and leaves everything else alone", () => {
    expect(toChartValue(480, "duration", "attendance.average_worked_minutes")).toBe(8);
    expect(toChartValue(480, "plain", "anything")).toBe(480);
    expect(toChartValue(null, "plain", "anything")).toBe(0);
  });
});

describe("formatReportValue", () => {
  it("renders a missing value as the missing marker, never as zero", () => {
    /*
     * `Number(null)` is 0, so the obvious guard renders an unmeasured metric as
     * a measured zero. The distinction is the whole point of the API returning
     * `value: null` for a suppressed metric.
     */
    expect(formatReportValue(null, "plain", "k")).toBe(MISSING_VALUE_TEXT);
    expect(formatReportValue(undefined, "plain", "k")).toBe(MISSING_VALUE_TEXT);
    expect(formatReportValue(Number.NaN, "plain", "k")).toBe(MISSING_VALUE_TEXT);
    expect(formatReportValue(0, "plain", "k")).not.toBe(MISSING_VALUE_TEXT);
  });

  it("suffixes a percentage and rounds it to one place", () => {
    expect(formatReportValue(93.4567, "percent", "k")).toBe("93.5%");
  });

  it("renders a duration in hours using the tenant number format", () => {
    expect(formatReportValue(480, "duration", "attendance.worked_minutes")).toBe(
      "8 h",
    );
  });
});

describe("formatRecordCell", () => {
  it("renders an empty cell rather than the word null", () => {
    expect(formatRecordCell(null, { key: "a" })).toBe(MISSING_VALUE_TEXT);
    expect(formatRecordCell("", { key: "a" })).toBe(MISSING_VALUE_TEXT);
  });

  it("renders booleans as words, not as true and false", () => {
    expect(formatRecordCell(true, { key: "a", type: "boolean" })).toBe("Yes");
    expect(formatRecordCell(false, { key: "a", type: "boolean" })).toBe("No");
  });

  it("never renders an object as [object Object]", () => {
    expect(formatRecordCell({ nested: 1 }, { key: "a" })).toBe(MISSING_VALUE_TEXT);
  });

  it("formats a numeric string, since Decimal columns arrive as strings", () => {
    /*
     * An unformatted "1234.5" beside a formatted "1,234.5" in the next column
     * is what makes a report look untrustworthy.
     */
    expect(
      formatRecordCell("93.4567", { key: "a", format: "percent" }),
    ).toBe("93.5%");
  });

  it("leaves ordinary text alone", () => {
    expect(formatRecordCell("Engineering", { key: "a" })).toBe("Engineering");
  });
});

describe("describeDelta", () => {
  it("says there is no comparison rather than showing a zero change", () => {
    const delta = describeDelta(
      makeMetric({ delta: null, comparisonValue: null, deltaPercent: null }),
    );

    expect(delta.present).toBe(false);
    expect(delta.text).toMatch(/no comparison/i);
  });

  it("carries the judgement as a word, not only as a colour", () => {
    /*
     * BUG-2148: severity conveyed by hue alone. A screen reader, a colour-blind
     * reader and a printed page all miss a red number.
     */
    const better = describeDelta(makeMetric({ direction: "up_is_good" }));
    expect(better.judgement).toBe("better");
    expect(better.text).toMatch(/better/);

    const worse = describeDelta(makeMetric({ direction: "down_is_good" }));
    expect(worse.judgement).toBe("worse");
    expect(worse.text).toMatch(/worse/);
  });

  it("passes no judgement on a metric that declares none", () => {
    /*
     * Every desktop-activity metric is `neutral` deliberately. Colouring a fall
     * in "active time" red asserts something the product does not assert.
     */
    const delta = describeDelta(makeMetric({ direction: "neutral" }));
    expect(delta.judgement).toBe("neutral");
    expect(delta.text).not.toMatch(/better|worse/);
  });

  it("reports an absolute change when the baseline was zero", () => {
    /*
     * The API sends `deltaPercent: null` there, because a percentage change
     * from zero is undefined. "+100%" and "+Infinity%" are both wrong.
     */
    const delta = describeDelta(
      makeMetric({ comparisonValue: 0, delta: 12, deltaPercent: null }),
    );

    expect(delta.present).toBe(true);
    expect(delta.percentText).toBe("");
    expect(delta.text).toMatch(/previous period was zero/i);
    expect(delta.text).not.toMatch(/%/);
  });

  it("calls an unchanged metric unchanged, with no judgement", () => {
    const delta = describeDelta(
      makeMetric({ delta: 0, deltaPercent: 0, direction: "up_is_good" }),
    );

    expect(delta.movement).toBe("flat");
    expect(delta.judgement).toBe("neutral");
    expect(delta.text).toMatch(/unchanged/i);
  });

  it("names the comparison window it is measured against", () => {
    const delta = describeDelta(makeMetric(), {
      comparisonLabel: "1 Jul 2026 - 31 Jul 2026",
    });

    expect(delta.text).toContain("1 Jul 2026 - 31 Jul 2026");
  });
});

describe("metricTileAccessibleLabel", () => {
  it("gives a screen reader the label, the number and the movement at once", () => {
    const metric = makeMetric();
    const label = metricTileAccessibleLabel(
      metric,
      "100",
      describeDelta(metric),
    );

    expect(label).toContain("Present days");
    expect(label).toContain("100");
    expect(label).toMatch(/better/);
  });

  it("says a suppressed metric was withheld, not that it is zero", () => {
    const label = metricTileAccessibleLabel(
      makeMetric({ suppressed: true, value: null }),
      "Withheld",
      describeDelta(makeMetric({ delta: null, comparisonValue: null })),
    );

    expect(label).toMatch(/withheld/i);
    expect(label).toMatch(/too small/i);
  });
});
