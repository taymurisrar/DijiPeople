import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * BUG-1419. Every incident title on the monitoring overview linked to
 * `${QUEUE}/${incident.id}` — a record route composed under a constant that
 * names the *queue*. No dynamic segment has ever existed under
 * `settings/monitoring`, so all of them were links to a 404.
 *
 * The incident now opens in the error log's detail drawer, which is addressed
 * by a query parameter on the queue, not by a path segment.
 *
 * Asserted against the source rather than by rendering, because admin's jest is
 * node-only with no jsdom. The property that matters is which href is composed,
 * and that is visible without a DOM.
 */

const RAW = readFileSync(
  path.join(__dirname, "monitoring-overview.tsx"),
  "utf8",
);

/*
 * Comments are stripped before scanning, for the reason REG-262 records about
 * the worktree guard: the fix explains the broken href in its own comment, so
 * the sentence that prevents the mistake would fail the check that enforces it.
 */
const SOURCE = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("monitoring incidents link somewhere that exists", () => {
  it("does not compose a record route under the queue constant", () => {
    // `${QUEUE}/${...}` is the shape that 404s; a query string is fine.
    expect(SOURCE).not.toMatch(/\$\{QUEUE\}\/\$\{/);
  });

  it("opens the incident's drawer in the queue by its reference number", () => {
    expect(SOURCE).toContain("incident.referenceNumber");
    expect(SOURCE).toMatch(
      /\$\{QUEUE\}\?[^`]*\$\{INCIDENT_PARAM\}=\$\{encodeURIComponent\(incident\.referenceNumber\)\}/,
    );
  });

  it("still reads the reference number the API returns", () => {
    // Guards the guard: if the field were renamed, the assertion above would
    // pass against a link that no longer resolves to anything.
    expect(RAW).toMatch(/referenceNumber:\s*string/);
  });
});
