import { setDefaultFormattingContext } from "@/lib/formatting-context";
import { sparklineAriaLabel } from "./sparkline";
import type { ChartSeries } from "./chart-types";

/*
 * A sparkline is the chart most likely to ship with no text alternative at all:
 * it has no axis, no legend and no title, so there is nothing to notice
 * missing. BUG-2148 is the record of a widget whose meaning reached sighted
 * users as a colour and reached everyone else not at all, and a bare trend
 * glyph is the same failure in a smaller box.
 *
 * `Sparkline` therefore requires an `ariaLabel`, and this helper exists so a
 * caller has no excuse for a bad one. Reachable from a spec because
 * `sparkline.tsx` exports it as a plain function — the technique
 * `dashboard-widget-renderer.tsx` uses for `formatValue`, since `apps/web` has
 * no jsdom and cannot render the component.
 */

function series(values: number[]): ChartSeries {
  return {
    key: "headcount",
    label: "Headcount",
    points: values.map((value, index) => ({
      key: `p${index}`,
      label: `Point ${index}`,
      value,
    })),
  };
}

describe("sparklineAriaLabel", () => {
  afterEach(() => {
    setDefaultFormattingContext(null);
  });

  beforeEach(() => {
    setDefaultFormattingContext({ locale: "en-US", timezone: "UTC" });
  });

  it("states the direction and both endpoints", () => {
    expect(sparklineAriaLabel(series([48, 52, 61]))).toBe(
      "Headcount: rising from 48 to 61 across 3 points",
    );
  });

  it("names a fall as a fall", () => {
    expect(sparklineAriaLabel(series([61, 52, 48]))).toContain("falling from 61 to 48");
  });

  it("does not claim a trend where the endpoints match", () => {
    /*
     * "Unchanged" rather than rising or falling. A series that dips and
     * recovers has no net direction, and asserting one would be the label
     * disagreeing with the picture.
     */
    expect(sparklineAriaLabel(series([50, 20, 90, 50]))).toContain("unchanged");
  });

  it("describes a flat series without dividing anything by zero", () => {
    expect(sparklineAriaLabel(series([7, 7, 7]))).toBe(
      "Headcount: unchanged from 7 to 7 across 3 points",
    );
  });

  it("handles a single point, which has no direction", () => {
    expect(sparklineAriaLabel(series([42]))).toBe("Headcount: 42");
    expect(sparklineAriaLabel(series([42]))).not.toMatch(/rising|falling|unchanged/);
  });

  it("says so when there is no data, rather than producing an empty label", () => {
    expect(sparklineAriaLabel(series([]))).toBe("Headcount: no data");
  });

  it("includes the period when one is given", () => {
    expect(
      sparklineAriaLabel(series([1, 2]), { periodLabel: "last 30 days" }),
    ).toContain("Headcount, last 30 days:");
  });

  it("formats the endpoints through the tenant's settings", () => {
    // Not `toLocaleString` — the BUG-2010 rule reaches the sparkline too.
    expect(sparklineAriaLabel(series([1000, 2500]))).toContain("1,000");
    expect(
      sparklineAriaLabel(series([1000, 2500]), {
        valueFormat: "currency",
        currencyCode: "USD",
      }),
    ).toContain("$1,000.00");
    expect(
      sparklineAriaLabel(series([7.5, 8]), { valueFormat: "duration" }),
    ).toContain("7.5 h");
  });
});
