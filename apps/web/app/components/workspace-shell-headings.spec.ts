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
     * The topbar's `<h1>` is per-page — it renders a resolved title, not a
     * constant — so it is the correct one to keep. The defect was the two
     * constants ahead of it, which is why this asserts the count rather than
     * removing it.
     */
    const headings = topbar.match(/<h1/g) ?? [];
    expect(headings).toHaveLength(1);
    expect(topbar).toContain("{resolvedTitle}");
  });
});

/**
 * BUG-1950 — that one `<h1>` said "Dashboard" on all 232 authenticated routes.
 *
 * The heading was per-page in shape and constant in fact: `pageTitle` defaulted
 * to "Dashboard" and the layout never passed anything else. Someone navigating
 * by headings was told every screen in the tenant product was the same page.
 */
describe("BUG-1950 — the shell heading names the route", () => {
  const topbar = codeOnly(join(SHELL, "dashboard-topbar.tsx"));

  it("resolves the title from the path rather than defaulting to a constant", () => {
    expect(topbar).toContain("usePathname");
    expect(topbar).toContain("resolveRouteTitle(pathname)");
  });

  it("has no constant heading left to fall back to", () => {
    // The literal that was the defect. A default of `"Dashboard"` here is the
    // whole bug, so its absence is the assertion.
    expect(topbar).not.toContain('pageTitle = "Dashboard"');
  });

  it("still lets a route name itself", () => {
    // `pageTitle` remains a prop: a route with a better name than its path
    // gives wins over the derived one.
    expect(topbar).toContain("pageTitle?.trim()");
  });

  it("uses the same resolver as the document title, so the two agree", () => {
    const layout = codeOnly(join(SHELL, "../layout.tsx"));
    expect(layout).toContain("resolveRouteTitle");
  });
});

/**
 * BUG-1951 — 143 of the 232 authenticated pages rendered no `main` landmark.
 *
 * Neither the authenticated layout nor the settings layout supplied one, so
 * there was no fallback: landmark navigation did not work, and the skip link
 * had nothing to skip to. The other 89 pages each rendered their own, which is
 * why this could not be fixed by adding one to the layout alone — that would
 * have given those 89 two landmarks, which is BUG-1421's defect in `apps/admin`.
 *
 * The landmark is now the layout's, exactly once, and no page or shared
 * component renders another. These assertions hold both halves of that, since
 * either one alone is a defect.
 */
describe("BUG-1951 — exactly one main landmark, and the layout owns it", () => {
  function tsxFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) found.push(...tsxFiles(path));
      else if (entry.endsWith(".tsx")) found.push(path);
    }
    return found;
  }

  const authenticated = join(SHELL, "..");
  const layoutPath = join(authenticated, "layout.tsx");

  it("the authenticated layout renders the landmark, once", () => {
    const layout = codeOnly(layoutPath);
    expect(layout.match(/<main/g) ?? []).toHaveLength(1);
    expect(layout).toContain('id="main-content"');
  });

  it("offers a skip link that targets it", () => {
    expect(codeOnly(layoutPath)).toContain('href="#main-content"');
  });

  it("no other authenticated page or layout renders one", () => {
    for (const path of tsxFiles(authenticated)) {
      if (path === layoutPath) continue;
      expect([path, codeOnly(path).includes("<main")]).toEqual([path, false]);
    }
  });

  it("no shared component renders one either", () => {
    // These two did — `role-dashboard-page` and `settings-layout` — which is
    // how every settings category and every role dashboard would have ended up
    // with a second landmark the moment the layout gained its own.
    for (const name of [
      "dashboard/role-dashboard-page.tsx",
      "settings/settings-layout.tsx",
    ]) {
      const source = codeOnly(join(COMPONENTS, name));
      expect([name, source.includes("<main")]).toEqual([name, false]);
    }
  });
});
