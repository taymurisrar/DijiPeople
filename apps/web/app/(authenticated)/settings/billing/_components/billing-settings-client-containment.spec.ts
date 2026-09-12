import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * BUG-3335 — the Plans screen overflowed horizontally at 390px and the plan
 * card grid jumped straight from one column to three at 1280px. This pins
 * the structural fix: the responsive breakpoints on the card grid, and the
 * `w-full min-w-0` containment chain this repository already established for
 * exactly this failure mode (BUG-1960 / `settings-table-containment.spec.ts`)
 * — a wide table's container needs `min-w-0` on every layer between it and
 * the constrained grid track, not only `overflow-x-auto` on its own wrapper.
 *
 * Source-reading: `apps/web` has no jsdom, so `document.scrollWidth` cannot
 * be measured here. This is a guard, not a live-browser verification — see
 * this bug's own Resolution note for what QA still needs to check.
 */
const CLIENT = readFileSync(
  join(__dirname, "billing-settings-client.tsx"),
  "utf8",
);

describe("BUG-3335 — plan card grid gains sm/lg breakpoints, not only xl", () => {
  it("renders more than one column below 1280px", () => {
    expect(CLIENT).toContain("sm:grid-cols-2 lg:grid-cols-3");
  });
});

describe("BUG-3335 — the feature comparison stays inside its container at every width", () => {
  it("the root content wrapper carries min-w-0, matching the grid item lesson from BUG-1960", () => {
    expect(CLIENT).toContain('className="min-w-0 space-y-6"');
  });

  it("the comparison table sits in one scroller with w-full min-w-0, not six", () => {
    expect(CLIENT).toContain(
      'className="w-full min-w-0 max-h-[560px] overflow-auto rounded-[18px] border border-border bg-white"',
    );
  });

  it("is a single <table>, not one per feature category", () => {
    // Matches only real opening tags (with their className), not the prose
    // in the comment above describing the six tables this replaced.
    expect(CLIENT.match(/<table className/g)?.length).toBe(2); // this table + the invoices table
  });
});
