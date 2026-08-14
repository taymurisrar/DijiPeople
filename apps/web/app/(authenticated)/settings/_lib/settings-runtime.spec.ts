import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  DEDICATED_PAGE_KEYS,
  getSettingsRuntimeItem,
  settingsRuntimeCategories,
  settingsRuntimeItems,
} from "./settings-runtime";

/**
 * Every settings link must lead somewhere.
 *
 * This exists because the Integrations items on the General Setup page linked to
 * a derived runtime URL while their real pages lived elsewhere, so eight menu
 * entries went nowhere and nothing failed. Typecheck cannot catch that: both are
 * valid strings. Only asking the filesystem can.
 */

/** Where the App Router looks for the page behind a `/settings/...` route. */
function pageFileFor(route: string): string {
  return join(
    __dirname,
    "..",
    "..",
    "..",
    "(authenticated)",
    ...route.replace(/^\//, "").split("/"),
    "page.tsx",
  );
}

describe("settings runtime routes", () => {
  it("gives every purpose-built item a page that exists on disk", () => {
    const dedicated = settingsRuntimeItems.filter((item) =>
      DEDICATED_PAGE_KEYS.has(item.key),
    );

    // The set is not empty, or this assertion would pass by describing nothing.
    expect(dedicated.length).toBe(DEDICATED_PAGE_KEYS.size);

    const missing = dedicated
      .filter((item) => !existsSync(pageFileFor(item.route)))
      .map((item) => `${item.key} -> ${item.route}`);

    expect(missing).toEqual([]);
  });

  it("links the attendance integrations to the pages that answer them", () => {
    // The original defect, named item by item. Each of these linked to a derived
    // /settings/general-setup/integrations/<key> path, which resolves to a
    // runtime list with no adapter behind it.
    const routeFor = (key: string) =>
      settingsRuntimeItems.find((item) => item.key === key)?.route;

    expect(routeFor("attendance-integrations-overview")).toBe(
      "/settings/integrations/attendance",
    );
    expect(routeFor("attendance-integrations")).toBe(
      "/settings/integrations/attendance/integrations",
    );
    expect(routeFor("attendance-devices")).toBe(
      "/settings/integrations/attendance/devices",
    );
    expect(routeFor("attendance-employee-mapping")).toBe(
      "/settings/integrations/attendance/mapping",
    );
    expect(routeFor("attendance-provisioning")).toBe(
      "/settings/integrations/attendance/provisioning",
    );
    expect(routeFor("attendance-gateways")).toBe(
      "/settings/integrations/attendance/gateways",
    );
    expect(routeFor("attendance-sync-history")).toBe(
      "/settings/integrations/attendance/sync-history",
    );
    expect(routeFor("apps-downloads")).toBe("/settings/apps");
  });

  it("keeps a multi-item group reachable, by never naming one after an item", () => {
    /*
     * `[category]/[settingGroup]` resolves an ITEM before a group, so a group key
     * that matches an item's key redirects into that child and the group's own
     * landing page can never be opened.
     *
     * Only asserted for groups with more than one item. General Setup's `tenant`
     * group is named after its single `tenant` item, so opening it lands on
     * Tenant Profile — which is the only thing that landing page could have
     * offered. Losing a list of one is not losing anything; losing a list of six
     * is how the Integrations group would have become unreachable.
     */
    const shadowed: string[] = [];

    for (const category of settingsRuntimeCategories) {
      for (const group of category.groups) {
        if (group.items.length < 2) continue;
        const collision = getSettingsRuntimeItem(category.key, group.key);
        if (
          collision &&
          collision.route !== `/settings/${category.key}/${group.key}`
        ) {
          shadowed.push(`${category.key}/${group.key} -> ${collision.key}`);
        }
      }
    }

    expect(shadowed).toEqual([]);
  });

  it("keeps the attendance integrations together, out of General Setup", () => {
    const integrations = settingsRuntimeCategories.find(
      (category) => category.key === "integrations",
    );

    expect(integrations).toBeDefined();
    expect(integrations!.groups.map((group) => group.key)).toEqual([
      "attendance-capture",
      "on-premise",
    ]);

    // Half of General Setup used to be device plumbing.
    const generalSetup = settingsRuntimeCategories.find(
      (category) => category.key === "general-setup",
    );
    expect(
      generalSetup!.groups.some((group) => group.key === "integrations"),
    ).toBe(false);
  });

  it("routes every item to a settings URL", () => {
    const stray = settingsRuntimeItems
      .filter((item) => !item.route.startsWith("/settings/"))
      .map((item) => `${item.key} -> ${item.route}`);

    expect(stray).toEqual([]);
  });
});
