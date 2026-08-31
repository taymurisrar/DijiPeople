import {
  bucketByPeriod,
  buildAreaPath,
  buildLinePath,
  collapseToTopN,
  computeShares,
  donutArcs,
  funnelStages,
  linearScale,
  niceTicks,
  polarToCartesian,
  resolvePlotArea,
  seriesExtent,
  stackedExtent,
  stackSeries,
} from "./chart-geometry";
import { MAX_CHART_SLICES, OTHER_BUCKET_KEY } from "./chart-tokens";
import type { ChartPoint, ChartSeries } from "./chart-types";

/*
 * `apps/web` has no jsdom and jest here matches `*.spec.ts` only, so the chart
 * components cannot be rendered by a test at all. That is precisely why every
 * calculation lives in `chart-geometry.ts` and the components are thin: this
 * file is the only place a chart defect can be caught before a human sees it.
 *
 * The cases below are weighted towards degenerate input rather than the happy
 * path, because the happy path is the one that gets exercised in development.
 * A chart breaks in production on the empty tenant, the single-employee
 * department, the day everything was zero, and the flat series — none of which
 * appear in demo data.
 */

function point(key: string, value: number, label = key): ChartPoint {
  return { key, label, value };
}

describe("linearScale", () => {
  it("maps a domain onto a range linearly", () => {
    const scale = linearScale({ domain: [0, 100], range: [0, 200] });

    expect(scale(0)).toBe(0);
    expect(scale(50)).toBe(100);
    expect(scale(100)).toBe(200);
  });

  it("handles an inverted range, which is how SVG y-axes are drawn", () => {
    // Screen y grows downward, so a value axis runs from the bottom up.
    const scale = linearScale({ domain: [0, 10], range: [240, 0] });

    expect(scale(0)).toBe(240);
    expect(scale(10)).toBe(0);
    expect(scale(5)).toBe(120);
  });

  it("does not divide by zero when the domain is flat", () => {
    /*
     * The case this guard exists for. Every employee logged exactly 8 hours,
     * so min === max; `(v - d0) / (d1 - d0)` is 0/0 and every coordinate
     * becomes NaN, which SVG renders as an empty box rather than as an error.
     */
    const scale = linearScale({ domain: [8, 8], range: [240, 0] });

    expect(Number.isNaN(scale(8))).toBe(false);
    expect(scale(8)).toBe(120);
    // Anything else in a flat domain is equally "the only value there is".
    expect(scale(0)).toBe(120);
  });

  it("survives a non-finite domain or value instead of emitting NaN", () => {
    const broken = linearScale({ domain: [0, Number.NaN], range: [0, 100] });
    expect(Number.isNaN(broken(50))).toBe(false);

    const scale = linearScale({ domain: [0, 10], range: [0, 100] });
    expect(Number.isNaN(scale(Number.NaN))).toBe(false);
    expect(Number.isNaN(scale(Number.POSITIVE_INFINITY))).toBe(false);
  });

  it("extrapolates beyond the domain unless asked to clamp", () => {
    const loose = linearScale({ domain: [0, 10], range: [0, 100] });
    expect(loose(20)).toBe(200);

    const clamped = linearScale({ domain: [0, 10], range: [0, 100], clamp: true });
    expect(clamped(20)).toBe(100);
    expect(clamped(-5)).toBe(0);
  });

  it("inverts a position back to a domain value", () => {
    const scale = linearScale({ domain: [0, 10], range: [240, 0] });
    expect(scale.invert(240)).toBe(0);
    expect(scale.invert(0)).toBe(10);
    expect(scale.invert(120)).toBe(5);
  });

  it("exposes its own domain and range", () => {
    const scale = linearScale({ domain: [2, 8], range: [0, 60] });
    expect(scale.domain).toEqual([2, 8]);
    expect(scale.range).toEqual([0, 60]);
  });
});

