import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * ITEM-0167 — enforces
 * `docs/architecture/record-page-layout-contract.md`'s MUST #1: a record
 * page renders through `ModuleRecordPage`, `StandardModuleRecordPage`, or a
 * wrapper already known to call one of them, not a hand-rolled page frame.
 *
 * This is a source-text check, not a render test — this app's jest has no
 * jsdom (see `jest.config.js`'s own comment), so "does this page use the
 * shared shell" is checked by looking for the shell component's name in the
 * page's own source rather than rendering it. Every currently-conformant
 * page checked while writing this test imports `StandardModuleRecordPage`
 * (or, for the employee page, `EmployeeRuntimeFormWrapper`) directly in the
 * `page.tsx` file itself — none of them bury it behind a second, unnamed
 * layer of indirection — so a direct source-text search is accurate today
 * without needing to follow imports.
 *
 * Scope: top-level record **detail** routes outside `settings/` and
 * `reports/`, which are governed by their own, separately documented
 * contracts (the settings runtime; the Reports & Analytics platform) rather
 * than this one. Edit-mode (`/edit/`) routes are not yet in this check's
 * scope — see the History note in `docs/architecture/record-page-layout-contract.md`
 * for what that leaves open.
 *
 * Adding a new bespoke record page? Either make it import one of
 * `SHELL_MARKERS`, or add it to `JUSTIFIED_EXCEPTIONS` with a real reason —
 * silently leaving it off both lists is what this test exists to catch.
 */

const AUTHENTICATED_ROOT = join(__dirname, "..");

const SHELL_MARKERS = [
  "StandardModuleRecordPage",
  "ModuleRecordPage",
  "EmployeeRuntimeFormWrapper",
] as const;

/**
 * Record detail routes that already render through the shared shell,
 * verified by reading each file while writing this test.
 */
const CONFORMING_ROUTES = [
  "approvals/[approvalId]/page.tsx",
  "attendance/[entryId]/page.tsx",
  "benefits/assignments/[id]/page.tsx",
  "customers/[customerId]/page.tsx",
  // BUG-3494 — one route for every published custom module.
  "custom-modules/[moduleKey]/[recordId]/page.tsx",
  "employee-bank-accounts/[id]/page.tsx",
  "employees/[employeeId]/page.tsx",
  "leaves/[id]/page.tsx",
  "loans/[id]/page.tsx",
  "payroll/calendars/[calendarId]/page.tsx",
  "payroll/cycles/[cycleId]/page.tsx",
  "payroll/employee-compensation/[compensationId]/page.tsx",
  "payroll/periods/[periodId]/page.tsx",
  "projects/[projectId]/page.tsx",
  "recruitment/applications/[applicationId]/page.tsx",
  "recruitment/candidates/[candidateId]/page.tsx",
  "recruitment/jobs/[jobId]/page.tsx",
] as const;

/**
 * Bespoke record detail routes, each with the reason it does not (yet, or
 * ever) render through `ModuleRecordPage`. `EXECPLAN-0044` is the migration
 * plan for the "not yet migrated" ones; the others are structural exceptions
 * from `docs/architecture/record-page-layout-contract.md`'s "Documented
 * exceptions" table.
 */
const JUSTIFIED_EXCEPTIONS: Record<string, string> = {
  "custom-modules/[moduleKey]/page.tsx":
    "Not a record page (BUG-3494): the list route of a published custom module. Its dynamic segment is the module key, not a record id; it renders StandardModuleListPage, and the module's record route is listed as conforming.",
  "attendance/corrections/[id]/page.tsx":
    "Structural exception (record-page-layout-contract.md): a single-decision approval screen, not a browsable record with tabs.",
  "attendance/exceptions/[id]/page.tsx":
    "Structural exception (record-page-layout-contract.md): a single-decision approval screen, not a browsable record with tabs.",
  "business-trips/[tripId]/page.tsx":
    "Not yet migrated — EXECPLAN-0044 wave 2 (claims, loans and business trips).",
  "claims/[claimId]/page.tsx":
    "Not yet migrated — EXECPLAN-0044 wave 2 (claims, loans and business trips).",
  "inbox/[notificationId]/page.tsx":
    "Not yet migrated — EXECPLAN-0044 wave 5 (inbox).",
  "me/business-trips/[tripId]/page.tsx":
    "Not yet migrated — EXECPLAN-0044 wave 2 (claims, loans and business trips).",
  "me/claims/[claimId]/page.tsx":
    "Not yet migrated — EXECPLAN-0044 wave 2 (claims, loans and business trips).",
  "me/payslips/[payslipId]/page.tsx":
    "Structural exception (record-page-layout-contract.md): a generated, immutable document view, not a field-and-tab record.",
  "onboarding/[onboardingId]/page.tsx":
    "Not yet migrated — EXECPLAN-0044 wave 4 (onboarding and recruitment drafts).",
  "payroll/payslips/[payslipId]/page.tsx":
    "Structural exception (record-page-layout-contract.md): a generated, immutable document view, not a field-and-tab record.",
  "payroll/runs/[runId]/page.tsx":
    "Structural exception (record-page-layout-contract.md): a process wizard (calculate/review/lock/post), not a field-and-tab record.",
  "recruitment/employee-drafts/[employeeId]/page.tsx":
    "Not yet migrated — EXECPLAN-0044 wave 4 (onboarding and recruitment drafts).",
  "timesheets/[timesheetId]/page.tsx":
    "Not yet migrated — EXECPLAN-0044 wave 1 (attendance and timesheets).",
};

function usesSharedShell(relativePath: string): boolean {
  const source = readFileSync(join(AUTHENTICATED_ROOT, relativePath), "utf8");
  return SHELL_MARKERS.some((marker) => source.includes(marker));
}

/*
 * Excluded outright: `settings/` (its own runtime and contract —
 * docs/architecture/settings-and-branding.md), `reports/` (the Reports &
 * Analytics platform's own surface), and any `/edit/` or `/new/` route
 * (edit-mode and create routes are not yet in this check's scope — see the
 * layout contract's note on what this leaves open).
 */
const EXCLUDED_TOP_LEVEL = new Set(["settings", "reports"]);

/** Every `.../[segment]/page.tsx` under `app/(authenticated)`, minus the exclusions above. */
function discoverRecordDetailRoutes(): string[] {
  const routes: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.name !== "page.tsx") continue;

      const relativePath = relative(AUTHENTICATED_ROOT, fullPath).split(sep).join("/");
      const segments = relativePath.split("/");
      const topLevel = segments[0];
      if (topLevel && EXCLUDED_TOP_LEVEL.has(topLevel)) continue;
      if (segments.includes("edit") || segments.includes("new")) continue;
      // A record *detail* route has a dynamic segment as its immediate parent.
      const parent = segments[segments.length - 2] ?? "";
      if (!parent.startsWith("[") || !parent.endsWith("]")) continue;

      routes.push(relativePath);
    }
  }

  walk(AUTHENTICATED_ROOT);
  return routes.sort();
}

