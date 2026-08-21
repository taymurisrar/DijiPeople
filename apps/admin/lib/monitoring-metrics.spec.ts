import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..");
const table = readFileSync(
  join(APP_ROOT, "app/_components/monitoring/error-logs-table.tsx"),
  "utf8",
);
const sidebar = readFileSync(
  join(APP_ROOT, "app/_components/admin-sidebar.tsx"),
  "utf8",
);

/**
 * The incident queue's summary row, and how an operator reaches it.
 *
 * What was here: "Matching incidents 12,005", "Error severity 488", "Web app
 * incidents 524", "Open investigations 12,005", "Resolved incidents 0" — with
 * the sidebar linking straight past the Overview into that queue.
 *
 * Three distinct faults. "Error severity" is a column name, not a quantity.
 * "Open investigations" equalled the total because every sanitized incident
 * starts NEW, so one figure appeared twice under two names and neither said
 * which was the queue. And nothing was clickable, so learning that 488 were
 * critical left the reader to rebuild that filter by hand.
 */
describe("monitoring", () => {
  describe("where the sidebar lands", () => {
    it("opens the area on its Overview, not on the incident queue", () => {
      /*
       * `routeBase` is where a module's *records* live — the right answer for
       * the runtime record routes built from it, and the wrong one for an
       * area's landing page. An override rather than a changed `routeBase`,
       * because changing it would break `/settings/monitoring/error-logs/<id>`.
       */
      expect(sidebar).toContain(
        'moduleItem("monitoring-incidents", "Monitoring", "/settings/monitoring")',
      );
    });

    it("still lets a module use its own route by default", () => {
      // The override is opt-in; every other module keeps `routeBase`.
      expect(sidebar).toContain("href: href ?? definition.routeBase");
    });
  });

  describe("the summary tiles", () => {
    const row = table.slice(
      table.indexOf('<section className="grid gap-3 sm:grid-cols-2'),
      table.indexOf("</section>"),
    );

    it("labels each tile with what it counts", () => {
      for (const label of [
        "Incidents in view",
        "Critical",
        "From the web app",
        "Not yet triaged",
        "Resolved",
      ]) {
        expect(row).toContain(`label="${label}"`);
      }
    });

    it("no longer labels a count with the name of a column", () => {
      // "Error severity: 488" counted criticals.
      expect(table).not.toContain('label="Error severity"');
      // And "Open investigations" was the total under a second name.
      expect(table).not.toContain('label="Open investigations"');
    });

    it("makes every tile a filter", () => {
      /*
       * A metric that cannot be acted on is decoration. Five `onClick` handlers,
       * one per tile — asserted by count so a tile added without one fails here.
       */
      expect((row.match(/onClick=/g) ?? []).length).toBe(5);
      expect((row.match(/scope=\{windowLabel\}/g) ?? []).length).toBe(5);
    });

    it("lets a filter be cleared by pressing its tile again", () => {
      // A toggle, not a one-way trip into a filter with no marked way out.
      expect(row).toContain(
        'filters.severity === "CRITICAL" ? null : "CRITICAL"',
      );
      expect(row).toContain('filters.status === "NEW" ? null : "NEW"');
    });

    it("marks the tile whose filter is in force, in text as well as colour", () => {
      expect(row).toContain("active={filters.severity");
      expect(table).toContain("aria-pressed={active}");
      expect(table).toContain("`Filtering · ${scope}`");
    });

    it("states the window every count was taken over", () => {
      /*
       * A count with no scope is a number. "12,005" read as a workload rather
       * than as everything ever recorded, which is the difference between a
       * queue and a firehose.
       */
      expect(table).toContain("const windowLabel =");
      for (const label of [
        "last 24 hours",
        "last 7 days",
        "last 30 days",
        "selected dates",
        "all time",
      ]) {
        expect(table).toContain(`"${label}"`);
      }
    });

    it("requires a scope on every tile, so one cannot be added without it", () => {
      const card = table.slice(table.indexOf("function SummaryCard("));
      expect(card).toContain("scope: string;");
      expect(card).not.toContain("scope?: string");
    });
  });
});
