import {
  dashboardNavItems,
  resolveDashboardNavCatalog,
  resolveVisibleDashboardNavItems,
} from "@/app/(authenticated)/_components/navigation";
import { ROLE_KEYS } from "@/lib/security-keys";
import {
  buildCustomModuleNavItems,
  composeDashboardNavItems,
  customModuleHref,
  CUSTOM_RECORDS_READ_PERMISSION,
  type CustomModuleSummary,
} from "./custom-module-navigation";

/*
 * BUG-3494 / ADR-0016 — sidebar composition for published custom modules.
 *
 * Which modules are published and active is decided by the API
 * (`GET /metadata/custom-modules`, covered by custom-module-runtime.service.spec.ts
 * for the published / draft / inactive cases). What this file owns is what the
 * sidebar does with that answer: add an entry per module, before overrides, and
 * show it only to someone who can read custom records.
 */

const QA_ASSET: CustomModuleSummary = {
  moduleKey: "qaAsset",
  displayName: "QA Asset",
  pluralDisplayName: "QA Assets",
};
const VEHICLE: CustomModuleSummary = {
  moduleKey: "vehicle",
  displayName: "Vehicle",
  pluralDisplayName: "",
};

const BUSINESS_UNIT_ACCESS = {
  accessibleBusinessUnitIds: ["bu-1"],
} as never;

function visibleFor(
  input: Partial<Parameters<typeof resolveVisibleDashboardNavItems>[0]>,
) {
  return resolveVisibleDashboardNavItems({
    enabledFeatureKeys: null,
    isReportingManager: false,
    isSelfService: false,
    permissionKeys: [],
    roleKeys: [],
    businessUnitAccess: BUSINESS_UNIT_ACCESS,
    ...input,
  });
}

function hrefs(items: ReadonlyArray<{ href: string }>) {
  return items.map((item) => item.href);
}

describe("buildCustomModuleNavItems", () => {
  it("builds one entry per module under the stable /custom-modules route", () => {
    const items = buildCustomModuleNavItems([QA_ASSET, VEHICLE]);
    expect(items).toEqual([
      expect.objectContaining({
        href: "/custom-modules/qaAsset",
        label: "QA Assets",
        requiredAnyPermissions: [CUSTOM_RECORDS_READ_PERMISSION],
      }),
      expect.objectContaining({
        href: "/custom-modules/vehicle",
        label: "Vehicle",
      }),
    ]);
  });

  it("adds nothing when the API resolved no published modules", () => {
    expect(buildCustomModuleNavItems([])).toEqual([]);
    expect(buildCustomModuleNavItems(null)).toEqual([]);
  });

  it("ignores blank and duplicate keys", () => {
    const items = buildCustomModuleNavItems([
      QA_ASSET,
      { ...QA_ASSET, displayName: "Again" },
      { moduleKey: "  ", displayName: "Blank" },
    ]);
    expect(hrefs(items)).toEqual(["/custom-modules/qaAsset"]);
  });

  it("encodes the key into the href", () => {
    expect(customModuleHref("a b")).toBe("/custom-modules/a%20b");
  });
});

describe("composeDashboardNavItems", () => {
  it("places custom entries immediately before Settings", () => {
    const catalog = composeDashboardNavItems(
      dashboardNavItems,
      buildCustomModuleNavItems([QA_ASSET]),
    );
    const settingsIndex = catalog.findIndex((item) => item.href === "/settings");
    expect(catalog[settingsIndex - 1]?.href).toBe("/custom-modules/qaAsset");
    expect(catalog).toHaveLength(dashboardNavItems.length + 1);
  });

  it("leaves the fixed catalog untouched when there are no custom modules", () => {
    expect(resolveDashboardNavCatalog([])).toEqual(dashboardNavItems);
  });

  it("never lets a custom entry shadow a product href", () => {
    const catalog = composeDashboardNavItems(dashboardNavItems, [
      { href: "/projects", label: "Impostor", description: "" },
    ]);
    expect(catalog.filter((item) => item.href === "/projects")).toHaveLength(1);
    expect(catalog.find((item) => item.href === "/projects")?.label).toBe(
      "Projects",
    );
  });
});

describe("resolveVisibleDashboardNavItems with custom modules", () => {
  it("shows a published module to a user who can read custom records", () => {
    const items = visibleFor({
      customModules: [QA_ASSET],
      permissionKeys: [CUSTOM_RECORDS_READ_PERMISSION],
    });
    expect(hrefs(items)).toContain("/custom-modules/qaAsset");
  });

  it("hides it from a user without custom-records.read", () => {
    const items = visibleFor({
      customModules: [QA_ASSET],
      permissionKeys: ["projects.read"],
    });
    expect(hrefs(items)).not.toContain("/custom-modules/qaAsset");
  });

  it("shows it to a privileged administrator", () => {
    const items = visibleFor({
      customModules: [QA_ASSET],
      roleKeys: [ROLE_KEYS.SYSTEM_ADMIN],
    });
    expect(hrefs(items)).toContain("/custom-modules/qaAsset");
  });

  it("shows nothing for a module the API did not return (draft or inactive)", () => {
    const items = visibleFor({
      customModules: [],
      permissionKeys: [CUSTOM_RECORDS_READ_PERMISSION],
    });
    expect(hrefs(items).some((href) => href.startsWith("/custom-modules"))).toBe(
      false,
    );
  });

  it("applies a Sidebar Designer hide to the custom entry", () => {
    const items = visibleFor({
      customModules: [QA_ASSET],
      roleKeys: [ROLE_KEYS.SYSTEM_ADMIN],
      overrides: [{ itemKey: "/custom-modules/qaAsset", isHidden: true }],
    });
    expect(hrefs(items)).not.toContain("/custom-modules/qaAsset");
  });

  it("applies a Sidebar Designer rename and order to the custom entry", () => {
    const items = visibleFor({
      customModules: [QA_ASSET],
      roleKeys: [ROLE_KEYS.SYSTEM_ADMIN],
      overrides: [
        { itemKey: "/custom-modules/qaAsset", label: "Assets", sortOrder: 0 },
      ],
    });
    expect(items[0]).toEqual(
      expect.objectContaining({
        href: "/custom-modules/qaAsset",
        label: "Assets",
      }),
    );
  });

  it("applies a Sidebar Designer audience rule to the custom entry, even for admins", () => {
    const items = visibleFor({
      customModules: [QA_ASSET],
      roleKeys: [ROLE_KEYS.SYSTEM_ADMIN],
      overrides: [
        {
          itemKey: "/custom-modules/qaAsset",
          visibilityRules: [{ operator: "has-role", roleKeys: ["payroll-admin"] }],
        },
      ],
    });
    expect(hrefs(items)).not.toContain("/custom-modules/qaAsset");
  });
});
