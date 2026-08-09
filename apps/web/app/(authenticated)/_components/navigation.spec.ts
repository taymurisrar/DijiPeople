import {
  applyDashboardNavOverrides,
  dashboardNavItems,
  type DashboardNavItem,
  type DashboardNavOverride,
} from "./navigation";

/*
 * The sidebar merge lays a tenant's saved changes over the code-defined list.
 * Its dangerous failure is not a crash — it is quietly dropping an entry, or
 * resurrecting one for an href the product no longer ships.
 */

const ITEMS: DashboardNavItem[] = [
  { href: "/", label: "Overview", description: "" },
  { href: "/employees", label: "Employees", description: "" },
  { href: "/reports", label: "Reports", description: "" },
];

function labels(result: readonly DashboardNavItem[]) {
  return result.map((item) => item.label);
}

describe("applyDashboardNavOverrides", () => {
  it("returns the code list untouched when there are no overrides", () => {
    expect(labels(applyDashboardNavOverrides(ITEMS, []))).toEqual([
      "Overview",
      "Employees",
      "Reports",
    ]);
    expect(labels(applyDashboardNavOverrides(ITEMS, null))).toEqual([
      "Overview",
      "Employees",
      "Reports",
    ]);
  });

  it("hides an entry the tenant hid", () => {
    const overrides: DashboardNavOverride[] = [
      { itemKey: "/reports", isHidden: true },
    ];
    expect(labels(applyDashboardNavOverrides(ITEMS, overrides))).toEqual([
      "Overview",
      "Employees",
    ]);
  });

  it("renames an entry without changing its href", () => {
    const result = applyDashboardNavOverrides(ITEMS, [
      { itemKey: "/reports", label: "Insights" },
    ]);
    const renamed = result.find((item) => item.href === "/reports");
    expect(renamed?.label).toBe("Insights");
  });

  it("ignores a blank label rather than blanking the entry", () => {
    const result = applyDashboardNavOverrides(ITEMS, [
      { itemKey: "/reports", label: "   " },
    ]);
    expect(result.find((item) => item.href === "/reports")?.label).toBe(
      "Reports",
    );
  });

  it("never adds an entry for an href the code no longer ships", () => {
    /* Otherwise removing a module leaves tenants with a dead link. */
    const result = applyDashboardNavOverrides(ITEMS, [
      { itemKey: "/retired-module", label: "Ghost" },
    ]);
    expect(labels(result)).toEqual(["Overview", "Employees", "Reports"]);
  });

  it("places an explicitly ordered entry ahead of unordered ones", () => {
    const result = applyDashboardNavOverrides(ITEMS, [
      { itemKey: "/reports", sortOrder: 0 },
    ]);
    expect(labels(result)[0]).toBe("Reports");
  });

  it("keeps code order among entries the tenant never placed", () => {
    const result = applyDashboardNavOverrides(ITEMS, [
      { itemKey: "/employees", isHidden: false },
    ]);
    expect(labels(result)).toEqual(["Overview", "Employees", "Reports"]);
  });

  it("treats sortOrder 0 as a real position, not as absent", () => {
    const result = applyDashboardNavOverrides(ITEMS, [
      { itemKey: "/reports", sortOrder: 0 },
      { itemKey: "/", sortOrder: 1 },
    ]);
    expect(labels(result).slice(0, 2)).toEqual(["Reports", "Overview"]);
  });

  it("lets a tenant rule replace the code rule on an entry", () => {
    const coded: DashboardNavItem[] = [
      {
        href: "/payroll",
        label: "Payroll",
        description: "",
        visibilityRules: [{ operator: "has-any-role", roleKeys: ["hr"] }],
      },
    ];
    const result = applyDashboardNavOverrides(coded, [
      {
        itemKey: "/payroll",
        visibilityRules: [
          { operator: "has-any-role", roleKeys: ["payroll-manager"] },
        ],
      },
    ]);
    expect(result[0].visibilityRules?.[0].roleKeys).toEqual([
      "payroll-manager",
    ]);
  });

  it("keeps the code rule when the tenant saved an empty rule list", () => {
    const coded: DashboardNavItem[] = [
      {
        href: "/payroll",
        label: "Payroll",
        description: "",
        visibilityRules: [{ operator: "has-any-role", roleKeys: ["hr"] }],
      },
    ];
    const result = applyDashboardNavOverrides(coded, [
      { itemKey: "/payroll", visibilityRules: [] },
    ]);
    expect(result[0].visibilityRules?.[0].roleKeys).toEqual(["hr"]);
  });
});

describe("dashboardNavItems", () => {
  it("has a unique href per entry, since href is the override key", () => {
    const hrefs = dashboardNavItems.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
