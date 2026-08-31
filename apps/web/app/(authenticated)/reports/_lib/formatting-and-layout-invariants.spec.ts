import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Two defects found only after the feature was deployed, both invisible to
 * every other test in this repository.
 *
 * `apps/web` runs jest in a node environment with no jsdom, so neither of these
 * can be caught by rendering. They are asserted against the source instead —
 * the same approach as the wiring invariants on the API side, and for the same
 * reason: the defect is an omission at a call site, so the call site is what
 * has to be checked.
 *
 * Both files are read with their real line endings normalised first. A regex
 * written against "\n" matches nothing in a CRLF checkout and everything on CI,
 * which turns a negative assertion into one that silently passes.
 */

const REPORTS_COMPONENTS = join(__dirname, "..", "_components");
const CHARTS = join(__dirname, "..", "..", "..", "components", "charts");

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => join(dir, name));
}

/**
 * Every call to a formatter that can render a date, a number or a currency has
 * to be handed the tenant's context.
 *
 * BUG-2647 / REG-384. Without it the formatters fall back to a module-level
 * default installed by an effect. Effects do not run on the server, so the
 * server rendered "Mar 10, 2025" and the browser rendered "03/10/2025"; React
 * called that a hydration mismatch and threw the tree away.
 *
 * The fix is not to make the default work on the server — a module-level
 * mutable default is shared across concurrent requests, so on a multi-tenant
 * server it could leak one tenant's formatting into another's response.
 * Passing the context explicitly is the architecture, and this test is what
 * keeps a new call site from opting out of it.
 */
describe("reporting formatters are always given the tenant context", () => {
  const CONTEXT_TAKING = [
    "formatRecordCell",
    "formatReportValue",
    "formatChartValue",
    "describeDelta",
  ];

  const files = [...tsxFiles(REPORTS_COMPONENTS), ...tsxFiles(CHARTS)];

  it("finds the call sites it claims to police", () => {
    // A source-scanning test that matches nothing passes for the wrong reason.
    const total = files.reduce((count, file) => {
      const source = read(file);
      return (
        count +
        CONTEXT_TAKING.reduce(
          (n, fn) => n + (source.split(`${fn}(`).length - 1),
          0,
        )
      );
    }, 0);
    expect(total).toBeGreaterThan(10);
  });

  it.each(CONTEXT_TAKING)("every %s call passes a context", (fn) => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = read(file);
      // The declaration itself, and the spec files, are not call sites.
      let index = source.indexOf(`${fn}(`);
      while (index !== -1) {
        // Take the balanced argument list following the call.
        let depth = 0;
        let end = index + fn.length;
        for (let i = index + fn.length; i < source.length; i += 1) {
          if (source[i] === "(") depth += 1;
          if (source[i] === ")") {
            depth -= 1;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        const call = source.slice(index, end + 1);
        // Only calls that pass an options object can carry a context; a call
        // with no options object at all is a plain value format.
        if (call.includes("{") && !call.includes("context")) {
          offenders.push(`${file.split(/[\/]/).pop()}: ${call.slice(0, 70)}`);
        }
        index = source.indexOf(`${fn}(`, end);
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * The reporting page wrappers must let their children shrink.
 *
 * BUG-2648 / REG-383. A grid item defaults to `min-width: auto` and refuses to
 * shrink below its content's min-content width, so the workspace header grew
 * the document 206px wider than a 1440px viewport instead of wrapping.
 */
describe("reporting page wrappers allow their grid children to shrink", () => {
  const WRAPPERS = [
    "reports-layout-shell.tsx",
    "analytics-surface-view.tsx",
    "my-reports-workspace.tsx",
    "report-builder-workspace.tsx",
    "report-list.tsx",
    "report-runner-view.tsx",
    "reports-landing.tsx",
    "scheduled-reports-list.tsx",
  ];

  it.each(WRAPPERS)("%s constrains its grid children", (file) => {
    const source = read(join(REPORTS_COMPONENTS, file));
    // The page-level wrapper is the first `grid gap-` container in the file.
    const match = source.match(/className="grid gap-\d[^"]*"/);
    const shell = source.match(/className="dp-theme-scope grid gap-\d[^"]*"/);
    const wrapper = shell?.[0] ?? match?.[0];

    expect(wrapper).toBeDefined();
    expect(wrapper).toContain("[&>*]:min-w-0");
  });
});
