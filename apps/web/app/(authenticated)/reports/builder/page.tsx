import { requireSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { ReportBuilderWorkspace } from "../_components/report-builder-workspace";
import { fetchReportCatalog } from "../_lib/reporting-server";

/*
 * The report builder.
 *
 * Two permissions apply and they are different questions:
 * `reports.builder.use` gates `/reporting/builder-fields`, which is what fills
 * the field pickers; `reports.definitions.manage` gates `POST
 * /reporting/reports`, which is what saves. Someone with only the first can
 * explore what is available but cannot save, so the page requires both rather
 * than rendering a builder whose Save button is guaranteed to be refused.
 *
 * The source list comes from the catalog, which is already filtered to what
 * this caller can reach — so the builder cannot offer a data source whose
 * fields the next request will refuse to return.
 */

type PageProps = {
  searchParams?: Promise<{ source?: string }>;
};

export default async function ReportBuilderPage({ searchParams }: PageProps) {
  const [resolved, user] = await Promise.all([
    searchParams ? searchParams : Promise.resolve({} as { source?: string }),
    requireSessionUser("/reports/builder"),
  ]);

  const canBuild = hasAnyPermission(user.permissionKeys, [
    PERMISSION_KEYS.REPORTS_CREATE,
  ]);
  const canSave = hasAnyPermission(user.permissionKeys, [
    PERMISSION_KEYS.REPORTS_WRITE,
  ]);

  if (!canBuild || !canSave) {
    return (
      <AccessDeniedState
        actionHref="/reports"
        actionLabel="Back to the reporting overview"
        description={
          canBuild
            ? "Your role can explore the report builder's fields but cannot save a report definition, so there would be nothing to do here. Saving needs the report definitions permission."
            : "Your role does not include building custom reports. The standard reports in the library are still available to you."
        }
        title="The report builder is unavailable for your account."
      />
    );
  }

  const catalog = await fetchReportCatalog();

  return (
    <ReportBuilderWorkspace
      defaultSourceKey={resolved.source}
      sources={catalog}
    />
  );
}
