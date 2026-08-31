import { requireSessionUser } from "@/lib/auth";
import { hasAnyPermission } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { ScheduledReportsList } from "../_components/scheduled-reports-list";
import {
  CAPABILITY_UNAVAILABLE_COPY,
  getReportingCapabilities,
} from "../_lib/reporting-capabilities";
import {
  fetchReportLibrary,
  fetchReportSchedules,
} from "../_lib/reporting-server";

/*
 * Scheduled reports.
 *
 * Four distinct states, each with its own message, because collapsing any two
 * of them produces a screen that is true about the wrong thing:
 *
 *   1. the scheduling service is not available in this build;
 *   2. it is, but this role cannot manage schedules;
 *   3. it is, this role can, and the listing failed;
 *   4. it is, this role can, and there are none.
 *
 * (4) is the one that must not be reachable by accident. "You have no
 * schedules" is a true sentence about a system that cannot have any, and the
 * next thing someone reading it does is stop checking whether the report they
 * were promised is arriving. So the section is also hidden from the reporting
 * sub-navigation whenever the capability is off.
 *
 * The report names come from the library, so a row reads "Headcount by
 * department" rather than "def:9f2c1a...". A failed library costs the rows
 * their names, not the page.
 */

export default async function ScheduledReportsPage() {
  const user = await requireSessionUser("/reports/scheduled");

  if (!hasAnyPermission(user.permissionKeys, [PERMISSION_KEYS.REPORTS_READ])) {
    return (
      <AccessDeniedState
        actionHref="/reports"
        actionLabel="Back to the reporting overview"
        description="Your role does not include access to the reporting workspace."
        title="Scheduled reports are unavailable for your account."
      />
    );
  }

  const capabilities = await getReportingCapabilities();

  if (!capabilities.schedule) {
    return (
      <SectionCard title="Scheduled reports">
        <EmptyState
          description={CAPABILITY_UNAVAILABLE_COPY.schedule.description}
          title={CAPABILITY_UNAVAILABLE_COPY.schedule.title}
        />
      </SectionCard>
    );
  }

  if (
    !hasAnyPermission(user.permissionKeys, [
      PERMISSION_KEYS.REPORTS_WRITE,
    ])
  ) {
    return (
      <SectionCard title="Scheduled reports">
        <EmptyState
          description="Scheduled delivery is available in this workspace, but your role does not include managing schedules. Ask an administrator to add you to a schedule's recipients."
          title="You cannot manage schedules"
        />
      </SectionCard>
    );
  }

  const [schedules, library] = await Promise.all([
    fetchReportSchedules(),
    fetchReportLibrary().catch(() => null),
  ]);

  if (schedules === null) {
    return (
      <SectionCard title="Scheduled reports">
        <EmptyState
          description="The schedule list could not be loaded. Nothing has been paused or deleted - existing schedules keep running while this page cannot show them."
          title="Your schedules could not be loaded"
        />
      </SectionCard>
    );
  }

  const reportNames = Object.fromEntries(
    [...(library?.standard ?? []), ...(library?.custom ?? [])].map((entry) => [
      entry.targetKey,
      entry.name,
    ]),
  );

  return (
    <SectionCard
      description="Each run executes under its owner's access and is delivered to named recipients, so a schedule never widens what anyone could see for themselves."
      title="Scheduled reports"
    >
      <ScheduledReportsList
        currentUserId={user.userId}
        reportNames={reportNames}
        schedules={schedules}
      />
    </SectionCard>
  );
}
