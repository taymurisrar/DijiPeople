import {
  ANALYTICS_SURFACES,
  buildBucketFilter,
  buildScopeFilters,
  describeActiveScope,
  getSurfaceDefinition,
  MAX_SURFACE_METRICS,
  NULL_BUCKET_KEY,
  ORGANISATION_SCOPE_FILTERS,
  resolveSurface,
  sortableFieldKeys,
  supportsBucketDrilldown,
} from "./analytics-surfaces";
import type {
  CatalogField,
  CatalogMetric,
  CatalogSource,
} from "./reporting-types";

/*
 * The resolution between "what a surface would like" and "what this caller can
 * actually reach" is where a reporting workspace goes quietly wrong.
 *
 * Every failure guarded here returns *plausible* output rather than an error: a
 * breakdown on a field the source does not have is a 400 on an ordinary
 * dropdown change; a trend on a metric outside the requested set silently draws
 * nothing; and a bucket filter built from the wrong half of a
 * key/label pair returns zero rows, which reads as "this department has no
 * records" rather than as a bug.
 */

function field(overrides: Partial<CatalogField> & { key: string }): CatalogField {
  return {
    label: overrides.key,
    description: "",
    type: "string",
    filterable: false,
    sortable: false,
    groupable: false,
    aggregatable: false,
    supportedAggregations: [],
    format: "plain",
    ...overrides,
  };
}

function metric(key: string): CatalogMetric {
  return {
    key,
    label: key,
    description: "",
    format: "plain",
    direction: "neutral",
    supportedDimensions: [],
    caveats: [],
  };
}

function source(
  key: string,
  overrides: Partial<CatalogSource> = {},
): CatalogSource {
  return {
    key,
    label: key,
    description: "",
    caveats: [],
    accessLevel: "TENANT",
    fields: [],
    metrics: [],
    ...overrides,
  };
}

