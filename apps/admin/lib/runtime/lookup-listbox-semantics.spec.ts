import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * BUG-3377 — Platform Admin's two lookup controls carried the exact
 * `nested-interactive` defect [[BUG-1956]] fixed in `apps/web`
 * (`apps/web/app/components/ui/lookup-listbox-semantics.spec.ts`): options
 * rendered as focusable `button`s with `role="option"` inside a
 * `role="listbox"`, no `aria-activedescendant` anywhere, and — in
 * `LookupControl` — zero key handlers at all, so the popup could be opened
 * only with a pointer and its options could never be reached from the
 * keyboard.
 *
 * Source-reading, same reason as the web original: neither app's jest config
 * installs jsdom (`apps/admin/AGENTS.md`). The movement itself is real logic
 * and is tested as such in `lib/a11y/listbox-navigation.spec.ts`.
 */
function readStripped(path: string) {
  return readFileSync(path, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const LOOKUP_CONTROL_SOURCE = readStripped(
  join(__dirname, "../../app/_components/ui/form-control.tsx"),
);
const SEARCHABLE_SELECT_SOURCE = readStripped(
  join(__dirname, "../../app/_components/runtime/runtime-form.tsx"),
);

describe.each([
  ["LookupControl", LOOKUP_CONTROL_SOURCE],
  ["SearchableSelect", SEARCHABLE_SELECT_SOURCE],
])("BUG-3377 — %s's popup is a real listbox", (_name, SOURCE) => {
  it("declares a combobox naming its listbox", () => {
    expect(SOURCE).toContain('role="combobox"');
    expect(SOURCE).toContain('role="listbox"');
  });

  it("gives every choice an option role and a selected state, none of them focusable", () => {
    expect(SOURCE).toContain('role="option"');
    expect(SOURCE).toContain("aria-selected=");
    // The nested-interactive violation this record is about: an option that
    // is itself a `button` inside the listbox.
    const listboxIndex = SOURCE.indexOf('role="listbox"');
    expect(listboxIndex).toBeGreaterThan(-1);
    const listboxRegion = SOURCE.slice(listboxIndex, listboxIndex + 2500);
    expect(listboxRegion).not.toContain("<button");
  });

  it("names the highlighted option via aria-activedescendant", () => {
    expect(SOURCE).toContain("aria-activedescendant={activeDescendantId(");
  });

  it("aria-controls never dangles — only set while the popup exists", () => {
    expect(SOURCE).toMatch(/aria-controls=\{open \?/);
  });

  it("routes movement through the shared resolver and closes on Escape", () => {
    expect(SOURCE).toContain("nextActiveIndex(");
    expect(SOURCE).toContain('event.key === "Escape"');
  });
});

describe("BUG-3377 — LookupControl's clear control is a real, focusable sibling button", () => {
  it("no longer nests a span[role=button] inside the trigger", () => {
    expect(LOOKUP_CONTROL_SOURCE).not.toContain('role="button"');
    expect(LOOKUP_CONTROL_SOURCE).not.toContain("tabIndex={-1}");
  });

  it("renders it as an actual button", () => {
    expect(LOOKUP_CONTROL_SOURCE).toContain('aria-label="Clear selection"');
  });

  it("the trigger is no longer a <button>, so a real <button> can sit inside it", () => {
    // A `<button>` may not contain another interactive element — that is
    // exactly why the clear affordance used to be a `span role="button"`
    // with `tabIndex={-1}` (unreachable by keyboard) instead of a real one.
    expect(LOOKUP_CONTROL_SOURCE).not.toMatch(
      /role="combobox"[\s\S]{0,400}type="button"/,
    );
  });
});
