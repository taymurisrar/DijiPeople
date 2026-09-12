import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getResponsiveTabId,
  getResponsiveTabPanelId,
  resolveNextTabIndex,
} from "./responsive-runtime-tabs";

/*
 * BUG-3378 — the shared responsive tab strip left thirteen invisible
 * measurement-copy buttons in the tab order (`aria-hidden` does not affect
 * focusability) and exposed no `role="tab"`/`role="tablist"`/`role="tabpanel"`
 * semantics at all on the visible strip.
 *
 * `apps/web`'s jest has no jsdom (see `jest.config.js`), so this cannot
 * render the component and inspect the accessibility tree the way a browser
 * test would. Two things are covered instead: the roving-tabindex arrow-key
 * math as a pure function (the part most likely to regress silently — an
 * off-by-one here does not throw, it just strands keyboard focus), and a
 * structural read of the source for the two attributes a render test would
 * otherwise catch — `inert` on the measurement copy and the `tablist`/`tab`
 * roles on the visible one. `apps/admin`'s `console-theme.spec.ts` uses the
 * same structural-read approach for its own jsdom-less suite.
 */

describe("resolveNextTabIndex", () => {
  it("moves right and left within bounds", () => {
    expect(resolveNextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(resolveNextTabIndex("ArrowLeft", 1, 3)).toBe(0);
  });

  it("wraps past both ends", () => {
    expect(resolveNextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(resolveNextTabIndex("ArrowLeft", 0, 3)).toBe(2);
  });

  it("jumps to the first or last tab on Home/End", () => {
    expect(resolveNextTabIndex("Home", 2, 5)).toBe(0);
    expect(resolveNextTabIndex("End", 0, 5)).toBe(4);
  });

  it("treats a selection outside the selectable set as before the first", () => {
    // The active tab can be absent from `selectable` — disabled, or just
    // collapsed into the overflow menu by a resize — and ArrowRight still
    // has to land somewhere rather than silently doing nothing.
    expect(resolveNextTabIndex("ArrowRight", -1, 3)).toBe(1);
    expect(resolveNextTabIndex("ArrowLeft", -1, 3)).toBe(2); // wraps to the last tab
  });

  it("has nowhere to go with no selectable tabs", () => {
    expect(resolveNextTabIndex("ArrowRight", -1, 0)).toBe(-1);
  });
});

describe("getResponsiveTabId / getResponsiveTabPanelId", () => {
  it("derive deterministically from the same idPrefix", () => {
    // The tab strip and the panel it controls are two different components
    // (`runtime-metadata-form-renderer.tsx` owns the panel) that must agree
    // on these ids without importing each other's internals.
    expect(getResponsiveTabId("r0", "profile")).toBe("r0-tab-profile");
    expect(getResponsiveTabPanelId("r0")).toBe("r0-tabpanel");
  });

  it("keys never collide across two different prefixes", () => {
    expect(getResponsiveTabId("r0", "profile")).not.toBe(
      getResponsiveTabId("r1", "profile"),
    );
  });
});

describe("responsive tab strip structure", () => {
  const source = readFileSync(
    join(__dirname, "responsive-runtime-tabs.tsx"),
    "utf8",
  );
  // The measurement copy: from its `aria-hidden` marker to the ref that
  // anchors it, i.e. just the wrapping <div>'s own attributes — not the real
  // tablist below it, which also carries `ref={...}` on its own container.
  const measureBlock = source.slice(
    source.indexOf('aria-hidden="true"'),
    source.indexOf("ref={measureRef}") + "ref={measureRef}".length,
  );

  it("keeps the measurement copy out of the focus order with inert", () => {
    expect(measureBlock).toContain("inert");
  });

  it("does not rely on tabIndex=-1 alone on the measurement copy", () => {
    // Not a requirement — inert already covers it — but if inert is ever
    // dropped without tabIndex={-1} taking its place, this is the line that
    // should fail rather than a silent regression.
    expect(measureBlock).not.toContain("tabIndex={-1}");
  });

  it("gives the visible strip real tab semantics", () => {
    expect(source).toContain('role="tablist"');
    expect(source).toMatch(/role=\{isRealTab \? "tab" : undefined\}/);
    expect(source).toContain("aria-selected={isRealTab ? active : undefined}");
    expect(source).toContain("aria-controls={isRealTab ? panelId : undefined}");
  });

  it("exposes exactly one tab-order stop via roving tabindex", () => {
    expect(source).toContain(
      "tabIndex={isRealTab ? (active ? 0 : -1) : undefined}",
    );
  });
});