describe("resolveSurface", () => {
  const workforce = getSurfaceDefinition("workforce")!;

  it("returns null when the caller can reach none of the surface's sources", () => {
    /*
     * The whole surface disappears rather than rendering empty charts. A
     * recruiter without desktop-analytics permission should not get a Desktop
     * page that looks like an outage.
     */
    expect(resolveSurface(workforce, [source("attendance")])).toBeNull();
  });

  it("prefers the surface's first reachable source, not the catalog's order", () => {
    const plan = resolveSurface(workforce, [
      source("workforce"),
      source("workforce_history"),
    ]);

    /*
     * `workforce` narrows on hire date and carries no history, so a period on
     * it answers a different question from the one a headcount trend asks.
     * The preference order in the definition is load-bearing.
     */
    expect(plan?.source.key).toBe("workforce_history");
  });

  it("honours an explicit source choice from the URL", () => {
    const plan = resolveSurface(
      workforce,
      [source("workforce"), source("workforce_history")],
      { source: "workforce" },
    );

    expect(plan?.source.key).toBe("workforce");
  });

  it("ignores a source the surface does not own rather than erroring", () => {
    const plan = resolveSurface(
      workforce,
      [source("workforce_history"), source("attendance")],
      { source: "attendance" },
    );

    /* A stale bookmark should render the surface, not a stack trace. */
    expect(plan?.source.key).toBe("workforce_history");
  });

  it("tops the KPI row up from the catalog when preferences are missing", () => {
    const plan = resolveSurface(workforce, [
      source("workforce_history", {
        metrics: [metric("a"), metric("b"), metric("c"), metric("d"), metric("e")],
      }),
    ]);

    /*
     * A tenant whose plan or permissions remove every preferred metric must not
     * get an empty tile row on a source that has five perfectly good ones.
     */
    expect(plan?.metricKeys).toHaveLength(MAX_SURFACE_METRICS);
    expect(plan?.metricKeys).toEqual(["a", "b", "c", "d"]);
  });

  it("never requests more metrics than the KPI row shows", () => {
    const plan = resolveSurface(workforce, [
      source("workforce_history", {
        metrics: [
          metric("workforce.historical_headcount"),
          metric("workforce.joiners"),
          metric("workforce.leavers"),
          metric("workforce.turnover_rate"),
          metric("workforce.net_change"),
        ],
      }),
    ]);

    expect(plan?.metricKeys.length).toBeLessThanOrEqual(MAX_SURFACE_METRICS);
  });

  it("keeps the trend metric inside the requested metric set", () => {
    /*
     * The server resolves `trendMetricKey` against the metrics the request
     * asked for. A trend naming anything else returns `trend: null` and the
     * chart draws nothing, with no error anywhere.
     */
    const plan = resolveSurface(
      workforce,
      [
        source("workforce_history", {
          metrics: [metric("workforce.joiners"), metric("workforce.leavers")],
        }),
      ],
      { trend: "workforce.turnover_rate" },
    );

    expect(plan?.metricKeys).toContain(plan?.trendMetricKey);
  });

  it("falls back through preference then first when no trend is chosen", () => {
    const plan = resolveSurface(workforce, [
      source("workforce_history", {
        metrics: [metric("workforce.joiners"), metric("workforce.historical_headcount")],
      }),
    ]);

    expect(plan?.trendMetricKey).toBe("workforce.historical_headcount");
  });

  it("only offers groupable fields as breakdowns", () => {
    const plan = resolveSurface(workforce, [
      source("workforce_history", {
        metrics: [metric("m")],
        fields: [
          field({ key: "workforce_history.employee_code" }),
          field({ key: "workforce_history.department", groupable: true }),
        ],
      }),
    ]);

    expect(plan?.breakdownOptions).toEqual([
      { value: "workforce_history.department", label: "workforce_history.department" },
    ]);
    expect(plan?.breakdownField).toBe("workforce_history.department");
  });

  it("rejects a groupBy the current source cannot group on", () => {
    /*
     * `groupBy` survives a source switch. A dimension that exists on Leave
     * requests but not on Leave balances would otherwise be sent verbatim and
     * refused with a 400 on what looks like an ordinary dropdown change.
     */
    const leave = getSurfaceDefinition("leave")!;
    const plan = resolveSurface(
      leave,
      [
        source("leave_requests", {
          metrics: [metric("m")],
          fields: [field({ key: "leave_requests.status", groupable: true })],
        }),
      ],
      { groupBy: "leave_consumption.leave_type" },
    );

    expect(plan?.breakdownField).toBe("leave_requests.status");
  });

  it("has no breakdown at all when nothing on the source is groupable", () => {
    const plan = resolveSurface(workforce, [
      source("workforce_history", {
        metrics: [metric("m")],
        fields: [field({ key: "workforce_history.tenure_days" })],
      }),
    ]);

    expect(plan?.breakdownField).toBeNull();
    expect(plan?.breakdownOptions).toEqual([]);
  });

  it("drops a scope filter whose dimension the source cannot filter on", () => {
    const plan = resolveSurface(workforce, [
      source("workforce_history", {
        metrics: [metric("m")],
        fields: [
          field({ key: "workforce_history.department", filterable: true }),
          /* Present but not filterable: offering it would do nothing. */
          field({ key: "workforce_history.team", filterable: false }),
        ],
      }),
    ]);

    expect(plan?.scopeFilters.map((binding) => binding.param)).toEqual(["dept"]);
  });

  it("keeps drill-down columns readable rather than dumping every field", () => {
    const plan = resolveSurface(workforce, [
      source("workforce_history", {
        metrics: [metric("m")],
        fields: [
          field({ key: "workforce_history.id" }),
          field({ key: "workforce_history.snapshot_date", type: "date" }),
          field({ key: "workforce_history.department", groupable: true }),
          ...Array.from({ length: 20 }, (_, index) =>
            field({ key: `workforce_history.extra_${index}` }),
          ),
        ],
      }),
    ]);

    expect(plan!.drillFieldKeys.length).toBeLessThanOrEqual(8);
    /* The bucket the reader clicked leads; the opaque uuid is never a column. */
    expect(plan!.drillFieldKeys[0]).toBe("workforce_history.department");
    expect(plan!.drillFieldKeys).not.toContain("workforce_history.id");
  });
});

describe("buildScopeFilters", () => {
  const bindings = ORGANISATION_SCOPE_FILTERS.slice(0, 2).map((binding) => ({
    ...binding,
    fieldKey: `workforce.${binding.fieldSuffix}`,
  }));

  it("builds one eq filter per selected dimension", () => {
    expect(buildScopeFilters({ dept: "Engineering" }, bindings)).toEqual([
      { field: "workforce.department", operator: "eq", value: "Engineering" },
    ]);
  });

  it("contributes nothing for an unset or blank selection", () => {
    /*
     * An `eq` against "" would match the rows whose department is literally
     * empty, which is not what an unset dropdown means.
     */
    expect(buildScopeFilters({ dept: "", bu: "   " }, bindings)).toEqual([]);
    expect(buildScopeFilters({}, bindings)).toEqual([]);
  });

  it("describes the active scope so a filtered total says it is filtered", () => {
    expect(describeActiveScope({ dept: "Engineering" }, bindings)).toBe(
      "Department: Engineering",
    );
    expect(describeActiveScope({}, bindings)).toBe("");
  });
});

