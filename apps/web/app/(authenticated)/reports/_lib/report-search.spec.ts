import {
  groupByCategory,
  matchesReportSearch,
  UNCATEGORISED_LABEL,
} from "./report-search";
import { isReportsNavItemActive, reportsNavSection } from "./reports-nav-model";
import type { ReportLibraryEntry } from "./reporting-types";

function entry(
  overrides: Partial<ReportLibraryEntry> & { name: string },
): ReportLibraryEntry {
  return {
    targetKey: `std:${overrides.name}`,
    description: "",
    category: "Workforce",
    sourceKey: "workforce",
    isStandard: true,
    canEdit: false,
    canDelete: false,
    ...overrides,
  };
}

describe("matchesReportSearch", () => {
  const headcount = entry({
    name: "Monthly summary",
    description: "Headcount by department, month by month.",
    category: "Attendance",
  });

  it("matches every term against any field, not all of them against one", () => {
    /*
     * "attendance monthly" should find a report called "Monthly summary" in the
     * Attendance category. Requiring one field to contain both words finds
     * nothing, which reads as a broken search rather than as no match.
     */
    expect(matchesReportSearch(headcount, "attendance monthly")).toBe(true);
  });

  it("requires every term to match something", () => {
    expect(matchesReportSearch(headcount, "attendance payroll")).toBe(false);
  });

  it("shows everything for an empty or whitespace-only search", () => {
    expect(matchesReportSearch(headcount, "")).toBe(true);
    expect(matchesReportSearch(headcount, "   ")).toBe(true);
  });

  it("ignores case", () => {
    expect(matchesReportSearch(headcount, "HEADCOUNT")).toBe(true);
  });

  it("tolerates a report with no description", () => {
    expect(matchesReportSearch(entry({ name: "Bare" }), "bare")).toBe(true);
  });
});

describe("groupByCategory", () => {
  it("sorts categories alphabetically and reports inside them by name", () => {
    const groups = groupByCategory([
      entry({ name: "Zulu", category: "Workforce" }),
      entry({ name: "Alpha", category: "Workforce" }),
      entry({ name: "Bravo", category: "Attendance" }),
    ]);

    expect(groups.map((group) => group.category)).toEqual([
      "Attendance",
      "Workforce",
    ]);
    expect(groups[1].entries.map((row) => row.name)).toEqual(["Alpha", "Zulu"]);
  });

  it("names the uncategorised bucket and puts it last", () => {
    /*
     * An empty category renders as a heading-shaped blank, which reads as a
     * rendering fault rather than as "these have no category".
     */
    const groups = groupByCategory([
      entry({ name: "Loose", category: "" }),
      entry({ name: "Placed", category: "Workforce" }),
    ]);

    expect(groups.map((group) => group.category)).toEqual([
      "Workforce",
      UNCATEGORISED_LABEL,
    ]);
  });

  it("returns nothing for nothing", () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe("the reporting sub-navigation's active rule", () => {
  it("lights Overview only on the overview itself", () => {
    /*
     * Every route in this workspace lives beneath `/reports`, so a `startsWith`
     * test leaves Overview lit on all five pages and the highlight stops
     * carrying information.
     */
    expect(isReportsNavItemActive("/reports", "/reports")).toBe(true);
    expect(isReportsNavItemActive("/reports/library", "/reports")).toBe(false);
    expect(
      isReportsNavItemActive("/reports/analytics/workforce", "/reports"),
    ).toBe(false);
  });

  it("keeps Analytics lit across every surface", () => {
    const href = "/reports/analytics/workforce";

    expect(isReportsNavItemActive("/reports/analytics/workforce", href)).toBe(true);
    /* The nav links one surface; standing on another must not un-light it. */
    expect(isReportsNavItemActive("/reports/analytics/attendance", href)).toBe(true);
  });

  it("ignores the query string, so a filter change does not un-light the tab", () => {
    expect(
      isReportsNavItemActive(
        "/reports/analytics/leave",
        "/reports/analytics/workforce?preset=this_month&dept=Engineering",
      ),
    ).toBe(true);
  });

  it("does not confuse one section with another", () => {
    expect(isReportsNavItemActive("/reports/library", "/reports/my-reports")).toBe(
      false,
    );
    /*
     * The current path never carries a query — `usePathname()` returns the path
     * alone — but the href does, which is the side the stripping is needed on.
     */
    expect(
      isReportsNavItemActive("/reports/library", "/reports/library?target=std:x"),
    ).toBe(true);
  });

  it("reduces an href to its section", () => {
    expect(reportsNavSection("/reports/analytics/workforce")).toBe(
      "/reports/analytics",
    );
    expect(reportsNavSection("/reports/library")).toBe("/reports/library");
  });
});
