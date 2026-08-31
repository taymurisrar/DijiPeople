import { requireSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { MyReportsWorkspace } from "../_components/my-reports-workspace";
import { fetchReportLibrary } from "../_lib/reporting-server";

/*
 * The custom reports this person built or was given.
 *
 * Standard reports are deliberately absent. "My reports" that included every
 * built-in report would be the library under a different name, and the
 * distinction that matters on this page — what you can edit, duplicate and
 * delete — applies only to custom definitions.
 */

export default async function MyReportsPage() {
  const user = await requireSessionUser("/reports/my-reports");

  if (!hasAnyPermission(user.permissionKeys, [PERMISSION_KEYS.REPORTS_READ])) {
    return (
      <AccessDeniedState
        actionHref="/reports"
        actionLabel="Back to the reporting overview"
        description="Your role does not include access to the reporting workspace."
        title="Custom reports are unavailable for your account."
      />
    );
  }

  const library = await fetchReportLibrary().catch(() => null);

  if (!library) {
    return (
      <SectionCard title="My reports">
        <EmptyState
          description="The report library could not be loaded, so your custom reports cannot be listed. Nothing has been deleted - this is a failure of the library endpoint."
          title="Your reports could not be loaded"
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      description="Reports built in this workspace. A shared report still runs against each reader's own access, so sharing a report is not sharing the rows in it."
      title="My reports"
    >
      <MyReportsWorkspace
        canCreate={hasAnyPermission(user.permissionKeys, [
          PERMISSION_KEYS.REPORTS_BUILDER_USE,
          PERMISSION_KEYS.REPORTS_DEFINITIONS_MANAGE,
        ])}
        currentUserId={user.userId}
        entries={library.custom}
      />
    </SectionCard>
  );
}
