import {
  needsCustomFieldQuery,
  resolveCustomFieldListFilters,
} from "./custom-field-list-filters";

/*
 * With USE_ENTITY_DATA_API on, the page must still take the REST list for a
 * custom-field sort or filter — the entity data path silently ignored them.
 */
describe("needsCustomFieldQuery", () => {
  const fields = ["bp_score", "bp_region"];

  it("is true for a custom-field sort as the table writes it", () => {
    expect(needsCustomFieldQuery("bp_score desc", "", fields)).toBe(true);
  });

  it("is true for any custom filter", () => {
    expect(needsCustomFieldQuery("", '[{"field":"bp_region"}]', fields)).toBe(
      true,
    );
  });

  it("is false for a system sort or none", () => {
    expect(needsCustomFieldQuery("hireDate asc", "", fields)).toBe(false);
    expect(needsCustomFieldQuery("", "", fields)).toBe(false);
  });
});

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
