import { FEATURE_KEYS } from "@/lib/security-keys";
import {
  FEATURE_LABELS,
  SETTINGS_CORE,
  SETTINGS_ITEM_ENTITLEMENTS,
  isSettingsItemEntitled,
  missingCapabilityLabels,
} from "./settings-entitlements";
import {
  resolveVisibleSettingsRuntime,
  settingsRuntimeItems,
  SettingsEntitlementsUnavailableError,
} from "./settings-runtime";

/*
 * The Starter plan's capability set, from
 * `services/api/src/modules/super-admin/plans.catalog.ts`. Written out rather
 * than imported because the two workspaces do not share a module and a copy
 * that drifts is the thing these tests exist to catch — if Starter's contents
 * change, a test naming the old set should fail loudly rather than follow.
 */
const STARTER = [
  FEATURE_KEYS.EMPLOYEES,
  FEATURE_KEYS.ORGANIZATION,
  FEATURE_KEYS.LEAVE,
  FEATURE_KEYS.ATTENDANCE,
  FEATURE_KEYS.DOCUMENTS,
  FEATURE_KEYS.NOTIFICATIONS,
  FEATURE_KEYS.BRANDING,
];

const EVERY_CAPABILITY = Object.values(FEATURE_KEYS);

const ALL_PERMISSIONS = [
  ...new Set(
    settingsRuntimeItems.flatMap((item) => item.requiredAnyPermissions ?? []),
  ),
];

const ADMIN_ROLES = ["global-admin", "system-admin", "system-customizer"];

describe("settings entitlement attribution", () => {
  /*
   * The structural guard. A test naming the pages that happen to be attributed
   * today goes green while the next settings page ships unattributed — which is
   * the defect class BUG-1952 is: something built, and nothing reaching it.
   */
  it("attributes every settings item the IA places", () => {
    const unattributed = settingsRuntimeItems
      .map((item) => item.key)
      .filter((key) => SETTINGS_ITEM_ENTITLEMENTS[key] === undefined);

    expect(unattributed).toEqual([]);
  });

  it("attributes nothing the IA does not place", () => {
    const placed = new Set(settingsRuntimeItems.map((item) => item.key));
    const stray = Object.keys(SETTINGS_ITEM_ENTITLEMENTS).filter(
      (key) => !placed.has(key),
    );

    expect(stray).toEqual([]);
  });

  it("attributes only to capability keys the catalog defines", () => {
    const known = new Set<string>([...EVERY_CAPABILITY, SETTINGS_CORE]);
    const unknown = Object.entries(SETTINGS_ITEM_ENTITLEMENTS)
      .filter(([, entitlement]) => !known.has(entitlement))
      .map(([key]) => key);

    expect(unknown).toEqual([]);
  });

  it("gives every capability key a label the blocked state can print", () => {
    for (const key of EVERY_CAPABILITY) {
      expect(FEATURE_LABELS[key]).toBeTruthy();
    }
  });
});

describe("isSettingsItemEntitled", () => {
  it("allows a core page on a plan that includes nothing", () => {
    expect(isSettingsItemEntitled("tenant", [])).toBe(true);
  });

  it("allows the subscription page on a plan that includes nothing", () => {
    /*
     * The upgrade surface, and the page every "not included in your plan" state
     * links to. If this ever fails, a tenant whose plan lost a capability has no
     * in-product way to see what it lost or to get it back.
     */
    expect(isSettingsItemEntitled("subscription", [])).toBe(true);
  });

  it("refuses a capability page the plan omits", () => {
    expect(isSettingsItemEntitled("payroll-periods", STARTER)).toBe(false);
  });

  it("allows a capability page the plan includes", () => {
    expect(isSettingsItemEntitled("leave-types", STARTER)).toBe(true);
  });

  /*
   * Fail closed on the unknown. The specs above make an unattributed item
   * impossible in a built tree, but the two structures can only be compared at
   * test time — at runtime an unattributed page is an unanswered question about
   * what a customer bought, and the safe answer is no.
   */
  it("refuses an item nobody attributed", () => {
    expect(isSettingsItemEntitled("a-page-that-does-not-exist", STARTER)).toBe(
      false,
    );
  });
});

