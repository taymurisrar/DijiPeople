import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SHELL = join(__dirname, "../(authenticated)/_components");
const COMPONENTS = __dirname;

function codeOnly(path: string) {
  return readFileSync(path, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * BUG-1673 — every tenant workspace screen carried three `<h1>` elements.
 *
 * "Workspace", "Workspace" again, then the page's own title. Someone navigating
 * by headings heard "Workspace, Workspace, Dashboard" on the payroll screen,
 * the settings screen and an employee's record alike — and on a record screen
 * the subject's own name was an `<h2>` beneath all three.
 *
 * The same four-defect pattern as BUG-1421 in `apps/admin`, with "Control Hub"
 * in place of "Dashboard". Two shells, one mistake — which is why both were
 * fixed together and why the convention is asserted the same way in both.
 */
describe("BUG-1673 — the workspace shell owns no headings", () => {
  const sidebar = codeOnly(join(SHELL, "dashboard-sidebar.tsx"));
  const topbar = codeOnly(join(SHELL, "dashboard-topbar.tsx"));

  it("renders the brand as a label, not a heading", () => {
    expect(sidebar).not.toContain("<h1");
    // The words stay; only the element changes. This is identity, not
    // structure, and removing it would be a different decision.
    expect(sidebar).toContain("Workspace");
  });

  it("leaves exactly one heading, and it names the page", () => {
    /*
     * The topbar's `<h1>` is per-page — it renders `pageTitle`, not a constant
     * — so it is the correct one to keep. The defect was the two constants
     * ahead of it, which is why this asserts the count rather than removing it.
     */
    const headings = topbar.match(/<h1/g) ?? [];
    expect(headings).toHaveLength(1);
    expect(topbar).toContain("{pageTitle}");
  });
});

/**
 * A shared component that renders `<main>` must be the only one on the page.
 *
 * The audit reported two `<main>` landmarks on several screens. Two components
 * render one — `role-dashboard-page` and `settings-layout` — and neither is
 * nested inside a page that renders its own, so the duplication is not
 * reachable from the source alone and this holds the invariant rather than
 * reproducing the report. See the bug record: the second landmark still needs
 * identifying in a browser.
 */
describe("BUG-1673 — one main landmark per screen", () => {
  function tsxFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) found.push(...tsxFiles(path));
      else if (entry.endsWith(".tsx")) found.push(path);
    }
    return found;
  }

  it("no shell component renders a main landmark", () => {
    // The shell wraps every page, so a `<main>` here is a second one on every
    // screen — the mistake `apps/admin` was making (BUG-1421).
    for (const path of tsxFiles(SHELL)) {
      expect([path, codeOnly(path).includes("<main")]).toEqual([path, false]);
    }
  });

  it("never nests one main inside another", () => {
    for (const name of [
      "dashboard/role-dashboard-page.tsx",
      "settings/settings-layout.tsx",
    ]) {
      const source = codeOnly(join(COMPONENTS, name));
      /*
       * Counted as a depth walk rather than as occurrences.
       * `role-dashboard-page` opens a `<main>` in each of its three return
       * branches — loading, error and loaded — which is one per render, not
       * three at once. What would actually be wrong is depth reaching two.
       */
      let depth = 0;
      let maxDepth = 0;
      for (const tag of source.match(/<\/?main\b/g) ?? []) {
        depth += tag.startsWith("</") ? -1 : 1;
        maxDepth = Math.max(maxDepth, depth);
      }
      expect([name, maxDepth]).toEqual([name, 1]);
      expect([name, depth]).toEqual([name, 0]);
    }
  });
});
