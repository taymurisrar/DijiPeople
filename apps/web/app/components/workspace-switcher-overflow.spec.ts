import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source with comments removed, and with line endings normalised first — see
 * `workspace-switcher-placement.spec.ts` for why the normalisation matters
 * (these files are checked out CRLF on Windows, LF on CI).
 */
function codeOnly(path: string) {
  return readFileSync(path, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * BUG-3021 — the "Switch workspace" list showed a horizontal scrollbar the
 * moment a workspace's hostname was long enough to matter (reproduced with
 * `qa-e2e-signup-b-20260826.ws.dijipeople.com`), with a single entry.
 *
 * Two independent things had to both be true for it to happen, and the fix
 * addresses both:
 *
 * 1. `<li>` is a CSS Grid item (the list is `display: grid`), which defaults
 *    to `min-width: auto` — for grid sizing that means "at least as wide as
 *    the content's min-content width". A `truncate` span forces
 *    `white-space: nowrap`, so its min-content width is the *entire*
 *    unwrapped hostname, and the grid track grew to fit it instead of the
 *    `truncate` ellipsis ever getting a chance to clip anything.
 * 2. The list had `overflow-y-auto` and no `overflow-x` at all. Per the CSS
 *    overflow spec, a non-`visible` `overflow-y` paired with a `visible`
 *    `overflow-x` computes the x-axis to `auto` too — so the oversized row
 *    from (1) got its own horizontal scrollbar on the list itself, which the
 *    dropdown's own `overflow-hidden` could not suppress because the list
 *    had already become its own independent scroll container.
 *
 * This is a source-reading suite, like `workspace-switcher-placement.spec.ts`
 * beside it: `apps/web` has no jsdom and no testing library configured (see
 * `jest.config.js`), so a real overflow measurement is not available here —
 * this asserts the two CSS properties whose absence reproduced the bug, not
 * a rendered layout.
 */
describe("BUG-3021 — the workspace switcher list cannot scroll horizontally", () => {
  const switcher = codeOnly(join(__dirname, "workspace-switcher.tsx"));

  it("gives every row's <li> an explicit min-width of 0", () => {
    // The grid item that must be allowed to shrink below its content's
    // min-content width, or a long hostname re-widens the whole list.
    expect(switcher).toMatch(/<li key=\{workspace\.tenantId\} className="[^"]*\bmin-w-0\b[^"]*">/);
  });

  it("declares overflow-x-hidden alongside the list's overflow-y-auto", () => {
    const listClassName = switcher.match(
      /<ul[\s\S]*?className="([^"]*)"[\s\S]*?>/,
    )?.[1];

    expect(listClassName).toBeDefined();
    expect(listClassName).toMatch(/\boverflow-y-auto\b/);
    expect(listClassName).toMatch(/\boverflow-x-hidden\b/);
  });

  it("keeps the name and the hostname on a truncating, shrinkable line", () => {
    // The two lines the record calls out together ("the tenant name above
    // it" and the hostname beneath it) both still need `min-w-0` + `truncate`
    // on their own span/paragraph — the `<li>` fix only gives them a box
    // narrow enough for that to matter.
    expect(switcher).toMatch(
      /<span className="min-w-0 truncate text-sm font-semibold text-foreground">/,
    );
    expect(switcher).toMatch(
      /<p className="mt-0\.5 truncate text-xs text-muted">/,
    );
  });
});
