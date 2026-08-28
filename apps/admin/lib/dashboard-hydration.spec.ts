import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS = join(__dirname, "../app/_components");
const DASHBOARD = join(COMPONENTS, "dashboard/platform-dashboard.tsx");

function codeOnly(path: string) {
  return readFileSync(path, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * BUG-1557 — React error #418 on every admin dashboard load.
 *
 * A hydration mismatch: the page renders, and server and client disagree about
 * the initial markup. Two causes, both the same shape — a formatter told to use
 * "whatever locale and timezone this JavaScript happens to be running in",
 * which is UTC on the server and the viewer's own settings in the browser.
 *
 * `toLocaleString()` on the refresh timestamp, and
 * `Intl.NumberFormat(undefined, ...)` on every money figure.
 */
describe("BUG-1557 — nothing formats against the runtime's locale by accident", () => {
  const dashboard = codeOnly(DASHBOARD);

  it("formats money against a fixed locale", () => {
    /*
     * There is no reading of a money figure where the viewer's locale is right
     * and the server's is wrong — an amount is an amount — so this one is made
     * deterministic rather than declared as different.
     */
    expect(dashboard).not.toContain("Intl.NumberFormat(undefined");
    expect(dashboard).toContain('new Intl.NumberFormat("en-US"');
  });

  it("declares the refresh timestamp as legitimately different", () => {
    /*
     * The opposite decision, for the opposite reason: "when was this refreshed"
     * is only useful in the viewer's own time, so the difference is real and is
     * declared rather than removed. Formatting it deterministically would fix
     * the warning by showing everyone the server's clock.
     */
    const chip = dashboard.slice(
      dashboard.indexOf("Refreshed {") - 400,
      dashboard.indexOf("Refreshed {"),
    );
    expect(chip).toContain("suppressHydrationWarning");
  });

  it("formats dates through the shared formatter", () => {
    expect(dashboard).not.toContain("toLocaleDateString()");
    expect(dashboard).toContain("formatDate(");
  });
});

/**
 * The same hazard, across every client component in the admin app.
 *
 * A locale-dependent formatter in a server-rendered client component is a
 * hydration mismatch by construction, and the dashboard is unlikely to be the
 * only place somebody reaches for one.
 */
describe("BUG-1557 — the hazard does not spread", () => {
  function clientComponents(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) found.push(...clientComponents(path));
      else if (entry.endsWith(".tsx")) {
        const source = readFileSync(path, "utf8");
        if (/^\s*["']use client["']/.test(source)) found.push(path);
      }
    }
    return found;
  }

  const all = clientComponents(COMPONENTS);

  it("finds the components it is asserting over", () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it("no client component formats against an explicit undefined locale", () => {
    // `Intl.X(undefined, ...)` is the form that looks deliberate and is not:
    // it asks for the runtime's locale, which differs across the hydration
    // boundary. A bare `Intl.X({...})` is the same hazard but reads as an
    // oversight rather than a choice; this asserts the choice is never made.
    const offenders = all.filter((path) =>
      /Intl\.(NumberFormat|DateTimeFormat)\(undefined/.test(codeOnly(path)),
    );
    expect(offenders).toEqual([]);
  });
});
