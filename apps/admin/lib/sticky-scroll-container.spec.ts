import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * BUG-4032. With `overflow-x: hidden` on both html and body, body became a
 * scroll container (overflow-y computes to `auto`) that never scrolls — the
 * window does — so every `position: sticky` in the console silently scrolled
 * away: the record command bar, the agreement editor toolbar and its Fields &
 * Signatures panel. `clip` prevents horizontal scroll without creating one.
 */
describe("the page root never becomes a scroll container", () => {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
  const rootRule = css.match(/html,\s*body\s*\{([^}]*)\}/)?.[1] ?? "";

  it("clips horizontal overflow instead of hiding it", () => {
    expect(rootRule).toMatch(/overflow-x:\s*clip/);
    expect(rootRule).not.toMatch(/overflow-x:\s*hidden/);
    expect(rootRule).not.toMatch(/overflow:\s*hidden/);
  });

  it("is not reintroduced as hidden on html or body elsewhere", () => {
    const hidden = /(^|[\s,}])(html|body)\s*\{[^}]*overflow(-x|-y)?:\s*(hidden|auto|scroll)/;
    expect(css).not.toMatch(hidden);
  });
});
