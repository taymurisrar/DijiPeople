import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS = join(__dirname, "../app/_components");
const INTERNAL = join(__dirname, "../app/(internal)");

/**
 * BUG-1421 — four structural defects in one shared shell, therefore on every
 * screen at once.
 *
 * Audited across 48 authenticated admin routes on production: an identical
 * `<title>` on 47, two `<main>` landmarks on 47, two `<h1>` on all 48 with the
 * first always "Control Hub", the sidebar outside any `<nav>` landmark on all
 * 48, and no skip link anywhere.
 *
 * PLAN-019 already warns about exactly this shape — *"The shell is shared, so a
 * defect in it is a defect everywhere"* — and BUG-0073 was the same class, one
 * sidebar class name failing contrast on every screen. Screen-by-screen review
 * keeps missing these because every screen looks equally wrong, so they read as
 * the design rather than as a defect. That is why these assertions are about
 * the shell rather than about any page.
 */
describe("BUG-1421 — the admin shell has one of each landmark", () => {
  /*
   * Comments stripped before asserting. Each of these fixes carries a note
   * naming the element it replaced — "A `<div>`, not a `<main>`" — so an
   * assertion that cannot tell code from prose fails on the explanation, and
   * the only way to satisfy it would be to delete the explanation.
   */
  function codeOnly(name: string) {
    return readFileSync(join(COMPONENTS, name), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  const shell = codeOnly("admin-shell.tsx");
  const topbar = codeOnly("admin-topbar.tsx");
  const sidebar = codeOnly("admin-sidebar.tsx");

  it("renders no <main> of its own, leaving the page's as the only one", () => {
    expect(shell).not.toContain("<main");
    expect(shell).not.toContain("</main>");
  });

  it("gives the content region an id the skip link can reach", () => {
    expect(shell).toContain('id="admin-content"');
  });

  it("offers a skip link as the first focusable element", () => {
    const beforeLayout = shell.slice(0, shell.indexOf("<AdminSidebar"));
    expect(beforeLayout.length).toBeGreaterThan(100);
    expect(beforeLayout).toContain('href="#admin-content"');
    // Hidden until focused, and genuinely reachable rather than display:none.
    expect(beforeLayout).toContain("sr-only");
    expect(beforeLayout).toContain("focus:not-sr-only");
  });

  it("does not render a second <h1> in the topbar", () => {
    expect(topbar).not.toContain("<h1");
    // The text stays; only its element changes. Removing it would be a
    // different decision from the one this record asks for.
    expect(topbar).toContain("Control Hub");
  });

  it("wraps the sidebar in a named navigation landmark", () => {
    expect(sidebar).toContain("<nav");
    expect(sidebar).toContain('aria-label="Platform admin"');
    expect(sidebar).not.toContain("<aside");
  });
});

/**
 * The fifth defect: one title for every screen.
 *
 * Asserted over the routes rather than over the shell, because this one is not
 * fixable in a single place — each screen has to name itself. A route missing
 * its metadata falls back to the shared default, which is the defect.
 */
describe("BUG-1421 — every admin route titles itself", () => {
  function pages(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) found.push(...pages(path));
      else if (entry === "page.tsx") found.push(path);
    }
    return found;
  }

  const all = pages(INTERNAL);

  it("finds the routes it is asserting over", () => {
    expect(all.length).toBeGreaterThan(50);
  });

  it("declares a title on every route that can carry one", () => {
    const missing = all.filter((path) => {
      const source = readFileSync(path, "utf8");
      /*
       * A client component cannot export `metadata` — Next forbids it. Three
       * routes are in that state and fall back to the shared default, which is
       * a known and accepted gap rather than an oversight.
       */
      if (/^\s*["']use client["']/.test(source)) return false;
      return (
        !source.includes("export const metadata") &&
        !source.includes("generateMetadata")
      );
    });
    expect(missing).toEqual([]);
  });

  it("composes rather than replaces, so the product name survives", () => {
    const layout = readFileSync(
      join(__dirname, "../app/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain('template: "%s · DijiPeople Admin"');
    expect(layout).toContain('default: "DijiPeople Admin"');
  });
});