describe("buildBucketFilter", () => {
  /*
   * The asymmetry this whole function exists for. A lookup dimension groups on
   * `departmentId` but *filters* on `department.name`, so the filter takes the
   * label; an enum groups and filters on the same column but is labelled
   * through `humanise()`, so the filter takes the key. Getting it backwards
   * returns zero rows, which looks like an answer.
   */

  it("filters a lookup dimension by its label, not its grouped id", () => {
    expect(
      buildBucketFilter(field({ key: "workforce.department", type: "string" }), {
        key: "0b6f2f1c-1111-2222-3333-444455556666",
        label: "Engineering",
      }),
    ).toEqual({
      field: "workforce.department",
      operator: "eq",
      value: "Engineering",
    });
  });

  it("filters an enum dimension by its key, not its humanised label", () => {
    expect(
      buildBucketFilter(field({ key: "attendance.status", type: "enum" }), {
        key: "PRESENT",
        label: "Present",
      }),
    ).toEqual({ field: "attendance.status", operator: "eq", value: "PRESENT" });
  });

  it("filters a boolean dimension by its key", () => {
    expect(
      buildBucketFilter(field({ key: "attendance.is_late", type: "boolean" }), {
        key: "true",
        label: "True",
      }),
    ).toEqual({ field: "attendance.is_late", operator: "eq", value: "true" });
  });

  it("uses isnull for the null bucket rather than eq against its label", () => {
    /*
     * "Unassigned" and "No team" are the engine's words for a null, not values
     * anything is equal to.
     */
    expect(
      buildBucketFilter(field({ key: "workforce.team", type: "string" }), {
        key: NULL_BUCKET_KEY,
        label: "No team",
      }),
    ).toEqual({ field: "workforce.team", operator: "isnull" });
  });

  it("refuses to build a filter for a dimension that cannot express one", () => {
    /*
     * A date bucket's key is a stringified Date and a numeric bucket's is a
     * raw number; `eq` against either is wrong, or accidentally right. The bars
     * are simply not selectable instead.
     */
    expect(supportsBucketDrilldown(field({ key: "d.date", type: "date" }))).toBe(
      false,
    );
    expect(
      buildBucketFilter(field({ key: "d.date", type: "date" }), {
        key: "2026-08-01",
        label: "1 Aug",
      }),
    ).toBeNull();
    expect(buildBucketFilter(undefined, { key: "x", label: "x" })).toBeNull();
  });
});

describe("the surface catalogue", () => {
  it("has a unique key per surface, since the key is the route segment", () => {
    const keys = ANALYTICS_SURFACES.map((surface) => surface.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("names a trend metric that is also one of its preferred KPI metrics", () => {
    /*
     * The trend is resolved against the requested metric set. A preferred trend
     * metric outside the preferred KPI list would only ever be reached by the
     * fallback, silently.
     */
    for (const surface of ANALYTICS_SURFACES) {
      if (!surface.preferredTrendMetricKey) continue;
      expect(surface.preferredMetricKeys.slice(0, MAX_SURFACE_METRICS)).toContain(
        surface.preferredTrendMetricKey,
      );
    }
  });

  it("says which kind of empty it is, never just 'no data'", () => {
    /*
     * The `test:empty-list-message` class of defect (BUG-1654 / 1752 / 1559):
     * a message that does not distinguish "nothing recorded" from "your filters
     * exclude everything" is wrong in both readings.
     */
    for (const surface of ANALYTICS_SURFACES) {
      expect(surface.emptyTitle).toMatch(/period/i);
      expect(surface.emptyTitle).not.toMatch(/^no data$/i);
      expect(surface.emptyDescription.length).toBeGreaterThan(40);
    }
  });

  it("states how each surface differs from the dashboard", () => {
    for (const surface of ANALYTICS_SURFACES) {
      expect(surface.versusDashboard.length).toBeGreaterThan(40);
    }
  });
});

describe("sortableFieldKeys", () => {
  /*
   * The engine sorts a field only when it is `sortable` AND reached without a
   * relation. The catalog sends the first half and not the second, so a header
   * on a relation-backed dimension is accepted, ignored, and gives no sign — the
   * reader clicks twice and concludes the rows were already sorted.
   */

  it("keeps a scalar field the engine will actually order by", () => {
    const keys = sortableFieldKeys(
      source("workforce", {
        fields: [
          field({ key: "workforce.hire_date", type: "date", sortable: true }),
          field({ key: "workforce.employee_code", sortable: true }),
        ],
      }),
    );

    expect(keys).toEqual(["workforce.hire_date", "workforce.employee_code"]);
  });

  it("drops a relation-backed dimension even though the catalog calls it sortable", () => {
    const keys = sortableFieldKeys(
      source("workforce", {
        fields: [
          field({ key: "workforce.department", sortable: true }),
          field({ key: "workforce.manager", sortable: true }),
          field({ key: "workforce.hire_date", type: "date", sortable: true }),
        ],
      }),
    );

    expect(keys).toEqual(["workforce.hire_date"]);
  });

  it("drops a field the catalog does not call sortable at all", () => {
    const keys = sortableFieldKeys(
      source("attendance", {
        fields: [field({ key: "attendance.worked_minutes", sortable: false })],
      }),
    );

    expect(keys).toEqual([]);
  });
});
