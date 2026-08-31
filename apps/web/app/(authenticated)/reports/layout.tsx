import { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { ReportsLayoutShell } from "./_components/reports-layout-shell";
import type { ReportsNavItem } from "./_components/reports-nav";
import { ANALYTICS_SURFACES } from "./_lib/analytics-surfaces";
import { getReportingCapabilities } from "./_lib/reporting-capabilities";
import { fetchReportCatalog } from "./_lib/reporting-server";

/*
 * The sections of the reporting workspace, decided from what actually exists.
 *
 * Two of the five are conditional, and both conditions are about not offering a
 * control that cannot work:
 *
 * - **Analytics** points at a concrete surface, so it needs to know which
 *   surfaces this caller can reach. The catalog is already permission- and
 *   entitlement-filtered by the API, so an empty intersection means there is
 *   genuinely nothing to link to and the entry is omitted rather than pointing
 *   at a page that will only apologise.
 * - **Scheduled** needs the scheduling service to exist *and* this reader to be
 *   able to manage schedules. Before the endpoints landed, a Scheduled tab
 *   listing nothing would have read as "you have no schedules" rather than
 *   "this is not built yet"; now that they exist, a reader without
 *   `reports.schedule.manage` would reach a page that can only apologise.
 *
 * A catalog fetch that fails does not take the layout down: the sections that
 * do not depend on it still render, and the page beneath reports the failure
 * itself.
 */

export default async function ReportsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [catalog, capabilities, user] = await Promise.all([
    fetchReportCatalog().catch(() => []),
    getReportingCapabilities(),
    getSessionUser(),
  ]);

  const reachableSourceKeys = new Set(catalog.map((source) => source.key));

  const firstSurface = ANALYTICS_SURFACES.find((surface) =>
    surface.sourceKeys.some((key) => reachableSourceKeys.has(key)),
  );

  const navItems: ReportsNavItem[] = [
    { href: "/reports", label: "Overview", ariaLabel: "Reports overview" },
    ...(firstSurface
      ? [
          {
            href: `/reports/analytics/${firstSurface.key}`,
            label: "Analytics",
            ariaLabel: "Analytics surfaces",
          },
        ]
      : []),
    { href: "/reports/library", label: "Report library" },
    { href: "/reports/my-reports", label: "My reports" },
    /*
     * Two conditions, and they answer different questions. The capability says
     * the scheduling service exists at all; the permission says this reader can
     * manage schedules — `GET /reporting/schedules` requires
     * `reports.schedule.manage`, so without it the tab leads to a page that can
     * only apologise. The gate is a usability affordance, as every frontend
     * gate here is; the API refuses the request either way.
     */
    ...(capabilities.schedule &&
    hasAnyPermission(user?.permissionKeys ?? [], [
      PERMISSION_KEYS.REPORTS_WRITE,
    ])
      ? [{ href: "/reports/scheduled", label: "Scheduled" }]
      : []),
  ];

  return <ReportsLayoutShell navItems={navItems}>{children}</ReportsLayoutShell>;
}
