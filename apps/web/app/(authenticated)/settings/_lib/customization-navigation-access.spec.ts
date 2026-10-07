import pagePermissions from "../customization/_lib/customization-page-permissions.json";
import { canViewSettingsItem, settingsNavGroups } from "./settings-navigation";

/**
 * The Customization tiles must be visible to exactly the people whose page gate
 * lets them in — by permission, never by role (ADR-0013).
 *
 * This exists because Modules, Sidebar Designer, Packages and Publish Center
 * kept a Global Administrator / System Customizer role gate in the navigation
 * catalog after the layout and the API had dropped theirs. A System Admin with
 * every `customization.*` key could open /settings/customization/packages by
 * URL and yet never saw a link to it, so the whole package ALM surface (import,
 * export, release, uninstall) looked absent.
 */

type PageKey = keyof typeof pagePermissions.pages;

/** Navigation item key → the page gate it links to. */
const ITEM_PAGE: Record<string, PageKey> = {
  tables: "modules",
  sidebar: "sidebar",
  packages: "packages",
  "publish-center": "publishCenter",
};

const customizationItems =
  settingsNavGroups.find((group) => group.key === "customization")?.items ??
  [];

// A role that is NOT a customizer role: the demo workspace owner's.
const NON_CUSTOMIZER_ROLES = ["system-admin"];

describe("Customization navigation access", () => {
  it("names every item it checks, so the assertions describe something", () => {
    expect(customizationItems.map((item) => item.key).sort()).toEqual(
      Object.keys(ITEM_PAGE).sort(),
    );
  });

  it.each(Object.entries(ITEM_PAGE))(
    "shows %s to a non-customizer role holding exactly its page's keys",
    (itemKey, pageKey) => {
      const item = customizationItems.find((entry) => entry.key === itemKey)!;
      const required = pagePermissions.pages[pageKey].requires;

      expect(
        canViewSettingsItem(required, NON_CUSTOMIZER_ROLES, item),
      ).toBe(true);
    },
  );

  it.each(Object.entries(ITEM_PAGE))(
    "hides %s from someone its page would refuse",
    (itemKey, pageKey) => {
      const item = customizationItems.find((entry) => entry.key === itemKey)!;
      const required = pagePermissions.pages[pageKey].requires;
      // Drop the key that distinguishes this page from the section landing.
      // For pages whose only key is the section's, that leaves nothing at all.
      const distinguishing = required[required.length - 1];
      const missingOne = required.filter((key) => key !== distinguishing);

      expect(
        canViewSettingsItem(
          [...missingOne, "settings.read", "customization.access"],
          ["global-admin", "system-customizer"],
          item,
        ),
      ).toBe(false);
    },
  );

  it("gates no Customization item on role membership", () => {
    const roleGated = customizationItems
      .filter((item) => "requiredAnyRoles" in item && item.requiredAnyRoles)
      .map((item) => item.key);

    expect(roleGated).toEqual([]);
  });
});
