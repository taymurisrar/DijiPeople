import { readFileSync } from "node:fs";
import { join } from "node:path";

import { codeOnly } from "./source-scan";

const APP_ROOT = join(__dirname, "..");
/*
 * Comments stripped. The component's own doc comment describes what was
 * removed, which the absence assertions below would otherwise read as code.
 */
const overview = codeOnly(
  readFileSync(
    join(APP_ROOT, "app/_components/monitoring/monitoring-overview.tsx"),
    "utf8",
  ),
);
const page = readFileSync(
  join(APP_ROOT, "app/(internal)/settings/monitoring/page.tsx"),
  "utf8",
);

/**
 * The monitoring landing page, as a place to start work.
 *
 * These assertions are structural, over source, because `apps/admin` jest has
 * no jsdom ([[ITEM-0001]]). They pin the properties that make the page usable
 * rather than its appearance, which no test here can see.
 */
describe("monitoring overview", () => {
  it("reads the incident queue and the event stream, in parallel", () => {
    expect(page).toContain("/platform/logs/events");
    expect(page).toContain("/platform/events/overview");
    expect(page).toContain("Promise.all");
  });

  it("lists the open incidents, most recently active first", () => {
    expect(page).toContain("status=UNRESOLVED");
    expect(page).toContain("sortBy=lastSeen");
  });

  it("makes every headline figure a link that applies its own filter", () => {
    const band = overview.slice(
      overview.indexOf("xl:grid-cols-4"),
      overview.indexOf("Latest unresolved incidents"),
    );
    expect(band.length).toBeGreaterThan(200);
    expect((band.match(/<StatLink/g) ?? []).length).toBe(4);
    /*
     * The critical tile counts critical-and-open and links to exactly that.
     * It used to show every critical incident ever recorded while linking to
     * critical-and-new, and before that to `severity=CRITICAL`, a value no
     * row stores (BUG-1750).
     */
    expect(band).toContain("value={metrics.criticalOpen}");
    expect(band).toContain("severity=critical&status=UNRESOLVED");
    expect(band).not.toContain("severity=CRITICAL");
    expect(band).toContain("value={metrics.open}");
    expect(band).toContain("status=RESOLVED");
  });

  it("states what each figure means, not only what it counts", () => {
    const stat = overview.slice(overview.indexOf("function StatLink("));
    expect(stat).toContain("hint: string;");
    expect(stat).not.toContain("hint?: string");
  });

  it("is no longer a second, weaker error log", () => {
    /*
     * It used to filter and sort its slice in the browser, with options that
     * matched no stored value. Filtering is the error log's job, on the
     * server; this page links there.
     */
    expect(overview).not.toContain("useState");
    expect(overview).not.toContain("<select");
    expect(overview).toContain("Open the error log");
  });

  it("renders no counter that nobody acts on", () => {
    expect(overview).not.toContain('label="Succeeded"');
    expect(overview).toContain("failed of");
  });

  it("has no placeholder or static content", () => {
    for (const smell of ["Coming soon", "TODO", "Lorem ipsum", "Example "]) {
      expect(overview.toLowerCase()).not.toContain(smell.toLowerCase());
    }
  });

  it("says something useful when there is nothing to show", () => {
    expect(overview).toContain("No unresolved incidents.");
    expect(overview).toContain("No platform events in the last 24 hours.");
  });
});
