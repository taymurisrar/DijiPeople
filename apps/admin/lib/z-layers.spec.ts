import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The stacking order of Platform Admin, enforced rather than described.
 *
 * The bug this exists for: the topbar carried `top-4 z-30` while being
 * statically positioned, where both declarations are inert — `top` needs a
 * position and so does `z-index`. The header therefore sat at `z-auto` while
 * ordinary page content below it (the module command bar, the data table's
 * sticky header row and its pagination bar) was genuinely positioned at z-20
 * and z-30. Those painted straight through the open profile menu: half the menu
 * was covered by the table behind it and one item was invisible entirely.
 *
 * Two separate mistakes produced it, and a comment would have prevented
 * neither — a z-index that does nothing, and page content claiming a layer that
 * belongs to the shell. So the scale below is asserted against the source.
 */
const LAYERS = {
  /** Sticky things inside a page: table headers, paginators, command bars. */
  pageSticky: 10,
  /** Popovers owned by a page: dropdowns, comboboxes, tooltips. */
  pagePopover: 20,
  /** The application shell: topbar and its menus. */
  shell: 30,
  /** Things that must cover the shell: the mobile drawer and its scrim. */
  shellOverlay: 50,
  /**
   * Modals and dialogs. They take the whole viewport while open, so covering
   * the shell is the point rather than a conflict.
   */
  modal: 100,
} as const;

/**
 * Files allowed to claim `shell` or above. Everything else is page content and
 * must stay below it, whatever it is sticky to.
 */
const SHELL_FILES = [
  "app/_components/admin-topbar.tsx",
  "app/_components/admin-sidebar.tsx",
  "app/_components/admin-shell.tsx",
];

const APP_ROOT = join(__dirname, "..");

function collectTsxFiles(dir: string, found: string[] = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith("."))
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsxFiles(full, found);
    } else if (entry.endsWith(".tsx")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Comments are stripped first. A comment explaining "this used to be z-30" is
 * not a z-index, and counting it would make the fix look like the bug.
 */
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** `z-30` and `z-[60]`; `z-auto` and `z-0` carry no ordering to check. */
function readZIndexClasses(source: string) {
  const values: number[] = [];
  for (const match of stripComments(source).matchAll(
    /(?:^|[\s"'`:])z-(\[(\d+)\]|(\d+))\b/g,
  )) {
    const raw = match[2] ?? match[3];
    if (raw) values.push(Number(raw));
  }
  return values;
}

/** A `z-index` only applies to a positioned element. */
function hasPositionedZIndex(className: string) {
  return (
    /\bz-(?:\[\d+\]|\d+)\b/.test(className) &&
    !/\b(?:relative|absolute|fixed|sticky)\b/.test(className)
  );
}

describe("Platform Admin stacking order", () => {
  const files = collectTsxFiles(join(APP_ROOT, "app"));

  it("finds the admin source tree", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("keeps page content below the application shell", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const relative = file
        .slice(APP_ROOT.length + 1)
        .split("\\")
        .join("/");
      if (SHELL_FILES.includes(relative)) continue;

      for (const value of readZIndexClasses(readFileSync(file, "utf8"))) {
        /*
         * Modal-tier values are fine anywhere: a dialog is meant to cover the
         * shell, and it takes over the whole viewport while it is open.
         */
        if (value >= LAYERS.modal) continue;
        if (value >= LAYERS.shell) {
          offenders.push(`${relative} uses z-${value}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("never declares a z-index on an element that is not positioned", () => {
    /*
     * The original defect. `z-30` on a static element silently does nothing, so
     * the element loses every stacking fight it was written to win.
     */
    const inert: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const relative = file
        .slice(APP_ROOT.length + 1)
        .split("\\")
        .join("/");

      for (const match of source.matchAll(
        /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g,
      )) {
        const className = match[1] ?? match[2] ?? match[3] ?? "";
        if (hasPositionedZIndex(className)) {
          inert.push(`${relative}: ${className.trim().slice(0, 90)}`);
        }
      }
    }

    expect(inert).toEqual([]);
  });

  it("puts the mobile drawer and its scrim above the shell", () => {
    const sidebar = readFileSync(
      join(APP_ROOT, "app/_components/admin-sidebar.tsx"),
      "utf8",
    );
    /*
     * At the same layer as the topbar the scrim lost on DOM order, leaving the
     * topbar bright above a dimmed page while the drawer was open.
     */
    for (const value of readZIndexClasses(sidebar)) {
      expect(value).toBeGreaterThanOrEqual(LAYERS.shell);
    }
  });
});
