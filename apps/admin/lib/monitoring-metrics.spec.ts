import { readFileSync } from "node:fs";
import { join } from "node:path";

import { codeOnly } from "./source-scan";

const APP_ROOT = join(__dirname, "..");
const table = codeOnly(
  readFileSync(
    join(APP_ROOT, "app/_components/monitoring/error-logs-table.tsx"),
    "utf8",
  ),
);
const sidebar = readFileSync(
  join(APP_ROOT, "app/_components/admin-sidebar.tsx"),
  "utf8",
);

/**
 * The error log's summary row, and how an operator reaches it.
 *
 * History: "Matching incidents 12,005", "Error severity 488", "Open
 * investigations 12,005" — a column name used as a quantity, one figure under
 * two names, nothing clickable. The next version made each card a filter, but
 * two of them filtered on values no row stores (`severity=CRITICAL`,
 * `sourceApp=WEB`) and so emptied the table when pressed.
 */
describe("monitoring", () => {
  describe("where the sidebar lands", () => {
    it("opens the area on its Overview, not on the incident queue", () => {
      expect(sidebar).toContain(
        'moduleItem("monitoring-incidents", "Monitoring", "/settings/monitoring")',
      );
    });

    it("still lets a module use its own route by default", () => {
      expect(sidebar).toContain("href: href ?? definition.routeBase");
    });
  });

  describe("the summary cards", () => {
    const row = table.slice(
      table.indexOf("<MetricCard"),
      table.indexOf("</section>"),
    );

    it("finds the card row", () => {
      // An index of -1 silently slices from the start of the file.
      expect(row.length).toBeGreaterThan(200);
    });

    it("labels each card with what it counts", () => {
      for (const label of [
        "Errors",
        "Critical",
        "Warning",
        "Unresolved",
        "Resolved",
      ]) {
        expect(row).toContain(`label="${label}"`);
      }
    });

    it("makes every card a filter", () => {
      expect((row.match(/<MetricCard/g) ?? []).length).toBe(5);
      expect((row.match(/onClick=/g) ?? []).length).toBe(5);
    });

    it("filters on values the API understands, never on a stored spelling", () => {
      // The groups and the UNRESOLVED predicate are the API's own vocabulary
      // (error-log-query.ts); "CRITICAL" and "WEB" matched no stored row.
      expect(row).toContain('"critical"');
      expect(row).toContain('"warning"');
      expect(row).toContain('"UNRESOLVED"');
      expect(row).not.toContain('"CRITICAL"');
      expect(table).not.toContain('"WEB"');
    });

    it("lets a filter be cleared by pressing its card again", () => {
      expect(row).toContain(
        'filters.severity === "critical" ? null : "critical"',
      );
      expect(row).toContain(
        'filters.status === "UNRESOLVED" ? null : "UNRESOLVED"',
      );
    });

    it("marks the card whose filter is in force, in text as well as colour", () => {
      expect(table).toContain("aria-pressed={active}");
      expect(table).toContain("Filtering");
    });

    it("states the window the counts were taken over", () => {
      expect(table).toContain("describePeriod(filters)");
      expect(table).toContain("caption={periodLabel}");
    });
  });

  describe("the controls", () => {
    it("reads filter options from the data, not from a hardcoded list", () => {
      for (const facet of [
        "facets?.sourceApps",
        "facets?.environments",
        "facets?.modules",
        "facets?.tenants",
      ]) {
        expect(table).toContain(facet);
      }
      // "staging" was offered and no row has ever had it.
      expect(table).not.toContain('"staging"');
    });

    it("chooses a tenant by name, never by typing an id", () => {
      expect(table).toContain("label: tenant.name");
      expect(table).not.toContain('label="Tenant ID"');
      expect(table).not.toContain('label="User ID"');
    });

    it("has no control that only pretended to work", () => {
      // Export covered the visible page only; the diagnostics download hit a
      // tenant-scoped endpoint that refuses platform users.
      expect(table).not.toContain("exportCsv");
      expect(table).not.toContain("/api/error-logs/");
    });

    it("uses the shared table, and opens a row into the detail drawer", () => {
      expect(table).toContain("<ProDataTable");
      expect(table).toContain("onRowClick=");
      expect(table).toContain("<IncidentDrawer");
      expect(table).not.toContain("renderExpandedRow");
    });

    it("has a loading, an empty and a filtered-empty state", () => {
      expect(table).toContain("loading={isPending}");
      expect(table).toContain("No errors match these filters");
      expect(table).toContain("No errors recorded");
    });
  });
});
