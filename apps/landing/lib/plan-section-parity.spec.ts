import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The home page and `/plans` must describe a plan the same way.
 *
 * The home preview carried a name, a price and a button, and nothing about what
 * the price bought — so the only way to learn what separated Starter from
 * Growth was to leave the page. `/plans` had the feature list all along; the two
 * had simply drifted.
 *
 * **This is asserted from source because `apps/landing` has no jsdom.** That is
 * a deliberate scope decision recorded on TASK-0008 WP-11, not an oversight, and
 * it means a rendering assertion is unavailable here. What can still be proven
 * is the thing that actually broke: that both surfaces derive their feature list
 * from the same helper rather than growing separate ones. A shared helper is
 * what makes them agree; two hand-rolled lists is how they diverged.
 *
 * The parity that matters is *derivation*, not markup. These are different
 * layouts on purpose — the home page is a preview, `/plans` is the full
 * comparison — and asserting identical JSX would forbid the difference the two
 * pages are supposed to have.
 */
describe("home and /plans describe plans from the same source", () => {
  const read = (path: string) =>
    readFileSync(join(__dirname, "..", path), "utf8");

  const preview = read("app/_components/plan-preview.tsx");
  const plansPage = read("app/plans/plans-experience.tsx");

  const SHARED_DERIVATIONS = [
    // The feature list itself, and the "Everything in X, plus" ladder.
    "incrementalFeatures",
    "plansAreCumulative",
    // Already shared before this, and asserted so they cannot be un-shared.
    "highlightLabel",
    "resolvePlanCta",
    "findOffer",
  ];

  it.each(SHARED_DERIVATIONS)("both surfaces use %s", (helper) => {
    expect(preview).toContain(helper);
    expect(plansPage).toContain(helper);
  });

  it("the home preview renders incremental features, not just a price", () => {
    // The specific regression: a card with a number and no capabilities.
    expect(preview).toContain("incrementalFeatures(plans, index, featureCatalog)");
    expect(preview).toContain("Everything in ${plans[index - 1].name}, plus");
  });

  it("both use the same phrasing for the first plan in the ladder", () => {
    // A visitor reading both pages should recognise the second, not re-learn it.
    for (const source of [preview, plansPage]) {
      expect(source).toContain('"Includes"');
    }
  });

  it("neither hand-rolls a feature list from plan.features", () => {
    /*
     * `incrementalFeatures` maps catalog keys to labels and subtracts the
     * previous tier. Reading `plan.features` directly would render raw keys and
     * repeat every inherited capability on every card — which is exactly the
     * shortcut a future edit is most likely to take.
     */
    for (const source of [preview, plansPage]) {
      expect(source).not.toMatch(/plan\.features\.map/);
    }
  });
});
