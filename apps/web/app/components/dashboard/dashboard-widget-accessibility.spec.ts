import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Source-reading rather than rendering: `apps/web` runs jest in the node
 * environment with no jsdom, and both records named this style explicitly.
 * What is asserted is therefore the decision, not the pixels — which is the
 * part that regressed.
 */
const RENDERER = readFileSync(
  join(__dirname, "dashboard-widget-renderer.tsx"),
  "utf8",
);

/**
 * BUG-2148 — every widget's severity dot was `aria-hidden` with a background
 * colour as its entire output, so the state reached sighted users as hue and
 * reached assistive technology not at all.
 */
describe("BUG-2148 — widget severity is not carried by colour alone", () => {
  it("no longer hides the dot from assistive technology", () => {
    // The literal that was the defect.
    expect(RENDERER).not.toContain("<span aria-hidden className={`mt-1 h-2.5");
  });

  it("gives the dot an accessible name", () => {
    expect(RENDERER).toContain('role="img"');
    expect(RENDERER).toContain("aria-label={`Status: ${SEVERITY_LABELS[severity]}`}");
  });

  it("takes the dot's and the pill's labels from one map", () => {
    // Two maps drift, and the dot's had already drifted into holding colours.
    const declarations = RENDERER.match(/const SEVERITY_LABELS/g) ?? [];
    expect(declarations).toHaveLength(1);

    const readsOfTheMap = RENDERER.match(/SEVERITY_LABELS\[severity\]/g) ?? [];
    expect(readsOfTheMap.length).toBeGreaterThanOrEqual(2);
  });

  it("covers every member of the severity union", () => {
    for (const severity of ["critical", "warning", "good", "neutral"]) {
      expect([severity, RENDERER.includes(`  ${severity}: "`)]).toEqual([
        severity,
        true,
      ]);
    }
  });
});

/**
 * BUG-2149 — every metric card ended in a link whose whole text was "Open", so
 * six cards on the overview gave six links with the same accessible name.
 */
describe("BUG-2149 — a metric card's link says which card it belongs to", () => {
  it("builds the accessible name from the card's own title", () => {
    expect(RENDERER).toContain(
      "const accessibleName = context ? `${action.label} ${context}` : undefined",
    );
    expect(RENDERER).toContain("aria-label={accessibleName}");
  });

  it("passes the title at every call site rather than at one of them", () => {
    const withContext =
      RENDERER.match(/<WidgetAction action=\{widget\.action\} context=/g) ?? [];
    const withoutContext =
      RENDERER.match(/<WidgetAction action=\{widget\.action\} \/>/g) ?? [];

    expect(withoutContext).toHaveLength(0);
    expect(withContext.length).toBeGreaterThanOrEqual(4);
  });

  it("leaves the visible text alone", () => {
    // The defect is the accessible name. Six cards reading "Open" is the
    // design, and changing it was not asked for.
    expect(RENDERER).toContain("{action.label}");
  });
});
