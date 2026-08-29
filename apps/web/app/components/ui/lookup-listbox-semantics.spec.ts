import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUG-1956 — every lookup and select the metadata form runtime renders
 * announced itself as a combobox controlling a listbox, and then presented no
 * listbox and no options: a plain `div` of `button` elements.
 *
 * The attributes were written and the things they promised were not built,
 * which is worse than no ARIA at all — the user is told a list exists and finds
 * nothing to perceive. So what is asserted here is the correspondence between
 * the two, not the presence of either half on its own.
 *
 * Source-reading, because `apps/web` runs jest in the node environment with no
 * jsdom. The movement itself is real logic and is tested as such in
 * `lib/a11y/listbox-navigation.spec.ts`.
 */
/*
 * Comments are stripped before counting. This file explains the fix in prose
 * that quotes the very attributes being counted, so a raw match would count the
 * explanation as an implementation — the shape of `assertion-matches-mention`.
 */
const SOURCE = readFileSync(join(__dirname, "form-control.tsx"), "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/* The two composite controls in this file, both reported by the record. */
const COMBOBOX_COUNT = 2;

describe("BUG-1956 — the popup a combobox names is a listbox", () => {
  it("declares a listbox for each combobox that claims one", () => {
    const comboboxes = SOURCE.match(/role="combobox"/g) ?? [];
    const listboxes = SOURCE.match(/role="listbox"/g) ?? [];

    expect(comboboxes).toHaveLength(COMBOBOX_COUNT);
    expect(listboxes).toHaveLength(COMBOBOX_COUNT);
  });

  it("gives every choice an option role and a selected state", () => {
    const options = SOURCE.match(/role="option"/g) ?? [];
    const selected = SOURCE.match(/aria-selected=\{isSelected\}/g) ?? [];

    expect(options).toHaveLength(COMBOBOX_COUNT);
    expect(selected).toHaveLength(COMBOBOX_COUNT);
  });

  it("names the highlighted option on every combobox", () => {
    const activeDescendants =
      SOURCE.match(/aria-activedescendant=\{activeDescendantId\(/g) ?? [];

    // Two triggers, plus the lookup's search input — which is the element that
    // actually holds focus while its popup is open, so the attribute has to be
    // on it as well or a screen reader is tracking the wrong element.
    expect(activeDescendants.length).toBeGreaterThanOrEqual(COMBOBOX_COUNT + 1);
  });
});

describe("BUG-1956 — the options are not focusable children of a widget", () => {
  /*
   * A listbox whose children are `button`s is `nested-interactive`, and it is
   * also why there was never any need for `aria-activedescendant`: the popup
   * was navigated with Tab. Both halves had to change together.
   */
  it("renders no button inside a listbox", () => {
    const listboxIndex = SOURCE.indexOf('id={listboxId} role="listbox"');
    expect(listboxIndex).toBeGreaterThan(-1);

    const listboxRegion = SOURCE.slice(listboxIndex, listboxIndex + 2000);
    expect(listboxRegion).not.toContain('type="button"');
  });

  it("does not keep a link inside the combobox trigger", () => {
    // The selected record's link was a focusable child of the combobox, and a
    // Tab stop inside a control the user was trying to open.
    expect(SOURCE).not.toContain(
      'className="block truncate font-semibold text-accent underline-offset-4 hover:underline"',
    );
    expect(SOURCE).toContain("Open {lookupOptionDisplay(selectedOption).name}");
  });
});

describe("BUG-1956 — aria-controls never dangles", () => {
  it("names the popup only while the popup exists", () => {
    // `aria-controls={listboxId}` unconditionally pointed at a portalled
    // element that is not rendered when the field is closed — the same class of
    // defect as the missing roles, an attribute written for a thing not built.
    expect(SOURCE).not.toContain("aria-controls={listboxId}");
    expect(SOURCE).toContain("aria-controls={isOpen ? listboxId : undefined}");
    expect(SOURCE).toContain(
      "isOpen && filteredOptions.length ? listboxId : undefined",
    );
  });
});

describe("BUG-1956 — the keyboard reaches the options", () => {
  it("routes movement through the shared resolver in both controls", () => {
    const uses = SOURCE.match(/nextActiveIndex\(/g) ?? [];
    expect(uses).toHaveLength(COMBOBOX_COUNT);
  });

  it("closes on Escape rather than leaving the popup behind", () => {
    const escapes = SOURCE.match(/event\.key === "Escape"/g) ?? [];
    expect(escapes.length).toBeGreaterThanOrEqual(COMBOBOX_COUNT);
  });
});
