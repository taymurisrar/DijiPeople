/*
 * ITEM-0128 — two explanatory blocks sat above the content nobody came for:
 * "How to read these numbers" (13 paragraphs on Attendance, 12 on Workforce, 6
 * on Recruitment, all above the first metric tile), and "Analytics surfaces"
 * on Reports Overview (five large cards ahead of the report list a returning
 * reader actually wants).
 *
 * `apps/web` has no rendering test tooling — jest runs in a plain Node
 * environment (see `jest.config.js`) with no jsdom or React Testing Library.
 * Both components here are plain, hook-light client components (`CaveatPanel`
 * takes no context at all; `ReportsLanding`'s only hook,
 * `useFormattingContext`, degrades to `null` with no provider), so
 * `react-dom/server`'s `renderToStaticMarkup` renders them for real without
 * either — a genuine assertion over markup, not a copy of the component's
 * logic re-implemented in the test.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CaveatPanel } from "./caveat-panel";
import { ReportsLanding, type ReportsLandingProps } from "./reports-landing";

describe("ITEM-0128 — CaveatPanel collapses its caveats behind a named disclosure", () => {
  const caveats = [
    "The denominator is scheduled hours, not agent uptime.",
    "A period including today is short a day; reconciliation has not run.",
  ];

  it("wraps the caveat list in a <details> rather than printing it open", () => {
    const markup = renderToStaticMarkup(
      createElement(CaveatPanel, { caveats, suppression: null }),
    );

    expect(markup).toContain("<details");
    // Every caveat's text still reaches the page — nothing is lost, only
    // collapsed.
    for (const caveat of caveats) {
      expect(markup).toContain(caveat);
    }
    // The <summary> names how many notes it holds, per the acceptance
    // criterion: "reachable ... through a control that names how many notes
    // it holds."
    expect(markup).toContain("2 notes on how these numbers are measured");
  });

  it("still states each caveat's text inside the details, not only its count", () => {
    const markup = renderToStaticMarkup(
      createElement(CaveatPanel, {
        caveats: ["Only one caveat here."],
        suppression: null,
      }),
    );
    expect(markup).toContain("1 note on how these numbers are measured");
    expect(markup).toContain("Only one caveat here.");
  });

  it("keeps the suppression banner outside the collapsed disclosure, always visible", () => {
    const markup = renderToStaticMarkup(
      createElement(CaveatPanel, {
        caveats,
        suppression: {
          suppressedBuckets: 3,
          suppressionLabel: "Groups under 5 people are withheld",
        },
      }),
    );

    const detailsIndex = markup.indexOf("<details");
    const suppressionIndex = markup.indexOf("groups were");
    expect(suppressionIndex).toBeGreaterThan(-1);
    // The suppression text renders before the <details> element, i.e. it is
    // not nested inside the thing a reader has to expand to see it.
    expect(suppressionIndex).toBeLessThan(
      detailsIndex === -1 ? Infinity : detailsIndex,
    );
  });

  it("renders nothing when there is nothing to say", () => {
    const markup = renderToStaticMarkup(
      createElement(CaveatPanel, { caveats: [], suppression: null }),
    );
    expect(markup).toBe("");
  });
});

describe("ITEM-0128 — Reports Overview leads with the report list, not the surface cards", () => {
  const baseProps: ReportsLandingProps = {
    surfaces: [
      {
        key: "attendance",
        label: "Attendance",
        description: "Attendance rates, lateness and absence over time.",
        versusDashboard:
          "The Dashboard shows today's snapshot; this surface compares periods.",
      },
    ],
    standard: [],
    custom: [],
    favorites: [],
    recents: [],
    canCreate: true,
    libraryAvailable: true,
  };

  it("places the Reports section before the Analytics surfaces section in the markup", () => {
    const markup = renderToStaticMarkup(createElement(ReportsLanding, baseProps));

    const reportsHeadingIndex = markup.indexOf(">Reports<");
    const surfacesHeadingIndex = markup.indexOf(">Analytics surfaces<");

    expect(reportsHeadingIndex).toBeGreaterThan(-1);
    expect(surfacesHeadingIndex).toBeGreaterThan(-1);
    expect(reportsHeadingIndex).toBeLessThan(surfacesHeadingIndex);
  });

  it("does not lose the surface description or the Dashboard-contrast sentence", () => {
    const markup = renderToStaticMarkup(createElement(ReportsLanding, baseProps));

    expect(markup).toContain("Attendance rates, lateness and absence over time.");
    expect(markup).toContain(
      "The Dashboard shows today&#x27;s snapshot; this surface compares periods.",
    );
  });
});
