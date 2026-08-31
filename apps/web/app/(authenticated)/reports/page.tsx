import { requireSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../_components/access-denied-state";
import {
  getBusinessUnitAccessSummary,
  hasBusinessUnitScope,
} from "../_lib/business-unit-access";
import { ReportsLanding } from "./_components/reports-landing";
import { ANALYTICS_SURFACES } from "./_lib/analytics-surfaces";
import {
  fetchFavorites,
  fetchRecents,
  fetchReportCatalog,
  fetchReportLibrary,
} from "./_lib/reporting-server";

/*
 * The reporting overview.
 *
 * This replaces a page that fetched four fixed `/reports/*-summary` endpoints
 * and rendered them as stat cards and bar lists — no period, no comparison, no
 * filters, no drill-down, and a bar list that scaled every bar against the
 * largest value rather than the total. It was, precisely, the dashboard with
 * more cards.
 *
 * What is here instead is a way in: the analytics surfaces this caller can
 * actually reach, the reports they pinned, the ones they opened recently, and
 * the library grouped by category. The surfaces are intersected with
 * `/reporting/catalog` so nobody is offered a link to a page that will only
 * tell them they cannot see it.
 */

export default async function ReportsPage() {
  const [user, businessUnitAccess] = await Promise.all([
    requireSessionUser("/reports"),
    getBusinessUnitAccessSummary(),
  ]);

  /*
   * Kept from the page this replaces. Business-unit scope is a separate axis
   * from the reporting permission: a user can hold `reports.read` and still
   * have no business unit through which any record is visible, and the honest
   * rendering of that is "there is nothing for you to report on", not an empty
   * chart.
   */
  if (!hasBusinessUnitScope(businessUnitAccess)) {
    return (
      <AccessDeniedState
        description="Your current business-unit scope does not include any reportable records, so every report would be empty."
        title="Reports are unavailable for your current business unit access."
      />
    );
  }

  if (!hasAnyPermission(user.permissionKeys, [PERMISSION_KEYS.REPORTS_READ])) {
    return (
      <AccessDeniedState
        description="Your role does not include access to the reporting workspace. Reporting access is granted separately from the modules it reports on, so being able to see employees or attendance does not by itself grant it."
        title="The reporting workspace is unavailable for your account."
      />
    );
  }

  const [catalog, library, favorites, recents] = await Promise.all([
    fetchReportCatalog().catch(() => []),
    /*
     * The library and the surfaces fail independently. A failed library should
     * not hide the analytics surfaces, which are the more useful half of this
     * page and are driven by a different endpoint.
     */
    fetchReportLibrary().catch(() => null),
    fetchFavorites(),
    fetchRecents(),
  ]);

  const reachable = new Set(catalog.map((source) => source.key));

  const surfaces = ANALYTICS_SURFACES.filter((surface) =>
    surface.sourceKeys.some((key) => reachable.has(key)),
  ).map((surface) => ({
    key: surface.key,
    label: surface.label,
    description: surface.description,
    versusDashboard: surface.versusDashboard,
  }));

  return (
    <ReportsLanding
      canCreate={hasAnyPermission(user.permissionKeys, [
        PERMISSION_KEYS.REPORTS_BUILDER_USE,
        PERMISSION_KEYS.REPORTS_DEFINITIONS_MANAGE,
      ])}
      custom={library?.custom ?? []}
      favorites={favorites}
      libraryAvailable={library !== null}
      recents={recents}
      standard={library?.standard ?? []}
      surfaces={surfaces}
    />
  );
}
