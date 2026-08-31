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

/*
 * The Reports & Analytics entry.
 *
 * `lib/security-keys.ts` is a hand-maintained mirror of the API's permission
 * constants with no generator behind it, so the failure mode this guards is a
 * quiet one: a key that is misspelled here does not error anywhere. It makes
 * `requiredAnyPermissions` list a permission nobody holds, the sidebar entry
 * disappears for every role that had it, and the only symptom is a customer
 * saying reports "went away".
 *
 * The label is asserted for a duller reason: it is the only visible statement
 * that this is no longer the four-summary page it replaced, and it is the kind
 * of string a later edit reverts without noticing.
 */
describe("the Reports & Analytics navigation entry", () => {
  const entry = dashboardNavItems.find((item) => item.href === "/reports");

  it("exists", () => {
    expect(entry).toBeDefined();
  });

  it("is named for what the workspace now is", () => {
    expect(entry?.label).toBe("Reports & Analytics");
  });

  it("offers itself to anyone holding the reporting permission", () => {
    /*
     * Exactly the key the API's `/reporting` controller requires. Hard-coded as
     * a literal rather than referencing PERMISSION_KEYS, so a typo introduced
     * in the mirror fails here instead of being compared against itself.
     */
    expect(entry?.requiredAnyPermissions).toContain("reports.read");
  });

  it("keeps the pre-existing keys, so no role loses the entry", () => {
    /*
     * This entry predates the reporting module and some roles were provisioned
     * against these. Dropping them would take the sidebar link away from those
     * roles in the same release that gave them somewhere better to go.
     */
    expect(entry?.requiredAnyPermissions).toEqual(
      expect.arrayContaining([
        "employees.read.all",
        "reports.leave-requests.read",
        "reports.attendance.read",
      ]),
    );
  });

  it("stays hidden from self-service users and scoped to a business unit", () => {
    expect(entry?.hiddenForSelfService).toBe(true);
    expect(entry?.requiresBusinessUnitScope).toBe(true);
  });
});

/*
 * The reporting sub-navigation is a row of pills inside the workspace, exactly
 * as Payroll's is — it is not expressed in `dashboardNavItems`.
 *
 * `DashboardNavItem` is flat and has no children concept, and adding one to
 * express a single module's sections would change a type every module depends
 * on. This asserts the decision rather than the absence: if someone later adds
 * `/reports/library` and friends to the sidebar, the sidebar grows five entries
 * for one module and this fails.
 */
describe("reporting sections are not sidebar entries", () => {
  it("contributes exactly one entry under /reports", () => {
    const reportRoutes = dashboardNavItems.filter((item) =>
      item.href.startsWith("/reports"),
    );

    expect(reportRoutes).toHaveLength(1);
    expect(reportRoutes[0].href).toBe("/reports");
  });
});