describe("the Starter leaks BUG-1952 recorded", () => {
  const starterCategories = () =>
    resolveVisibleSettingsRuntime(ALL_PERMISSIONS, ADMIN_ROLES, STARTER);

  it("removes the whole Payroll & Finance category", () => {
    expect(
      starterCategories().find((category) => category.key === "payroll"),
    ).toBeUndefined();
  });

  it("removes the Payroll Geography group but keeps Regional Operations", () => {
    const regional = starterCategories().find(
      (category) => category.key === "regional",
    );

    expect(regional).toBeDefined();
    expect(regional?.groups.map((group) => group.key)).not.toContain(
      "payroll-geography",
    );
    expect(regional?.groups.map((group) => group.key)).toContain("geography");
  });

  /*
   * The two within-group leaks, and the reason a category-level map would have
   * been insufficient. Both sit beside an entitled sibling, so their group and
   * their category both survive and only the row must go.
   */
  it("removes Timesheet Settings while keeping Attendance Settings beside it", () => {
    const attendanceGroup = starterCategories()
      .find((category) => category.key === "people")
      ?.groups.find((group) => group.key === "attendance");

    const keys = attendanceGroup?.items.map((item) => item.key) ?? [];

    expect(keys).toContain("attendance");
    expect(keys).not.toContain("timesheets");
  });

  /*
   * Apps & Modules holds exactly Recruitment and Desktop Agent, and Starter
   * sells neither, so the whole group collapses while General Setup survives on
   * its other groups.
   */
  it("removes the Apps & Modules group but keeps General Setup", () => {
    const generalSetup = starterCategories().find(
      (category) => category.key === "general-setup",
    );

    expect(generalSetup).toBeDefined();
    expect(generalSetup?.groups.map((group) => group.key)).not.toContain(
      "modules",
    );
    expect(generalSetup?.groups.map((group) => group.key)).toContain("tenant");
  });

  /*
   * The reverse leak, and the one an audit stopping at category level would
   * have caused rather than found: Subscription used to fall through into
   * Payroll & Finance, so gating that category would have hidden a Starter
   * tenant's own billing page behind the capability they would go there to buy.
   */
  it("keeps the subscription page, and out of the payroll category", () => {
    const generalSetup = starterCategories().find(
      (category) => category.key === "general-setup",
    );
    const planBilling = generalSetup?.groups.find(
      (group) => group.key === "plan-billing",
    );

    expect(planBilling?.items.map((item) => item.key)).toContain(
      "subscription",
    );
  });

  /*
   * Moved out of the payroll tree. On Starter it must survive, because Starter
   * buys Documents — if this fails, generic document templating has been taken
   * away from a plan that paid for it.
   */
  it("keeps Document Templates, which is Documents rather than Payroll", () => {
    const documentsGroup = starterCategories()
      .find((category) => category.key === "people")
      ?.groups.find((group) => group.key === "documents");

    expect(documentsGroup?.items.map((item) => item.key)).toContain(
      "document-templates",
    );
  });
});

describe("resolveVisibleSettingsRuntime", () => {
  it("shows every category on a plan that includes everything", () => {
    const categories = resolveVisibleSettingsRuntime(
      ALL_PERMISSIONS,
      ADMIN_ROLES,
      EVERY_CAPABILITY,
    );

    expect(categories.map((category) => category.key)).toContain("payroll");
    expect(categories.length).toBeGreaterThanOrEqual(11);
  });

  /*
   * No role bypasses the plan. An administrator legitimately overrides their own
   * tenant's permission model and cannot override their own tenant's contract —
   * the property whose absence in the sidebar was BUG-1952's fourth acceptance
   * criterion.
   */
  it("does not restore payroll for an administrator on Starter", () => {
    for (const role of ADMIN_ROLES) {
      const categories = resolveVisibleSettingsRuntime(
        ALL_PERMISSIONS,
        [role],
        STARTER,
      );

      expect(
        categories.find((category) => category.key === "payroll"),
      ).toBeUndefined();
    }
  });

  /*
   * Fail closed. `null` is "we could not read the plan", not "the plan is
   * empty", and the caller must render an error rather than a filtered tree.
   * Returning everything here is precisely the sidebar behaviour that let five
   * unbought modules through whenever the availability call failed.
   */
  it("throws rather than guessing when entitlements are unresolved", () => {
    expect(() =>
      resolveVisibleSettingsRuntime(ALL_PERMISSIONS, ADMIN_ROLES, null),
    ).toThrow(SettingsEntitlementsUnavailableError);
  });

  it("distinguishes an empty plan from an unresolved one", () => {
    /*
     * `[]` is legitimate: a subscription that is neither ACTIVE nor TRIALING
     * entitles nothing. It must resolve to the core pages, not throw.
     */
    const categories = resolveVisibleSettingsRuntime(
      ALL_PERMISSIONS,
      ADMIN_ROLES,
      [],
    );

    expect(categories.length).toBeGreaterThan(0);
    expect(
      categories.find((category) => category.key === "payroll"),
    ).toBeUndefined();
  });
});

describe("missingCapabilityLabels", () => {
  it("names each missing capability once, in order", () => {
    expect(
      missingCapabilityLabels(
        ["payroll-periods", "timesheets", "pay-components"],
        STARTER,
      ),
    ).toEqual(["Payroll", "Timesheets"]);
  });

  it("ignores core pages and entitled ones", () => {
    expect(missingCapabilityLabels(["tenant", "leave-types"], STARTER)).toEqual(
      [],
    );
  });
});
