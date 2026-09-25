import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * BUG-3564. The "related audit events" panel in the incident detail view now
 * links a platform-scope row to the audit trail screen. There is no
 * per-record route under `settings/monitoring/audit-logs` — only a list
 * screen with client-side filters — so a link built as
 * `${AUDIT_TRAIL}/${event.id}` would be exactly the BUG-1419 shape this file
 * already has a regression test for (`monitoring-incident-link.spec.ts`): a
 * record route composed under a screen that has none. The correct link
 * filters the list by this incident's own trace id instead, since that is
 * the id `relatedAuditEvents` was queried by in the first place.
 */
const RAW = readFileSync(path.join(__dirname, "error-logs-table.tsx"), "utf8");
const SOURCE = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("the related-audit-events link does not compose a record route that does not exist", () => {
  it("does not link under audit-logs by event id", () => {
    expect(SOURCE).not.toMatch(/audit-logs\/\$\{event\.id\}/);
  });

  it("filters the audit trail list by this incident's own trace id", () => {
    expect(SOURCE).toMatch(
      /\/settings\/monitoring\/audit-logs\?traceId=\$\{encodeURIComponent\(log\.referenceNumber\)\}/,
    );
  });

  it("still reads the field the API actually returns for scope", () => {
    expect(RAW).toMatch(/scope:\s*"tenant"\s*\|\s*"platform"/);
  });
});