describe("niceTicks", () => {
  it("chooses round steps a person would have chosen", () => {
    expect(niceTicks(0, 95, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it("always crosses zero when the data does", () => {
    const ticks = niceTicks(-5, 5, 5);
    expect(ticks).toContain(0);
    expect(ticks[0]).toBeLessThanOrEqual(-5);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(5);
  });

  it("covers the full extent it was given", () => {
    const ticks = niceTicks(3, 87, 5);
    expect(ticks[0]).toBeLessThanOrEqual(3);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(87);
  });

  it("returns a single tick for a flat extent rather than inventing a span", () => {
    // A day where the figure never moved has one interesting number on it.
    expect(niceTicks(47, 47, 5)).toEqual([47]);
    expect(niceTicks(0, 0, 5)).toEqual([0]);
  });

  it("returns nothing for non-finite input instead of looping", () => {
    expect(niceTicks(Number.NaN, 10, 5)).toEqual([]);
    expect(niceTicks(0, Number.POSITIVE_INFINITY, 5)).toEqual([]);
  });

  it("does not accumulate floating point noise", () => {
    /*
     * Repeated addition of 0.1 reaches 0.30000000000000004, and an axis label
     * reading that is how this class of bug reaches a screenshot.
     */
    for (const tick of niceTicks(0, 0.5, 5)) {
      expect(String(tick)).not.toMatch(/\d{6,}/);
    }
    expect(niceTicks(0, 0.5, 5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it("scales to very large numbers without producing hundreds of ticks", () => {
    const ticks = niceTicks(0, 1_234_567_890, 5);

    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(1_234_567_890);
    for (const tick of ticks) {
      expect(Number.isFinite(tick)).toBe(true);
    }
  });

  it("handles a reversed min/max by ordering them", () => {
    expect(niceTicks(100, 0, 5)).toEqual(niceTicks(0, 100, 5));
  });

  it("keeps ticks strictly ascending and evenly spaced", () => {
    const ticks = niceTicks(12, 987, 6);
    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index]).toBeGreaterThan(ticks[index - 1]);
    }
    const step = ticks[1] - ticks[0];
    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index] - ticks[index - 1]).toBeCloseTo(step, 6);
    }
  });
});

describe("resolvePlotArea", () => {
  it("removes the axis gutters from the viewBox", () => {
    expect(
      resolvePlotArea(400, 240, { top: 10, right: 10, bottom: 30, left: 40 }),
    ).toEqual({ x: 40, y: 10, width: 350, height: 200 });
  });

  it("collapses to zero rather than inverting when margins exceed the box", () => {
    const area = resolvePlotArea(20, 20, {
      top: 30,
      right: 30,
      bottom: 30,
      left: 30,
    });

    expect(area.width).toBe(0);
    expect(area.height).toBe(0);
  });
});

describe("bucketByPeriod", () => {
  const points = [
    { date: "2026-08-31", value: 3 },
    { date: "2026-08-31", value: 2 },
    { date: "2026-09-01", value: 4 },
    { date: "2026-11-15", value: 7 },
  ];

  it("returns nothing for empty input", () => {
    expect(bucketByPeriod([], "day")).toEqual([]);
    expect(bucketByPeriod(null, "day")).toEqual([]);
  });

  it("sums values that land in the same day", () => {
    const buckets = bucketByPeriod(points, "day");
    const first = buckets.find((bucket) => bucket.start === "2026-08-31");

    expect(first?.value).toBe(5);
    expect(first?.count).toBe(2);
  });

  it("orders buckets ascending whatever order the input arrived in", () => {
    // APIs commonly return newest-first, which would draw the line backwards.
    const reversed = [...points].reverse();
    const buckets = bucketByPeriod(reversed, "day");

    expect(buckets.map((bucket) => bucket.start)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-11-15",
    ]);
  });

  it("buckets by month across a month boundary", () => {
    const buckets = bucketByPeriod(points, "month");

    expect(buckets.map((bucket) => bucket.label)).toEqual([
      "2026-08",
      "2026-09",
      "2026-11",
    ]);
    expect(buckets[0].value).toBe(5);
    expect(buckets[0].end).toBe("2026-08-31");
  });

  it("ends a month bucket on the real last day, February included", () => {
    expect(bucketByPeriod([{ date: "2026-02-10", value: 1 }], "month")[0].end).toBe(
      "2026-02-28",
    );
    // 2028 is a leap year.
    expect(bucketByPeriod([{ date: "2028-02-10", value: 1 }], "month")[0].end).toBe(
      "2028-02-29",
    );
  });

  it("buckets by quarter on calendar quarter boundaries", () => {
    const buckets = bucketByPeriod(
      [
        { date: "2026-01-01", value: 1 },
        { date: "2026-03-31", value: 1 },
        { date: "2026-04-01", value: 1 },
        { date: "2026-12-31", value: 1 },
      ],
      "quarter",
    );

    expect(buckets.map((bucket) => bucket.label)).toEqual([
      "2026-Q1",
      "2026-Q2",
      "2026-Q4",
    ]);
    expect(buckets[0].value).toBe(2);
    expect(buckets[0].start).toBe("2026-01-01");
    expect(buckets[0].end).toBe("2026-03-31");
    expect(buckets[2].end).toBe("2026-12-31");
  });

  it("starts the week on Sunday by default, because the weekend here is Fri/Sat", () => {
    /*
     * The tenant weekend default in this product is Friday/Saturday, so the
     * working week starts on Sunday. Assuming Monday — the reflex — would
     * split every weekly attendance chart across the wrong boundary.
     * 2026-08-31 is a Monday; its Sunday-start week begins 2026-08-30.
     */
    const buckets = bucketByPeriod([{ date: "2026-08-31", value: 1 }], "week");

    expect(buckets[0].start).toBe("2026-08-30");
    expect(buckets[0].end).toBe("2026-09-05");
    expect(buckets[0].label).toBe("2026-08-30/2026-09-05");
  });

  it("honours an explicit week start", () => {
    const monday = bucketByPeriod([{ date: "2026-08-31", value: 1 }], "week", {
      weekStartsOn: 1,
    });

    expect(monday[0].start).toBe("2026-08-31");
    expect(monday[0].end).toBe("2026-09-06");
  });

  it("groups a week that spans a month boundary into one bucket", () => {
    const buckets = bucketByPeriod(
      [
        { date: "2026-08-31", value: 1 },
        { date: "2026-09-01", value: 1 },
      ],
      "week",
    );

    expect(buckets).toHaveLength(1);
    expect(buckets[0].value).toBe(2);
  });

  it("drops unparseable dates and non-finite values rather than poisoning the series", () => {
    const buckets = bucketByPeriod(
      [
        { date: "not-a-date", value: 5 },
        { date: "2026-02-30", value: 5 },
        { date: "2026-08-31", value: Number.NaN },
        { date: "2026-08-31", value: 6 },
      ],
      "day",
    );

    expect(buckets).toHaveLength(1);
    expect(buckets[0].value).toBe(6);
    expect(buckets[0].count).toBe(1);
  });

  it("reads the date out of a full ISO timestamp without shifting it", () => {
    const buckets = bucketByPeriod(
      [{ date: "2026-08-31T23:45:00.000Z", value: 1 }],
      "day",
    );

    expect(buckets[0].start).toBe("2026-08-31");
  });

  it("leaves calendar gaps alone by default", () => {
    const buckets = bucketByPeriod(
      [
        { date: "2026-08-01", value: 1 },
        { date: "2026-08-04", value: 1 },
      ],
      "day",
    );

    expect(buckets).toHaveLength(2);
  });

  it("fills calendar gaps with zeroes when asked", () => {
    const buckets = bucketByPeriod(
      [
        { date: "2026-08-01", value: 1 },
        { date: "2026-08-04", value: 1 },
      ],
      "day",
      { fillGaps: true },
    );

    expect(buckets.map((bucket) => bucket.start)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]);
    expect(buckets[1].value).toBe(0);
    expect(buckets[1].count).toBe(0);
  });

  it("fills month gaps across a year boundary", () => {
    const buckets = bucketByPeriod(
      [
        { date: "2026-11-05", value: 1 },
        { date: "2027-02-05", value: 1 },
      ],
      "month",
      { fillGaps: true },
    );

    expect(buckets.map((bucket) => bucket.label)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});

describe("buildLinePath / buildAreaPath", () => {
  const x = linearScale({ domain: [0, 3], range: [0, 300] });
  const y = linearScale({ domain: [0, 10], range: [100, 0] });

  it("returns an empty string for no points, which SVG renders as nothing", () => {
    expect(buildLinePath([], x, y)).toBe("");
    expect(buildLinePath(null, x, y)).toBe("");
    expect(buildAreaPath([], x, y)).toBe("");
  });

  it("emits a lone move command for a single point", () => {
    // A one-point series has no line, but the point marker still needs a place.
    expect(buildLinePath([{ x: 0, y: 5 }], x, y)).toBe("M 0 50");
  });

  it("draws a polyline through the points", () => {
    expect(
      buildLinePath(
        [
          { x: 0, y: 0 },
          { x: 1, y: 10 },
          { x: 2, y: 5 },
        ],
        x,
        y,
      ),
    ).toBe("M 0 100 L 100 0 L 200 50");
  });

  it("breaks the line at a gap instead of interpolating across it", () => {
    /*
     * A missing measurement is not a zero. Joining across it invents a reading
     * for a day the office was shut.
     */
    const path = buildLinePath(
      [
        { x: 0, y: 0 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 5 },
      ],
      x,
      y,
    );

    expect(path).toBe("M 0 100 M 200 50");
    expect(path.match(/M/g)).toHaveLength(2);
  });

  it("draws a flat series as a straight line rather than as nothing", () => {
    const flatY = linearScale({ domain: [7, 7], range: [100, 0] });
    const path = buildLinePath(
      [
        { x: 0, y: 7 },
        { x: 1, y: 7 },
      ],
      x,
      flatY,
    );

    expect(path).toBe("M 0 50 L 100 50");
    expect(path).not.toContain("NaN");
  });

  it("closes the area down to the baseline", () => {
    const path = buildAreaPath(
      [
        { x: 0, y: 5 },
        { x: 1, y: 10 },
      ],
      x,
      y,
    );

    expect(path.startsWith("M 0 100")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
    expect(path).toContain("L 0 50");
    expect(path).toContain("L 100 0");
  });

  it("closes each side of a gap separately so no area is shaded under missing data", () => {
    const path = buildAreaPath(
      [
        { x: 0, y: 5 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 5 },
      ],
      x,
      y,
    );

    expect(path.match(/Z/g)).toHaveLength(2);
  });

  it("never emits NaN into a path string", () => {
    const path = buildLinePath(
      [
        { x: Number.NaN, y: Number.NaN },
        { x: 1, y: 1 },
      ],
      x,
      y,
    );

    expect(path).not.toContain("NaN");
  });

  it("rounds coordinates so paths are stable between renders", () => {
    const messy = linearScale({ domain: [0, 3], range: [0, 100] });
    const path = buildLinePath([{ x: 1, y: 1 }], messy, messy);

    expect(path).toBe("M 33.333 33.333");
  });
});

describe("stackSeries", () => {
  const series: ChartSeries[] = [
    {
      key: "approved",
      label: "Approved",
      points: [point("jan", 5, "January"), point("feb", 3, "February")],
    },
    {
      key: "rejected",
      label: "Rejected",
      points: [point("jan", 2, "January"), point("feb", 4, "February")],
    },
  ];

  it("returns nothing for empty input", () => {
    expect(stackSeries([])).toEqual([]);
    expect(stackSeries(null)).toEqual([]);
  });

  it("accumulates each column from zero upward", () => {
    const columns = stackSeries(series);

    expect(columns).toHaveLength(2);
    expect(columns[0].key).toBe("jan");
    expect(columns[0].segments.map((segment) => [segment.start, segment.end])).toEqual([
      [0, 5],
      [5, 7],
    ]);
    expect(columns[0].total).toBe(7);
  });

  it("keeps first-seen column order even when a series skips a category", () => {
    const columns = stackSeries([
      { key: "a", label: "A", points: [point("x", 1), point("y", 1)] },
      { key: "b", label: "B", points: [point("z", 1), point("x", 1)] },
    ]);

    expect(columns.map((column) => column.key)).toEqual(["x", "y", "z"]);
  });

  it("contributes nothing for a point a series does not have", () => {
    const columns = stackSeries([
      { key: "a", label: "A", points: [point("x", 4)] },
      { key: "b", label: "B", points: [] },
    ]);

    expect(columns[0].segments).toHaveLength(1);
    expect(columns[0].total).toBe(4);
  });

  it("stacks negatives downward from zero rather than adding their magnitude", () => {
    /*
     * The defect this prevents: a naive cumulative total treats −5 as +5 of
     * height, so a column summing to 7 draws taller than one summing to 17.
     */
    const columns = stackSeries([
      { key: "gain", label: "Gain", points: [point("q1", 12)] },
      { key: "loss", label: "Loss", points: [point("q1", -5)] },
    ]);

    expect(columns[0].segments[0]).toMatchObject({ start: 0, end: 12 });
    expect(columns[0].segments[1]).toMatchObject({ start: 0, end: -5 });
    expect(columns[0].total).toBe(7);
    expect(columns[0].positiveTotal).toBe(12);
    expect(columns[0].negativeTotal).toBe(-5);
  });

  it("stacks an all-zero column without collapsing it", () => {
    const columns = stackSeries([
      { key: "a", label: "A", points: [point("x", 0)] },
      { key: "b", label: "B", points: [point("x", 0)] },
    ]);

    expect(columns[0].segments).toHaveLength(2);
    expect(columns[0].total).toBe(0);
  });

  it("skips a non-finite value instead of breaking the whole stack", () => {
    const columns = stackSeries([
      { key: "a", label: "A", points: [point("x", Number.NaN)] },
      { key: "b", label: "B", points: [point("x", 3)] },
    ]);

    expect(columns[0].total).toBe(3);
    expect(columns[0].segments).toHaveLength(1);
  });

  it("reports an extent that always includes zero", () => {
    expect(stackedExtent(stackSeries(series))).toEqual([0, 7]);
    expect(
      stackedExtent(
        stackSeries([{ key: "a", label: "A", points: [point("x", -4)] }]),
      ),
    ).toEqual([-4, 0]);
  });
});

describe("collapseToTopN", () => {
  const many: ChartPoint[] = [
    point("a", 10),
    point("b", 9),
    point("c", 8),
    point("d", 7),
    point("e", 6),
    point("f", 5),
    point("g", 4),
    point("h", 3),
    point("i", 2),
  ];

  it("returns nothing for empty input", () => {
    expect(collapseToTopN([])).toEqual([]);
    expect(collapseToTopN(null)).toEqual([]);
  });

  it("sorts descending", () => {
    const collapsed = collapseToTopN([point("a", 1), point("b", 9), point("c", 5)], 5);
    expect(collapsed.map((item) => item.key)).toEqual(["b", "c", "a"]);
  });

  it("leaves a short list untouched and marks nothing as Other", () => {
    const collapsed = collapseToTopN([point("a", 2), point("b", 1)], 5);

    expect(collapsed).toHaveLength(2);
    expect(collapsed.every((item) => item.isOther === false)).toBe(true);
  });

  it("rolls the tail into one bucket whose count is in its label", () => {
    const collapsed = collapseToTopN(many, MAX_CHART_SLICES);

    expect(collapsed).toHaveLength(MAX_CHART_SLICES + 1);
    const other = collapsed[collapsed.length - 1];
    expect(other.key).toBe(OTHER_BUCKET_KEY);
    expect(other.isOther).toBe(true);
    expect(other.collapsedCount).toBe(2);
    expect(other.label).toBe("Other (2)");
  });

  it("sums the tail rather than dropping it, so the parts still make the whole", () => {
    /*
     * The reason the bucket exists at all. A chart whose visible segments do
     * not add up to the total printed above them is worse than a chart that
     * shows less.
     */
    const collapsed = collapseToTopN(many, MAX_CHART_SLICES);
    const originalTotal = many.reduce((sum, item) => sum + item.value, 0);
    const collapsedTotal = collapsed.reduce((sum, item) => sum + item.value, 0);

    expect(collapsedTotal).toBe(originalTotal);
  });

  it("keeps ties in their original order so the chart does not reshuffle itself", () => {
    /*
     * An unstable sort makes six equal values swap places on every render,
     * which reads as live data moving when nothing has.
     */
    const tied = [point("a", 5), point("b", 5), point("c", 5), point("d", 5)];

    expect(collapseToTopN(tied, 10).map((item) => item.key)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(collapseToTopN(tied, 10).map((item) => item.key)).toEqual(
      collapseToTopN(tied, 10).map((item) => item.key),
    );
  });

  it("handles one dominant value without hiding the rest", () => {
    const collapsed = collapseToTopN(
      [point("big", 100000), point("a", 1), point("b", 1)],
      2,
    );

    expect(collapsed[0].key).toBe("big");
    expect(collapsed[collapsed.length - 1].value).toBe(1);
    expect(collapsed[collapsed.length - 1].isOther).toBe(true);
  });

  it("keeps all-zero items rather than collapsing them away", () => {
    const collapsed = collapseToTopN([point("a", 0), point("b", 0)], 5);

    expect(collapsed).toHaveLength(2);
    expect(collapsed.every((item) => item.value === 0)).toBe(true);
  });

  it("sorts negatives to the bottom", () => {
    const collapsed = collapseToTopN([point("a", -5), point("b", 3)], 5);
    expect(collapsed.map((item) => item.key)).toEqual(["b", "a"]);
  });

  it("drops a non-finite value", () => {
    expect(collapseToTopN([point("a", Number.NaN), point("b", 1)], 5)).toHaveLength(1);
  });

  it("falls back to the default limit for a nonsensical one", () => {
    expect(collapseToTopN(many, 0)).toHaveLength(MAX_CHART_SLICES + 1);
    expect(collapseToTopN(many, -3)).toHaveLength(MAX_CHART_SLICES + 1);
  });
});

describe("computeShares", () => {
  it("returns nothing for empty input", () => {
    expect(computeShares([])).toEqual([]);
    expect(computeShares(null)).toEqual([]);
  });

  it("gives a sole item the whole of it", () => {
    const [only] = computeShares([point("a", 42)]);
    expect(only.share).toBe(100);
    expect(only.displayShare).toBe(100);
  });

  it("apportions rounding so the printed shares sum to exactly 100", () => {
    /*
     * The classic defect: three thirds each round to 33.3 and the reader is
     * told the whole is 99.9%. Largest-remainder apportionment hands the
     * leftover unit to the largest discarded fraction instead.
     */
    const shares = computeShares([point("a", 1), point("b", 1), point("c", 1)]);
    const total = shares.reduce((sum, item) => sum + item.displayShare, 0);

    expect(Number(total.toFixed(6))).toBe(100);
  });

  it("sums to 100 across a range of awkward splits", () => {
    const splits: number[][] = [
      [1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1],
      [7, 11, 13],
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [999999, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ];

    for (const split of splits) {
      const shares = computeShares(
        split.map((value, index) => point(`k${index}`, value)),
      );
      const total = shares.reduce((sum, item) => sum + item.displayShare, 0);

      expect(Number(total.toFixed(6))).toBe(100);
    }
  });

  it("keeps the exact share separate from the rounded one", () => {
    const shares = computeShares([point("a", 1), point("b", 2)]);

    expect(shares[0].share).toBeCloseTo(33.3333, 3);
    expect(shares[0].displayShare).toBeCloseTo(33.3, 6);
  });

  it("returns zeroes for an all-zero total rather than inventing a distribution", () => {
    /*
     * There is no honest way to apportion a whole that does not exist. Forcing
     * these to sum to 100 would draw a full ring for a day nothing happened.
     */
    const shares = computeShares([point("a", 0), point("b", 0)]);

    expect(shares.map((item) => item.share)).toEqual([0, 0]);
    expect(shares.map((item) => item.displayShare)).toEqual([0, 0]);
    expect(shares.map((item) => item.visibleShare)).toEqual([0, 0]);
  });

  it("excludes negatives from the denominator and gives them no share", () => {
    const shares = computeShares([point("a", 10), point("b", -5)]);

    expect(shares[0].share).toBe(100);
    expect(shares[1].share).toBe(0);
    // The measured value is still reported; only the share is refused.
    expect(shares[1].value).toBe(-5);
  });

  it("floors a tiny share to a visible sliver without printing the floored number", () => {
    /*
     * A 0.04% category drawn at 0.04% width is invisible, and an invisible bar
     * reads as absent data. `visibleShare` is for a width attribute only.
     */
    const shares = computeShares([point("big", 999_999), point("tiny", 1)]);
    const tiny = shares[1];

    expect(tiny.share).toBeLessThan(0.01);
    expect(tiny.visibleShare).toBeGreaterThanOrEqual(1.5);
    expect(tiny.displayShare).toBeLessThan(1);
  });

  it("does not floor a genuine zero into visibility", () => {
    const shares = computeShares([point("a", 10), point("b", 0)]);
    expect(shares[1].visibleShare).toBe(0);
  });

  it("respects a requested precision", () => {
    const shares = computeShares([point("a", 1), point("b", 1), point("c", 1)], {
      precision: 0,
    });
    const total = shares.reduce((sum, item) => sum + item.displayShare, 0);

    expect(total).toBe(100);
    for (const item of shares) {
      expect(Number.isInteger(item.displayShare)).toBe(true);
    }
  });

  it("handles very large numbers without losing the sum", () => {
    const shares = computeShares([
      point("a", 9_007_199_254_740),
      point("b", 1_000_000),
      point("c", 3),
    ]);
    const total = shares.reduce((sum, item) => sum + item.displayShare, 0);

    expect(Number(total.toFixed(6))).toBe(100);
  });

  it("preserves input order", () => {
    const shares = computeShares([point("z", 1), point("a", 99)]);
    expect(shares.map((item) => item.key)).toEqual(["z", "a"]);
  });
});

describe("funnelStages", () => {
  const stages: ChartPoint[] = [
    point("applied", 200, "Applied"),
    point("screened", 100, "Screened"),
    point("interviewed", 40, "Interviewed"),
    point("offered", 10, "Offered"),
  ];

  it("returns nothing for empty input", () => {
    expect(funnelStages([])).toEqual([]);
    expect(funnelStages(null)).toEqual([]);
  });

  it("keeps the given order, because a funnel's order is its meaning", () => {
    const computed = funnelStages(stages);
    expect(computed.map((stage) => stage.key)).toEqual([
      "applied",
      "screened",
      "interviewed",
      "offered",
    ]);
  });

  it("widths each stage against the first", () => {
    const computed = funnelStages(stages);

    expect(computed[0].widthRatio).toBe(1);
    expect(computed[1].widthRatio).toBe(0.5);
    expect(computed[3].widthRatio).toBe(0.05);
  });

  it("reports step-to-step and cumulative conversion separately", () => {
    const computed = funnelStages(stages);

    expect(computed[0].conversionFromPrevious).toBeNull();
    expect(computed[0].conversionFromStart).toBe(100);
    expect(computed[1].conversionFromPrevious).toBe(50);
    expect(computed[2].conversionFromPrevious).toBe(40);
    expect(computed[2].conversionFromStart).toBe(20);
  });

  it("reports drop-off in both absolute and rate terms", () => {
    const computed = funnelStages(stages);

    expect(computed[0].dropOff).toBe(0);
    expect(computed[0].dropOffRate).toBeNull();
    expect(computed[1].dropOff).toBe(100);
    expect(computed[1].dropOffRate).toBe(50);
  });

  it("handles a single stage", () => {
    const [only] = funnelStages([point("applied", 5)]);

    expect(only.widthRatio).toBe(1);
    expect(only.conversionFromPrevious).toBeNull();
    expect(only.conversionFromStart).toBe(100);
  });

  it("does not divide by zero when the first stage is empty", () => {
    // A requisition opened today: nobody has applied yet.
    const computed = funnelStages([point("applied", 0), point("screened", 0)]);

    expect(computed.every((stage) => stage.widthRatio === 0)).toBe(true);
    expect(computed[0].conversionFromStart).toBeNull();
    expect(computed[1].conversionFromPrevious).toBeNull();
    for (const stage of computed) {
      expect(Number.isNaN(stage.widthRatio)).toBe(false);
    }
  });

  it("does not divide by zero at an intermediate empty stage", () => {
    const computed = funnelStages([
      point("a", 10),
      point("b", 0),
      point("c", 0),
    ]);

    expect(computed[2].conversionFromPrevious).toBeNull();
    expect(computed[2].dropOffRate).toBeNull();
  });

  it("clamps the drawn width but keeps a >100% conversion visible", () => {
    /*
     * Real pipelines grow: a re-opened requisition, a candidate re-entering.
     * The bar must stay inside the chart, but the anomaly is the finding and
     * rounding it to 100% would hide it.
     */
    const computed = funnelStages([point("a", 10), point("b", 25)]);

    expect(computed[1].widthRatio).toBe(1);
    expect(computed[1].conversionFromPrevious).toBe(250);
    expect(computed[1].dropOff).toBe(-15);
  });

  it("treats a negative stage as zero for geometry but reports it as measured", () => {
    const computed = funnelStages([point("a", 10), point("b", -4)]);

    expect(computed[1].widthRatio).toBe(0);
    expect(computed[1].value).toBe(-4);
  });

  it("treats a non-finite stage as zero", () => {
    const computed = funnelStages([point("a", 10), point("b", Number.NaN)]);
    expect(computed[1].value).toBe(0);
    expect(computed[1].widthRatio).toBe(0);
  });
});

describe("polarToCartesian", () => {
  it("puts angle zero at twelve o'clock and sweeps clockwise", () => {
    const top = polarToCartesian(0, 0, 10, 0);
    expect(top.x).toBeCloseTo(0, 6);
    expect(top.y).toBeCloseTo(-10, 6);

    const right = polarToCartesian(0, 0, 10, Math.PI / 2);
    expect(right.x).toBeCloseTo(10, 6);
    expect(right.y).toBeCloseTo(0, 6);
  });
});

describe("donutArcs", () => {
  const geometry = { innerRadius: 40, outerRadius: 70, cx: 100, cy: 100 };

  it("returns nothing for empty input", () => {
    expect(donutArcs([], geometry)).toEqual([]);
    expect(donutArcs(null, geometry)).toEqual([]);
  });

  it("apportions the full circle across the slices", () => {
    const arcs = donutArcs([point("a", 1), point("b", 1), point("c", 2)], geometry);
    const sweep = arcs.reduce((sum, arc) => sum + (arc.endAngle - arc.startAngle), 0);

    expect(sweep).toBeCloseTo(Math.PI * 2, 6);
    expect(arcs[2].share).toBe(50);
  });

  it("draws a sole 100% slice as a real ring rather than as nothing", () => {
    /*
     * With a single category the start and end coordinates of one arc are
     * identical and SVG draws an empty path. One department, one status — this
     * is the commonest donut there is.
     */
    const [only] = donutArcs([point("a", 5)], geometry);

    expect(only.share).toBe(100);
    expect(only.path).not.toBe("");
    expect(only.path.match(/A/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("sets the large-arc flag once a slice passes half the circle", () => {
    const arcs = donutArcs([point("big", 3), point("small", 1)], geometry);

    // "A rx ry rotation largeArc sweep x y" — the flag is the fourth number.
    expect(arcs[0].path).toMatch(/A 70 70 0 1 1/);
    expect(arcs[1].path).toMatch(/A 70 70 0 0 1/);
  });

  it("keeps zero-valued categories so they still reach the legend and table", () => {
    /*
     * "0 on unpaid leave" and "we do not track unpaid leave" are different
     * answers, and dropping the slice makes them identical.
     */
    const arcs = donutArcs([point("a", 5), point("zero", 0)], geometry);

    expect(arcs).toHaveLength(2);
    expect(arcs[1].path).toBe("");
    expect(arcs[1].startAngle).toBe(arcs[1].endAngle);
  });

  it("produces drawable, NaN-free output when every value is zero", () => {
    const arcs = donutArcs([point("a", 0), point("b", 0)], geometry);

    for (const arc of arcs) {
      expect(arc.share).toBe(0);
      expect(arc.path).toBe("");
      expect(Number.isNaN(arc.centroid.x)).toBe(false);
      expect(Number.isNaN(arc.centroid.y)).toBe(false);
    }
  });

  it("ignores negative values when apportioning the circle", () => {
    const arcs = donutArcs([point("a", 10), point("b", -5)], geometry);

    expect(arcs[0].share).toBe(100);
    expect(arcs[1].share).toBe(0);
  });

  it("never lets the pad angle consume the slice it separates", () => {
    // A huge pad on a tiny slice must not produce a negative sweep.
    const arcs = donutArcs([point("big", 1000), point("tiny", 1)], {
      ...geometry,
      padAngle: 1,
    });

    for (const arc of arcs) {
      expect(arc.endAngle).toBeGreaterThanOrEqual(arc.startAngle);
      expect(arc.path).not.toContain("NaN");
    }
  });

  it("puts the centroid between the two radii", () => {
    const [arc] = donutArcs([point("a", 1)], geometry);
    const distance = Math.hypot(arc.centroid.x - 100, arc.centroid.y - 100);

    expect(distance).toBeCloseTo(55, 3);
  });

  it("starts at twelve o'clock by default and honours an explicit start", () => {
    expect(donutArcs([point("a", 1)], geometry)[0].startAngle).toBe(0);
    expect(
      donutArcs([point("a", 1)], { ...geometry, startAngle: Math.PI })[0].startAngle,
    ).toBe(Math.PI);
  });

  it("tolerates an inner radius larger than the outer one", () => {
    const arcs = donutArcs([point("a", 1)], {
      innerRadius: 90,
      outerRadius: 10,
      cx: 0,
      cy: 0,
    });

    expect(arcs[0].path).not.toContain("NaN");
  });
});

describe("seriesExtent", () => {
  it("always includes zero so a small variation does not read as a collapse", () => {
    /*
     * An axis starting at 94 turns a 1% movement into a cliff. Charts wanting
     * a non-zero baseline pass their own domain instead.
     */
    expect(
      seriesExtent([{ key: "a", label: "A", points: [point("x", 94), point("y", 95)] }]),
    ).toEqual([0, 95]);
  });

  it("spans negative values", () => {
    expect(
      seriesExtent([{ key: "a", label: "A", points: [point("x", -3), point("y", 8)] }]),
    ).toEqual([-3, 8]);
  });

  it("returns a zero extent for no data at all", () => {
    expect(seriesExtent([])).toEqual([0, 0]);
    expect(seriesExtent(null)).toEqual([0, 0]);
    expect(seriesExtent([{ key: "a", label: "A", points: [] }])).toEqual([0, 0]);
  });

  it("ignores non-finite values", () => {
    expect(
      seriesExtent([
        { key: "a", label: "A", points: [point("x", Number.NaN), point("y", 4)] },
      ]),
    ).toEqual([0, 4]);
  });
});
