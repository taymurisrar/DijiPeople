import { resolveCustomFieldListFilters } from "./custom-field-list-filters";

describe("resolveCustomFieldListFilters", () => {
  it("forwards custom column filters as one customFilters value", () => {
    const resolved = resolveCustomFieldListFilters(
      {
        regionFilter: "north",
        regionFilterOperator: "equals",
        scoreFilterOperator: "isEmpty",
        nameFilter: "Ann",
      },
      ["region", "score", "badge"],
    );
    expect(JSON.parse(resolved.customFilters)).toEqual([
      { field: "region", operator: "equals", value: "north" },
      { field: "score", operator: "isEmpty" },
    ]);
    expect(resolved.tableFilters.map((filter) => filter.columnKey)).toEqual([
      "region",
      "score",
    ]);
    expect(resolved.searchParams).toEqual({
      regionFilter: "north",
      regionFilterOperator: "equals",
      scoreFilterOperator: "isEmpty",
    });
  });

  it("sends nothing when no custom column is filtered", () => {
    expect(
      resolveCustomFieldListFilters({ nameFilter: "Ann" }, ["region"])
        .customFilters,
    ).toBe("");
  });

  it("keeps the upper bound of a range", () => {
    const resolved = resolveCustomFieldListFilters(
      {
        joinedFilter: "2026-01-01",
        joinedFilterOperator: "between",
        joinedFilterTo: "2026-02-01",
      },
      ["joined"],
    );
    expect(JSON.parse(resolved.customFilters)[0]).toEqual({
      field: "joined",
      operator: "between",
      value: "2026-01-01",
      valueTo: "2026-02-01",
    });
  });
});
