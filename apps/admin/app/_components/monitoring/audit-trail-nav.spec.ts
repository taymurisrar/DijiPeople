import { readFileSync } from "node:fs";
import path from "node:path";

/*
 * BUG-3564. The audit trail screen exists but is unreachable from the
 * monitoring tabs unless `MonitoringNav` links it — the exact shape of the
 * D4 finding that put "Provisioning queue" in this same list (a real screen,
 * reachable only by direct URL). Asserted against the source, matching
 * `monitoring-incident-link.spec.ts`: admin's jest is node-only with no
 * jsdom, so the property that matters — which href is wired into the nav
 * item list — is checked without a DOM.
 */
const SOURCE = readFileSync(path.join(__dirname, "monitoring-nav.tsx"), "utf8");

describe("MonitoringNav links the audit trail", () => {
  it("wires the audit trail route into the tab list", () => {
    expect(SOURCE).toMatch(
      /\["Audit trail",\s*"\/settings\/monitoring\/audit-logs"\]/,
    );
  });
});
