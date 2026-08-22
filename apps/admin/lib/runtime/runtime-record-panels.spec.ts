import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getPlatformModuleDefinition,
  type PlatformModuleKey,
} from "./platform-module-registry";

const RECORD_PAGE = join(
  __dirname,
  "../../app/_components/runtime/runtime-record-page.tsx",
);

/**
 * A record panel mounted on a tab the tab bar never renders is dead code.
 *
 * `RuntimeRecordPage` decides two things in two places, and they have to agree:
 *
 *  - which tabs survive the filter, from fields, related records, the timeline,
 *    or an explicit `hasRuntimePanel` allowance; and
 *  - which bespoke panels mount, each guarded on `activeTab === "<tab>"`.
 *
 * A tab carrying only a bespoke panel has no fields and no relationships, so it
 * is filtered out as empty — and its panel then waits on an `activeTab` value
 * nothing can select. The screen loses a whole capability and nothing fails:
 * no error, no empty state, just a tab that is not there.
 *
 * That has now happened twice on the same module. `entitlements` was allowed
 * after plan capabilities became uneditable outside the legacy screen, and
 * `pricing` was left out of the same fix — so `PlanPriceManager` sat mounted
 * behind an unreachable tab and the only route to plan price configuration was
 * `/plans/<id>?workspace=legacy-commerce`, a query parameter nothing links to.
 * That was reported as "where did the price configuration go from the Plan
 * module", which is the mildest way this class of defect gets found.
 *
 * So the rule is derived from the file rather than restated here: every panel
 * mount must land on a tab that can actually be reached. Adding a panel without
 * an allowance fails here instead of in a browser.
 */
describe("runtime record page panels are reachable", () => {
  const source = readFileSync(RECORD_PAGE, "utf8");

  it("reads the file it is asserting against", () => {
    // A path that stops resolving would otherwise make every assertion below
    // pass over an empty string.
    expect(source).toContain("const hasRuntimePanel");
    expect(source).toContain("export function RuntimeRecordPage");
  });

  /**
   * Every `moduleKey === "x" && … activeTab === "y"` panel guard in the file.
   *
   * Matched as a pair rather than separately: `activeTab` alone would also
   * catch the tab-bar's own comparisons, which are not panel mounts.
   */
  const mounts = [
    ...source.matchAll(
      /moduleKey === "([a-z-]+)"[^?]*?activeTab === "([a-zA-Z-]+)"/g,
    ),
  ].map(([, moduleKey, tab]) => ({
    moduleKey: moduleKey as PlatformModuleKey,
    tab: tab!,
  }));

  it("finds the panel mounts at all", () => {
    // Guards the regex itself. If the file is refactored into a shape this no
    // longer matches, an empty list must fail rather than vacuously pass.
    expect(mounts.length).toBeGreaterThan(0);
    expect(mounts).toContainEqual({ moduleKey: "plans", tab: "pricing" });
  });

  /** The `hasRuntimePanel` expression, isolated from the rest of the file. */
  const allowance = source.slice(
    source.indexOf("const hasRuntimePanel"),
    source.indexOf("return hasFields || hasRelationship"),
  );

  it.each(mounts)(
    "mounts $moduleKey/$tab on a tab that survives the filter",
    ({ moduleKey, tab }) => {
      const definition = getPlatformModuleDefinition(moduleKey);
      const detail =
        definition.forms.find((form) => form.key === "detail") ??
        definition.forms[0];

      // A tab the filter keeps for its own reasons needs no allowance.
      const hasFields = detail.fields.some(
        (field) => field.tab === tab && !field.hidden,
      );
      const hasRelationship = Boolean(
        definition.relatedRecords?.some(
          (relationship) => relationship.tab === tab,
        ),
      );
      if (hasFields || hasRelationship) return;

      /*
       * Otherwise the tab exists only because of its panel, and the filter has
       * to be told so explicitly. Both spellings the file uses count: a direct
       * `tab.key === "x"` and membership of a list.
       */
      const named =
        allowance.includes(`tab.key === "${tab}"`) ||
        new RegExp(`"${tab}"[^)]*\\.includes\\(tab\\.key\\)`).test(allowance) ||
        new RegExp(`\\[[^\\]]*"${tab}"[^\\]]*\\]\\.includes\\(tab\\.key\\)`).test(
          allowance,
        );

      expect([`${moduleKey}/${tab}`, named]).toEqual([
        `${moduleKey}/${tab}`,
        true,
      ]);
    },
  );

  it("keeps the Pricing tab on the plans record page", () => {
    /*
     * The specific regression, named rather than left to the generic case
     * above. Plan price configuration is the only place the amounts checkout
     * charges can be edited, and it was unreachable in production.
     */
    const definition = getPlatformModuleDefinition("plans");
    const detail = definition.forms.find((form) => form.key === "detail")!;
    expect(detail.tabs?.map((tab) => tab.key)).toContain("pricing");
    expect(allowance).toContain("pricing");
  });
});
