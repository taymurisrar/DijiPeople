import { readFileSync } from "node:fs";
import { join } from "node:path";

import { codeOnly } from "./source-scan";

const APP_ROOT = join(__dirname, "..");
/*
 * Comments stripped. The component's own doc comment promises "no placeholder
 * cards", which the placeholder assertion below would otherwise read as one.
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
 * What it was: four counters over the platform event stream (events /
 * succeeded / pending / failed), a list of event codes by source, and ten
 * recent events with timestamps. All real, none actionable. "Events (24h):
 * 4,182" is not a question a support agent has; "which customer is broken right
 * now" is — and the endpoint that answers it was already built and never called
 * from this page.
 *
 * These assertions are structural, over source, because `apps/admin` jest has
 * no jsdom ([[ITEM-0001]]). They pin the properties that make the page usable
 * rather than its appearance, which no test here can see.
 */
describe("monitoring overview", () => {
  it("reads the incident queue, not only the event stream", () => {
    /*
     * The single most important change. The incident data was on the wire from
     * `/platform/logs/events` — with metrics, filters and sorting — while this
     * page called `/platform/events/overview` and rendered counters from it.
     */
    expect(page).toContain("/platform/logs/events");
    expect(page).toContain("/platform/events/overview");
    // In parallel: two sequential awaits would double the page's latency for
    // no reason, on the screen somebody opens when something is wrong.
    expect(page).toContain("Promise.all");
  });

  it("makes every headline figure a link that applies its own filter", () => {
    /*
     * A count an agent has to go and rebuild a filter for is a count that costs
     * time to use. Four tiles, four hrefs, each carrying the query the incident
     * queue understands.
     */
    /*
     * Sliced by code landmarks, not by the comments that label the bands —
     * `codeOnly` removes those, and an index of -1 silently slices from the
     * start of the file, which is how a passing assertion can measure nothing.
     */
    const band = overview.slice(
      overview.indexOf("xl:grid-cols-4"),
      overview.indexOf("Incidents to pick up"),
    );
    expect(band.length).toBeGreaterThan(200);
    expect((band.match(/href=\{`\$\{QUEUE\}\?/g) ?? []).length).toBe(4);
    /*
     * The critical tile links to the *view*, not to a severity value.
     *
     * It used to link to `severity=CRITICAL&status=NEW`, and nothing in the
     * system stores "CRITICAL" — severity is free text holding ERROR and FATAL
     * in either case — so the destination returned 0 of 0 while the tile above
     * it counted 11 (BUG-1750). Asserted negatively as well, because the
     * failure mode is a link that looks plausible and filters on nothing.
     */
    expect(band).toContain("viewId=critical&status=NEW");
    expect(band).not.toContain("severity=CRITICAL");
    expect(band).toContain("status=NEW");
    expect(band).toContain("status=RESOLVED");
  });

  it("states what each figure means, not only what it counts", () => {
    // Colour is the second signal. Every tile carries a hint in words.
    const stat = overview.slice(overview.indexOf("function StatLink("));
    expect(stat).toContain("hint: string;");
    expect(stat).not.toContain("hint?: string");
  });

  it("offers filters and sorting over the incidents it shows", () => {
    for (const control of [
      'label="Severity"',
      'label="Source"',
      'label="Status"',
      "Search incidents",
      "monitoring-overview-sort",
    ]) {
      expect(overview).toContain(control);
    }
    for (const option of ["newest", "oldest", "severity"]) {
      expect(overview).toContain(`value="${option}"`);
    }
  });

  it("carries its filters into the full queue rather than stranding them", () => {
    /*
     * Narrowing here and continuing there has to be one action. Rebuilding the
     * same filter on the next screen is the friction this page exists to
     * remove, and it would be perverse to reintroduce it at the hand-off.
     */
    expect(overview).toContain("const queueHref = useMemo(");
    expect(overview).toContain('params.set("severity"');
    expect(overview).toContain('params.set("sourceApp"');
    expect(overview).toContain('params.set("status"');
    expect(overview).toContain('params.set("search"');
  });

  it("is honest that it shows a slice", () => {
    // The page asks for the most recent 25. Presenting that as the whole queue
    // would be a worse lie than showing nothing.
    expect(page).toContain("pageSize=25");
    expect(overview).toContain("most recent");
    expect(overview).toContain("Open in the full queue");
  });

  it("gives an agent the reference in one click", () => {
    // It is the thing they paste into a reply to the customer.
    expect(overview).toContain("copyReference");
    expect(overview).toContain("navigator.clipboard.writeText");
  });

  it("renders no counter that nobody acts on", () => {
    /*
     * "Succeeded" was a tile of its own. Nobody triages a success; it is the
     * denominator, and it now reads as one — "3 failed of 4,182 recorded".
     */
    expect(overview).not.toContain('label="Succeeded"');
    expect(overview).toContain("failed of");
  });

  it("has no placeholder or static content", () => {
    /*
     * Asserted by absence of the words such content is written with. Crude, and
     * it would have caught the integrations page's hardcoded "Review provider".
     *
     * "placeholder" is deliberately **not** in this list: it is a real HTML
     * attribute and the search box uses it. A smell test that flags correct
     * markup is a smell test somebody deletes.
     */
    for (const smell of ["Coming soon", "TODO", "Lorem ipsum", "Example "]) {
      expect(overview.toLowerCase()).not.toContain(smell.toLowerCase());
    }
  });

  it("says something useful when there is nothing to show", () => {
    // Two different empties: nothing matched the filter, and nothing exists.
    expect(overview).toContain("No incident matches these filters.");
    expect(overview).toContain("No incidents have been recorded.");
  });
});