describe("record page layout contract (ITEM-0167)", () => {
  it("every conforming route actually imports a shell marker (no stale claim)", () => {
    const staleClaims = CONFORMING_ROUTES.filter(
      (route) => !usesSharedShell(route),
    );
    expect(staleClaims).toEqual([]);
  });

  it("every justified exception is still actually bespoke (no stale exception)", () => {
    const staleExceptions = Object.keys(JUSTIFIED_EXCEPTIONS).filter((route) =>
      usesSharedShell(route),
    );
    expect(staleExceptions).toEqual([]);
  });

  it("the reference page (employees) renders through the shared shell", () => {
    expect(usesSharedShell("employees/[employeeId]/page.tsx")).toBe(true);
  });

  it("no route is both a declared conformer and a declared exception", () => {
    const overlap = CONFORMING_ROUTES.filter((route) =>
      Object.prototype.hasOwnProperty.call(JUSTIFIED_EXCEPTIONS, route),
    );
    expect(overlap).toEqual([]);
  });

  it("every justified exception carries a non-empty reason", () => {
    const unreasoned = Object.entries(JUSTIFIED_EXCEPTIONS)
      .filter(([, reason]) => reason.trim().length === 0)
      .map(([route]) => route);
    expect(unreasoned).toEqual([]);
  });

  /*
   * The check that actually catches a brand-new bespoke page. Every record
   * detail route the filesystem contains today (outside settings/ and
   * reports/, and outside /edit/ and /new/) must be named on one of the two
   * lists above — a route that is on neither, because someone added a page
   * and never ran this test, fails here with its own path in the message.
   */
  it("classifies every discovered record detail route as conforming or a justified exception", () => {
    const discovered = discoverRecordDetailRoutes();
    const known = new Set([
      ...CONFORMING_ROUTES,
      ...Object.keys(JUSTIFIED_EXCEPTIONS),
    ]);
    const unclassified = discovered.filter((route) => !known.has(route));
    expect(unclassified).toEqual([]);
  });

  it("no known route has disappeared from the filesystem (a stale list entry)", () => {
    const discovered = new Set(discoverRecordDetailRoutes());
    const vanished = [
      ...CONFORMING_ROUTES,
      ...Object.keys(JUSTIFIED_EXCEPTIONS),
    ].filter((route) => !discovered.has(route));
    expect(vanished).toEqual([]);
  });
});
