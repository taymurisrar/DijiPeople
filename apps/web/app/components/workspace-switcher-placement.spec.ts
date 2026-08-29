import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS = __dirname;
const SHELL = join(__dirname, "../(authenticated)/_components");
const LAYOUT = join(__dirname, "../(authenticated)/layout.tsx");

/**
 * Source with comments removed, and with line endings normalised first.
 *
 * The normalisation is not cosmetic. These files are checked out CRLF on
 * Windows and LF on CI, so a spec that matches a literal containing `\n`
 * passes vacuously on one and meaningfully on the other — a negative
 * assertion written that way goes quiet exactly where it is needed.
 */
function codeOnly(path: string) {
  return readFileSync(path, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * ITEM-0102 — "Switch workspace" belongs under the avatar, not loose in the page.
 *
 * It used to render right-aligned in the empty band between the page header and
 * the record action bar: the only thing on its row, so it read as page content
 * rather than as a property of the session. Someone scanning that row for Edit
 * or Delete passed over a control that changes their entire context.
 *
 * These are placement and naming invariants, asserted against the source
 * because `apps/web` has no jsdom and no testing library — see `jest.config.js`.
 * They are the three things that would silently come back: the loose row, a
 * doubled accessible name, and a disclosure nested inside the avatar dropdown.
 */
describe("ITEM-0102 — the workspace switcher lives in the avatar menu", () => {
  const switcher = codeOnly(join(COMPONENTS, "workspace-switcher.tsx"));
  const topbar = codeOnly(join(SHELL, "dashboard-topbar.tsx"));
  const menu = codeOnly(join(SHELL, "user-menu-dropdown.tsx"));
  const layout = codeOnly(LAYOUT);

  it("reaches the menu as a slot the layout renders, not a row in the page", () => {
    /*
     * The only `<WorkspaceSwitcher />` in the layout is the one inside the
     * `workspaceSection` prop. Counting the element and requiring the prop is
     * what distinguishes "moved" from "added in a second place".
     */
    expect(layout.match(/<WorkspaceSwitcher\b/g) ?? []).toHaveLength(1);
    expect(layout).toMatch(
      /const workspaceSection = \(\s*<Suspense fallback=\{null\}>\s*<WorkspaceSwitcher \/>/,
    );
    expect(layout).toContain("workspaceSection={workspaceSection}");
  });

  it("is handed through the topbar rather than fetched inside the menu", () => {
    expect(topbar).toContain("workspaceSection={workspaceSection}");
    // A client component cannot await a server fetch; if the menu ever grows
    // its own call the section stops being resolved before the menu opens.
    expect(menu).toContain("{workspaceSection}");
    expect(menu).not.toContain("workspaces/mine");
  });

  it("states its accessible name exactly once", () => {
    // The defect the record names: a visually hidden "Switch workspace." and a
    // visible "Switch workspace" on the same control, read back as both.
    expect(switcher.match(/Switch workspace/g) ?? []).toHaveLength(1);
    expect(switcher).toContain("aria-labelledby");
  });

  it("is a section, not a second disclosure inside the first", () => {
    // A dropdown nested in the avatar dropdown is two menus deep for a list
    // that is almost always two items long.
    expect(switcher).not.toContain("<details");
    expect(switcher).not.toContain("<summary");
  });

  it("renders nothing when there is nowhere to switch to", () => {
    /*
     * Guards the divider as much as the list. The menu cannot tell an empty
     * section from a present one — a Suspense boundary is a truthy node either
     * way — so the separator has to be drawn by the section that may vanish,
     * or every single-workspace user carries a rule to nowhere in their menu.
     */
    expect(switcher).toContain("workspaces.length < 2");
    expect(switcher).toMatch(/if\s*\(!others\.length\)\s*return null;/);
    expect(menu).not.toMatch(/border-t[\s\S]{0,120}\{workspaceSection\}/);
  });

  it("keeps the menu keyboard-openable and escapable", () => {
    // Acceptance criterion, and the reason the switcher may stop being a
    // disclosure at all: the menu around it already provides both.
    expect(menu).toContain('type="button"');
    expect(menu).toContain("aria-expanded={isOpen}");
    expect(menu).toMatch(/event\.key === "Escape"/);
  });
});
