import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * BUG-1419. Every incident title on the monitoring overview linked to
 * `${QUEUE}/${incident.id}` — a record route composed under a constant that
 * names the *queue*. No dynamic segment has ever existed under
 * `settings/monitoring`, so all of them were links to a 404.
 *
 * With 1,495 incidents recorded, one critical and none ever resolved, the queue
 * could be counted and sorted and never worked. The "0 resolved" figure read as
 * a backlog when it was the absence of a working tool.
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
 * The same shape as a bug record breaking a link check by quoting a wikilink.
 */
const SOURCE = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("monitoring incidents link somewhere that exists", () => {
  it("does not compose a record route under the queue constant", () => {
    /*
     * `${QUEUE}/${...}` is the shape that 404s. A query string under the same
     * constant is fine, which is why this matches a slash specifically.
     */
    expect(SOURCE).not.toMatch(/\$\{QUEUE\}\/\$\{/);
  });

  it("carries the incident's reference number to the queue", () => {
    expect(SOURCE).toContain("incident.referenceNumber");
    expect(SOURCE).toMatch(/\$\{QUEUE\}\?search=/);
  });

  it("still reads the reference number the API returns", () => {
    // Guards the guard: if the field were renamed, the assertion above would
    // pass against a link that no longer resolves to anything. Read from the
    // raw source, since the type declaration is not inside a comment.
    expect(RAW).toMatch(/referenceNumber:\s*string/);
  });
});
