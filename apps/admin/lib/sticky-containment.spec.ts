import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Nothing between a sticky element and the viewport may create a scrollport.
 *
 * THE BUG. `admin-shell.tsx` wrapped every page in
 * `<div className="min-w-0 overflow-x-hidden">`. `overflow-x: hidden` forces
 * the *other* axis to compute to `auto`, so that div became a scroll container
 * — and a sticky element sticks to its nearest scroll container, which here has
 * auto height and never scrolls. Every `position: sticky` in the console was
 * therefore inert: the page scrolled, the container did not, nothing stuck.
 *
 * It is invisible in review because the declaration that breaks it is on a
 * different file from the one that stops working, and `hidden` and `clip` are
 * one word apart. `overflow-x: clip` is allowed to pair with `visible` on the
 * other axis, so it contains horizontal overflow without creating a scrollport.
 *
 * Reported as "Fields & signatures should be sticky on the right side" about a
 * panel whose class list already said `sticky`.
 */
const APP_ROOT = join(__dirname, "..");

/**
 * Files that legitimately own a scroll container: something inside them really
 * does scroll on its own, and a sticky descendant is meant to stick to it.
 */
const SCROLLPORT_OWNERS = [
  // The sidebar's nav list scrolls independently of the page.
  "app/_components/admin-sidebar.tsx",
];

function collectTsxFiles(dir: string, found: string[] = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith("."))
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectTsxFiles(full, found);
    else if (entry.endsWith(".tsx")) found.push(full);
  }
  return found;
}

function relativeTo(file: string) {
  return file
    .slice(APP_ROOT.length + 1)
    .split("\\")
    .join("/");
}

describe("sticky containment", () => {
  const files = collectTsxFiles(join(APP_ROOT, "app"));

  it("finds the admin source tree", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("never uses overflow-x-hidden on a wrapper that is not itself a scrollport", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const relative = relativeTo(file);
      if (SCROLLPORT_OWNERS.includes(relative)) continue;
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(
        /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g,
      )) {
        const className = match[1] ?? match[2] ?? match[3] ?? "";
        if (!/\boverflow-x-hidden\b/.test(className)) continue;
        /*
         * Paired with an explicit vertical scroll, the element is a real
         * scrollport and the horizontal `hidden` is deliberate. Alone, it is
         * the silent one.
         */
        if (/\boverflow-y-(?:auto|scroll)\b/.test(className)) continue;
        offenders.push(`${relative}: ${className.trim().slice(0, 90)}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the shell wrapper on clip, which does not create a scrollport", () => {
    // Asserted directly, so replacing it with `hidden` fails here by name
    // rather than as a mysterious loss of stickiness three screens away.
    const shell = readFileSync(
      join(APP_ROOT, "app/_components/admin-shell.tsx"),
      "utf8",
    );
    expect(shell).toContain("overflow-x-clip");
    expect(shell).not.toContain('overflow-x-hidden"');
  });

  it("still has something that depends on this working", () => {
    /*
     * A guard for a property nothing uses is a guard nobody will keep. The
     * contract editor's fields rail is the sticky element this exists for.
     */
    const editor = readFileSync(
      join(APP_ROOT, "app/_components/documents/contract-document-editor.tsx"),
      "utf8",
    );
    expect(editor).toMatch(/lg:sticky|xl:sticky|\bsticky\b/);
  });
});
