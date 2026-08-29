import {
  applyDashboardNavOverrides,
  dashboardNavItems,
  resolveVisibleDashboardNavItems,
  type DashboardNavItem,
  type DashboardNavOverride,
} from "./navigation";
import { ROLE_KEYS } from "@/lib/security-keys";

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

/*
 * BUG-1952. The sidebar was the only consumer of plan entitlements, and it
 * skipped itself for the tenant’s own administrator roles — which is why every
 * Starter tenant admin was offered Timesheets, Projects, Payroll, Recruitment
 * and Onboarding, five modules that plan does not sell.
 *
 * An entitlement is a commercial boundary, not a permission. A tenant
 * administrator legitimately bypasses their own tenant’s permission model; they
 * cannot bypass their own tenant’s contract.
 */
describe("resolveVisibleDashboardNavItems plan entitlements", () => {
  const STARTER_KEYS = [
    "employees",
    "organization",
    "leave",
    "attendance",
    "documents",
    "notifications",
    "branding",
  ];

  function visibleHrefs(roleKeys: string[], enabledFeatureKeys: string[] | null) {
    return resolveVisibleDashboardNavItems({
      enabledFeatureKeys,
      isReportingManager: false,
      isSelfService: false,
      permissionKeys: [],
      roleKeys,
      businessUnitAccess: {
        accessibleBusinessUnitIds: ["bu-1"],
      } as never,
    }).map((item) => item.href);
  }

  const UNENTITLED_ON_STARTER = [
    "/timesheets",
    "/projects",
    "/payroll/cycles",
    "/recruitment",
    "/onboarding",
  ];

  it.each([
    ROLE_KEYS.GLOBAL_ADMIN,
    ROLE_KEYS.SYSTEM_ADMIN,
    ROLE_KEYS.SYSTEM_CUSTOMIZER,
  ])("hides unentitled modules from the privileged role %s", (roleKey) => {
    const hrefs = visibleHrefs([roleKey], STARTER_KEYS);

    for (const href of UNENTITLED_ON_STARTER) {
      expect(hrefs).not.toContain(href);
    }
  });

  it("still shows a privileged role the modules the plan does include", () => {
    const hrefs = visibleHrefs([ROLE_KEYS.GLOBAL_ADMIN], STARTER_KEYS);

    expect(hrefs).toContain("/employees");
    expect(hrefs).toContain("/leaves");
    expect(hrefs).toContain("/attendance");
  });

  it("shows every module once the plan enables them", () => {
    const hrefs = visibleHrefs(
      [ROLE_KEYS.GLOBAL_ADMIN],
      [...STARTER_KEYS, "timesheets", "projects", "payroll", "recruitment", "onboarding"],
    );

    for (const href of UNENTITLED_ON_STARTER) {
      expect(hrefs).toContain(href);
    }
  });

  /*
   * Deliberate, and the one place this layer still fails open. A null list
   * means the availability fetch failed, so there is no server decision to
   * mirror — and blanking a whole sidebar on a transient error is worse than
   * offering a link whose endpoint now answers TENANT_FEATURE_NOT_ENTITLED.
   */
  it("keeps navigation intact when entitlements could not be fetched", () => {
    const hrefs = visibleHrefs([ROLE_KEYS.GLOBAL_ADMIN], null);

    expect(hrefs).toContain("/employees");
    expect(hrefs).toContain("/payroll/cycles");
  });
});
